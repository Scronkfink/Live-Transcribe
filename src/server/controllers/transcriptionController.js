const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');
const { convertTxtToPdf, convertTxtToWord } = require('./conversionUtils.js');
const twilio = require('twilio');
const User = require('../models/userModel.js');
require('dotenv').config();

const transcriptionController = {};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') });

const getAudioLengthFromTwilio = async (recordingUrl) => {
  const recordingSid = recordingUrl.split('/').pop();
  const recording = await client.recordings(recordingSid).fetch();
  return recording.duration;
};

transcriptionController.twilioTranscribe = async (req, res, next) => {
  console.log("In transcriptionController.twilioTranscribe(5/7)");

  const phoneNumber = res.locals.number;

  try {
    const user = await User.findOne({ phone: phoneNumber });
    res.locals.user = user.name;
    res.locals.email = user.email;

    if (user && user.transcriptions.length > 0) {
      const latestTranscription = user.transcriptions[user.transcriptions.length - 1];
      const audioUrls = latestTranscription.audioUrls; // Updated to handle multiple audio URLs
      const subjectUrl = latestTranscription.subjectUrl;

      if (audioUrls && subjectUrl) {
        const downloadAudio = async (url, filename) => {
          const response = await axios({
            method: 'GET',
            url,
            responseType: 'stream',
            auth: {
              username: accountSid,
              password: authToken
            }
          });

          const outputPath = path.join(os.tmpdir(), filename);
          const writer = fs.createWriteStream(outputPath);

          response.data.pipe(writer);

          return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(outputPath));
            writer.on('error', reject);
          });
        };

        // Transcribe the subject audio file first
        setTimeout(async () => {
          try {
            const subjectPath = await downloadAudio(subjectUrl, `subject-${user.phone}-${Date.now()}.mp3`);
            res.locals.subjectPath = subjectPath;
            console.log("Transcribing subject(5/6), CAPT'N!");
            await transcribeAudio(req, res, 'subjectTranscription', subjectPath);

            const subjectTxtFilePath = res.locals.subjectTranscription;
            const subjectData = fs.readFileSync(subjectTxtFilePath, 'utf8').trim();

            await User.updateOne(
              { phone: phoneNumber },
              { 
                $set: { 
                  "transcriptions.$[elem].subject": subjectData.replace(/\r\n/g, '').trim()
                } 
              },
              { arrayFilters: [{ "elem.subject": subjectUrl }] }
            );

            // Initialize arrays for storing transcription paths for PDF and Word documents
            res.locals.transcriptionPdfPaths = [];
            res.locals.transcriptionWordPaths = [];
            res.locals.transcriptionPaths = [];

            // Process each participant's audio file
            for (const audioUrl of audioUrls) {
              const audioPath = await downloadAudio(audioUrl, `recording-${user.phone}-${Date.now()}.mp3`);
              console.log(`Transcribing individual recording for ${audioUrl}`);
              
              // Transcribe each audio file
              await transcribeAudio(req, res, 'transcription', audioPath);

              const txtFilePath = res.locals.transcription;
              res.locals.transcriptionPaths.push(txtFilePath);

              // Convert to PDF and Word and store paths
              const pdfFilePath = txtFilePath.replace('.txt', '.pdf');
              const docxFilePath = txtFilePath.replace('.txt', '.docx');

              await convertTxtToPdf(txtFilePath, pdfFilePath);
              await convertTxtToWord(txtFilePath, docxFilePath);

              res.locals.transcriptionPdfPaths.push(pdfFilePath);
              res.locals.transcriptionWordPaths.push(docxFilePath);
            }

            next();
          } catch (error) {
            console.error('Error downloading or transcribing audio file:', error);
            res.status(500).send('Error downloading or transcribing audio file');
          }
        }, 5000);
      } else {
        res.status(404).send('No audio URLs or subject URL found for the latest transcription');
      }
    } else {
      res.status(404).send('User not found or no transcriptions available');
    }
  } catch (error) {
    console.error('Error fetching user or downloading audio:', error);
    res.status(500).send('Error processing request');
  }
};

