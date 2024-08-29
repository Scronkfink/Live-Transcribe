const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');
const { convertTxtToPdf, convertTxtToWord } = require('./conversionUtils.js');
require('dotenv').config();

const transcriptionController = {};

const uploadDir = path.join(__dirname, '..', 'uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });

transcriptionController.initialize = (req, res, next) => {
  const audioData = req.file;
  const { email, phone, name } = req.body;

  console.log("APP, transcriptionController.initialize(1/7); this is req.body: ", req.body);

  if (!audioData) {
    return res.status(400).send("No file uploaded");
  }

  const uploadsDir = path.join(__dirname, 'uploads');

  console.log("This is original audioData.originalname: ",  audioData.originalname);

  let originalName = audioData.originalname;
  const dateNow = Date.now();

  if (originalName.includes("recording")) {
    originalName = originalName.replace("recording", `${dateNow}_recording`);
  } else {
    originalName = `${dateNow}_${originalName}`;
  }

  const audioPath = path.join(uploadsDir, originalName);

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  fs.readFile(audioData.path, (err, data) => {
    if (err) {
      console.error("Failed to read the uploaded file:", err);
      return res.status(500).send("Failed to read the uploaded file");
    }

    fs.writeFile(audioPath, data, (err) => {
      if (err) {
        console.error("Failed to save the audio data:", err);
        return res.status(500).send("Failed to save the audio data");
      }

      // Delete the generic file created by Multer
      fs.unlink(audioData.path, (err) => {
        if (err) {
          console.error("Failed to delete the original uploaded file:", err);
        } else {
          console.log("Successfully deleted the original uploaded file.");
        }
      });

      console.log(`APP, transcriptionController.initialize(1/7); res.locals.audioFilePath: ${audioPath}`);
      res.locals.audioFilePath = audioPath;
      res.locals.email = email;
      res.locals.phone = phone;
      res.locals.user = name;
      next();
    });
  });
};

transcriptionController.transcribe = async (req, res, next) => {
  const audioFilePath = res.locals.audioFilePath;

  console.log("APP, in transcriptionController.transcribe(3/7)");

  if (!audioFilePath) {
    console.error('No audio file path found in res.locals.');
    return res.status(400).send('No audio file path found.');
  }

  try {
    await transcribeAudio(req, res, 'transcription', audioFilePath);

    const txtFilePath = res.locals.transcription;
    const pdfFilePath = txtFilePath.replace('.txt', '.pdf');
    const docxFilePath = txtFilePath.replace('.txt', '.docx');

    console.log(`APP, in transcriptionController.transcribe (3/7); CONVERTING THIS TXT FILE: ${txtFilePath} to .PDF AND .DOCX CAPT'N!`);
    await convertTxtToPdf(txtFilePath, pdfFilePath);
    await convertTxtToWord(txtFilePath, docxFilePath);

    console.log("PDF file generated at:", pdfFilePath);
    console.log("DOCX file generated at:", docxFilePath);
    res.locals.transcriptionPdfPath = pdfFilePath;
    res.locals.transcriptionWordPath = docxFilePath;
    
    next();
  } catch (error) {
    console.error('Error transcribing audio file:', error);
    res.status(500).send('Error transcribing audio file');
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

    console.log(`TRANSCRIPTION IN PROCESS CAPT'N`);

    // Determine which shell script to use based on res.locals.diarization
    const scriptName = res.locals.diarization ? 'run_transcription.sh' : 'run_transcription2.sh';
    const outputDir = path.join(__dirname, '..', 'outputs');
    const jsonFilePath = path.join(outputDir, `${path.parse(audioPath).name}.json`);
    const txtOutputPath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);

    const command = `bash -c "C:/Users/Leonidas/Desktop/Live-Transcribe-main/src/server/${scriptName} '${audioPath}' '${outputDir}'"`;

    exec(command, { shell: 'C:/Program Files/Git/bin/bash.exe' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        return reject('Error executing transcription command.');
      }

      // If using run_transcription2.sh, skip JSON processing
      if (!res.locals.diarization) {
        console.log("Skipping JSON processing as diarization is false");

        // Check if the output text file exists
        if (!fs.existsSync(txtOutputPath)) {
          console.error(`Text file does not exist at: ${txtOutputPath}`);
          return reject('Text file does not exist.');
        }

        // Save the path to res.locals[key]
        res.locals[key] = txtOutputPath;
        return resolve();
      }

      // Process the JSON output and merge speaker segments
      console.log("Proceeding to JSON to TXT conversion as diarization is true");

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


module.exports = { upload, transcriptionController };