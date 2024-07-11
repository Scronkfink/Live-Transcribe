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
transcriptionController.test = (req, res, next) => {
  const audioData = req.file; // Assuming the audio file is sent as 'file'

  // Log the incoming file data
  console.log("Received file:", audioData);

  if (!audioData) {
    res.status(400).send("No file uploaded");
    return;
  }

  const uploadsDir = path.join(__dirname, 'uploads');
  const audioPath = path.join(uploadsDir, audioData.originalname);

  // Ensure the uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Read the file from the temporary location and save it to the desired location
  fs.readFile(audioData.path, (err, data) => {
    if (err) {
      console.error("Failed to read the uploaded file:", err);
      res.status(500).send("Failed to read the uploaded file");
      return;
    }

    fs.writeFile(audioPath, data, (err) => {
      if (err) {
        console.error("Failed to save the audio data:", err);
        res.status(500).send("Failed to save the audio data");
        return;
      }

      // Log the file path
      console.log(`Audio data stored at: ${audioPath}`);
      res.status(200).send(`Audio data stored at: ${audioPath}`);
    });
  });
};


transcriptionController.getAudio = async (req, res, next) => {
  console.log("In transcriptionController.getAudio; this is res.locals.number: ", res.locals.number);

  const phoneNumber = res.locals.number;

  try {
    const user = await User.findOne({ phone: phoneNumber });
    res.locals.user = user.name;
    res.locals.email = user.email;

    if (user && user.transcriptions.length > 0) {
      const latestTranscription = user.transcriptions[user.transcriptions.length - 1];
      const audioUrl = latestTranscription.audioUrl;
      const subjectUrl = latestTranscription.subject;

      console.log("In transcriptionController.getAudio; this is audioUrl: ", audioUrl);

      if (audioUrl && subjectUrl) {
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

        // Download and transcribe the subject audio file first with 5-second delay
        setTimeout(async () => {
          try {
            const subjectPath = await downloadAudio(subjectUrl, `subject-${user.phone}-${Date.now()}.mp3`);
            res.locals.subjectPath = subjectPath;
            await transcribeAudio(req, res, 'subjectTranscription', subjectPath);

            // Download and transcribe the other audio file
            const audioPath = await downloadAudio(audioUrl, `recording-${user.phone}-${Date.now()}.mp3`);
            res.locals.audioPath = audioPath;
            await transcribeAudio(req, res, 'transcription', audioPath);

            // Convert .txt to PDF and Word
            const txtFilePath = res.locals.transcription;
            const pdfFilePath = txtFilePath.replace('.txt', '.pdf');
            const docxFilePath = txtFilePath.replace('.txt', '.docx');

            await convertTxtToPdf(txtFilePath, pdfFilePath);
            await convertTxtToWord(txtFilePath, docxFilePath);

            // Update links for email
            res.locals.transcriptionPdfPath = pdfFilePath;
            res.locals.transcriptionWordPath = docxFilePath;

            // Delete the audio files from Twilio
            const deleteRecording = async (url) => {
              const recordingSid = url.split('/').pop().split('.')[0]; // Assuming the URL has the SID
              await client.recordings(recordingSid).remove();
              console.log(`Recording ${recordingSid} deleted successfully.`);
            };

            await deleteRecording(audioUrl);
            await deleteRecording(subjectUrl);

            next();
          } catch (error) {
            console.error('Error downloading or transcribing audio file:', error);
            res.status(500).send('Error downloading or transcribing audio file');
          }
        }, 5000); // 5-second delay
      } else {
        res.status(404).send('No audio URL or subject URL found for the latest transcription');
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

    const outputDir = path.join(__dirname, '..', 'output');
    const command = `conda run -n whisperx whisperx "${audioPath}" --model large-v2 --language en --compute_type int8 --output_dir "${outputDir}" --output_format txt`;

    exec(command, (error, stdout, stderr) => {
      console.log(`Command executed: ${command}`);
      if (error) {
        console.error(`Error during transcription: ${error}`);
        console.error(`stderr: ${stderr}`);
        return reject('Error during transcription.');
      }

      console.log(`Transcription stdout: ${stdout}`);
      console.log(`Transcription stderr: ${stderr}`);

      const outputFilePath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);
      res.locals[key] = outputFilePath;
      resolve();
    });
  });
};

transcriptionController.transcribe = async (req, res, next) => {
  const audioPath = res.locals.audioPath;
  const email = req.body.email; // Assuming the email is sent in the form-data

  if (!audioPath) {
    console.error('No audio file found.');
    return res.status(400).send('No audio file found.');
  }

  // Check if the audio file exists
  if (!fs.existsSync(audioPath)) {
    console.error(`Audio file does not exist at: ${audioPath}`);
    return res.status(400).send('Audio file does not exist.');
  }

  if (!email) {
    console.error('No email provided.');
    return res.status(400).send('No email provided.');
  }

  res.locals.email = email; // Save the email to res.locals

  console.log(`In transcriptionController.transcribe; TRANSCRIPTION IN PROCESS CAPT'N: ${audioPath}`);

  const outputDir = path.join(__dirname, '..', 'output');
  const command = `conda run -n whisperx whisperx "${audioPath}" --model large-v2 --compute_type int8 --output_dir "${outputDir}" --output_format txt`;

  exec(command, (error, stdout, stderr) => {
    console.log(`Command executed: ${command}`); // Log the command
    if (error) {
      console.error(`Error during transcription: ${error}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).send('Error during transcription.');
    }

    console.log(`Transcription stdout: ${stdout}`);
    console.log(`Transcription stderr: ${stderr}`); // Log stderr

    const outputFilePath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const desktopOutputPath = path.join(desktopPath, `${path.parse(audioPath).name}.txt`);

    console.log(`Reading transcription result from: ${outputFilePath}`);

    fs.readFile(outputFilePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading output file: ${err}`);
        return res.status(500).send('Error reading transcription result.');
      }

      fs.writeFile(desktopOutputPath, data, (err) => {
        if (err) {
          console.error(`Error saving transcription to desktop: ${err}`);
          return res.status(500).send('Error saving transcription to desktop.');
        }

        console.log('Transcription successful and saved to desktop.');
        res.locals.transcription = data;
        res.locals.outputFilePath = outputFilePath; // Save the output file path to res.locals
        next();
      });
    });
  });
};


module.exports = { upload, transcriptionController };