const transcribeAudio = (req, res, key, audioPath) => {
  return new Promise((resolve, reject) => {
    if (!audioPath) {
      console.error('No audio file found.');
      return reject('No audio file found.');
    }

    if (!fs.existsSync(audioPath)) {
      console.error(`Audio file does not exist at: ${audioPath}`);
      return reject('Audio file does not exist.');
    }

    console.log(`TRANSCRIPTION IN PROCESS CAPT'N: ${audioPath}`);

    const outputDir = path.join(__dirname, '..', 'outputs');
    const jsonFilePath = path.join(outputDir, `${path.parse(audioPath).name}.json`);
    const txtOutputPath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);

    // Determine the command and shell path based on the platform
    const command = process.platform === 'win32'
        ? `"C:/Program Files/Git/bin/bash.exe" -c "C:/Users/Leonidas/Desktop/Live-Transcribe-main/src/server/run_transcription.sh '${audioPath}' '${outputDir}'"`
        : `/bin/bash -c "/Users/hanson/Desktop/Live-Transcribe/src/server/run_transcription.sh '${audioPath}' '${outputDir}'"`;

    // Execute the command with the appropriate shell
    exec(command, { shell: process.platform === 'win32' ? true : '/bin/bash' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        return reject('Error during transcription.');
      }

      console.log("Proceeding to JSON to TXT conversion");

      // Process JSON output and create a formatted .txt file
      let transcriptionData;
      try {
        const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
        transcriptionData = JSON.parse(jsonData);
      } catch (err) {
        console.error('Error reading or parsing JSON file:', err);
        return reject('Error processing transcription data.');
      }

      const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${remainingSeconds}`;
      };

      const mergeSegmentsBySpeaker = (segments) => {
        const mergedSegments = [];
        let currentSpeaker = null;
        let currentStartTime = null;
        let currentEndTime = null;
        let currentText = '';

        segments.forEach((segment, index) => {
          if (segment.speaker === currentSpeaker) {
            currentEndTime = segment.end;
            currentText += ` ${segment.text.trim()}`;
          } else {
            if (currentSpeaker !== null) {
              mergedSegments.push({
                speaker: currentSpeaker,
                startTime: currentStartTime,
                endTime: currentEndTime,
                text: currentText.trim()
              });
            }
            currentSpeaker = segment.speaker;
            currentStartTime = segment.start;
            currentEndTime = segment.end;
            currentText = segment.text.trim();
          }
          if (index === segments.length - 1) {
            mergedSegments.push({
              speaker: currentSpeaker,
              startTime: currentStartTime,
              endTime: currentEndTime,
              text: currentText.trim()
            });
          }
        });
        return mergedSegments;
      };

      const mergedSegments = mergeSegmentsBySpeaker(transcriptionData.segments);

      const formattedText = mergedSegments.map(segment => {
        const startTime = formatTime(segment.startTime);
        const endTime = formatTime(segment.endTime);
        const text = segment.text;
        return `${segment.speaker} (${startTime}-${endTime}) - "${text}"`;
      }).join('\n\n');

      fs.writeFile(txtOutputPath, formattedText, (err) => {
        if (err) {
          console.error('Error writing to text file:', err);
          return reject('Error saving transcription text.');
        }
        res.locals[key] = txtOutputPath;
        resolve();
      });
    });
  });
};

transcriptionController.transcribe = async (req, res, next) => {
  const audioPath = res.locals.audioPath;
  const email = req.body.email;

  if (!audioPath) {
    console.error('No audio file found.');
    return res.status(400).send('No audio file found.');
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`Audio file does not exist at: ${audioPath}`);
    return res.status(400).send('Audio file does not exist.');
  }

  if (!email) {
    console.error('No email provided.');
    return res.status(400).send('No email provided.');
  }

  res.locals.email = email;

  const outputDir = path.resolve(process.platform === 'win32' ? './src/server/outputs' : './src/server/output');
  const jsonFilePath = path.join(outputDir, `${path.parse(audioPath).name}.json`);
  const txtOutputPath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);
  
  // Determine the script path and shell based on the platform
  const scriptPath = process.platform === 'win32'
      ? 'C:/Users/Leonidas/Desktop/Live-Transcribe-main/src/server/run_transcription2.sh'
      : '/Users/hanson/Desktop/Live-Transcribe/src/server/run_transcription.sh';
  const shell = process.platform === 'win32'
      ? 'C:/Program Files/Git/bin/bash.exe'
      : '/bin/bash';
  
  const command = `${shell} -c "${scriptPath} '${audioPath}' '${outputDir}'"`;
  
  console.log('Executing shell command:', command);
  
  exec(command, { shell: shell }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      return reject('Error during transcription.');
    }
    res.locals.diarization = false

    if (!res.locals.diarization) {
      console.log("Skipping JSON processing as diarization is false");

      // Check if the output text file exists
      if (!fs.existsSync(txtOutputPath)) {
        console.error(`Text file does not exist at: ${txtOutputPath}`);
        return reject('Text file does not exist.');
      }

      // Save the path to res.locals[key]
      res.locals.outputFilePath = txtOutputPath;
      return next();
    }

    console.log("Proceeding to JSON to TXT conversion");

    // Read and parse the JSON file
    let transcriptionData;
    try {
      const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
      transcriptionData = JSON.parse(jsonData);
    } catch (err) {
      console.error('Error reading or parsing JSON file:', err);
      return res.status(500).send('Error processing transcription data.');
    }

    const formatTime = (seconds) => {
      const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
      const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
      return `${minutes}:${remainingSeconds}`;
    };
    
    const mergeSegmentsBySpeaker = (segments) => {
      const mergedSegments = [];
      let currentSpeaker = null;
      let currentStartTime = null;
      let currentEndTime = null;
      let currentText = '';
    
      segments.forEach((segment, index) => {
        if (segment.speaker === currentSpeaker) {
          // If the same speaker, extend the end time and append the text
          currentEndTime = segment.end;
          currentText += ` ${segment.text.trim()}`;
        } else {
          // If it's a new speaker or the first segment, push the previous segment to the array
          if (currentSpeaker !== null) {
            mergedSegments.push({
              speaker: currentSpeaker,
              startTime: currentStartTime,
              endTime: currentEndTime,
              text: currentText.trim()
            });
          }
    
          // Start tracking the new speaker's segment
          currentSpeaker = segment.speaker;
          currentStartTime = segment.start;
          currentEndTime = segment.end;
          currentText = segment.text.trim();
        }
    
        // Push the last segment after the loop ends
        if (index === segments.length - 1) {
          mergedSegments.push({
            speaker: currentSpeaker,
            startTime: currentStartTime,
            endTime: currentEndTime,
            text: currentText.trim()
          });
        }
      });
    
      return mergedSegments;
    };
    
    const mergedSegments = mergeSegmentsBySpeaker(transcriptionData.segments);
    
    const formattedText = mergedSegments.map(segment => {
      const startTime = formatTime(segment.startTime);
      const endTime = formatTime(segment.endTime);
      const text = segment.text;
    
      return `${segment.speaker} (${startTime}-${endTime}) - "${text}"`;
    }).join('\n\n');

    // Write the formatted text to a .txt file
    fs.writeFile(txtOutputPath, formattedText, (err) => {
      if (err) {
        console.error('Error writing to text file:', err);
        return res.status(500).send('Error saving transcription text.');
      }

      // Set the file path to res.locals so it can be accessed in the next middleware
      res.locals.outputFilePath = txtOutputPath;
      console.log('Transcription text saved successfully.');
      next();
    });
  });
};


module.exports = { upload, transcriptionController };



