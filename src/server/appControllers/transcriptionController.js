const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');
const { convertTxtToPdf, convertTxtToWord } = require('./conversionUtils.js');
require('dotenv').config();

const transcriptionController = {};

const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') });

transcriptionController.test = (req, res, next) => {
  const audioData = req.file;
  const { email, phone, name } = req.body;

  console.log("APP, transcriptionController.test(1/7); this is req.body: ", req.body);

  if (!audioData) {
    return res.status(400).send("No file uploaded");
  }

  const uploadsDir = path.join(__dirname, 'uploads');
  const audioPath = path.join(uploadsDir, audioData.originalname);

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

      console.log(`Audio data stored at: ${audioPath}`);
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

  console.log("APP, in transcriptionController.transcribe; this is audioFilePath: ", audioFilePath);

  if (!audioFilePath) {
    console.error('No audio file path found in res.locals.');
    return res.status(400).send('No audio file path found.');
  }

  try {
    await transcribeAudio(req, res, 'transcription', audioFilePath);

    const txtFilePath = res.locals.transcription;
    const pdfFilePath = txtFilePath.replace('.txt', '.pdf');
    const docxFilePath = txtFilePath.replace('.txt', '.docx');

    console.log("APP, in transcriptionController.transcribe; CONVERTING TO .PDF AND .DOCX CAPT'N!");
    await convertTxtToPdf(txtFilePath, pdfFilePath);
    await convertTxtToWord(txtFilePath, docxFilePath);

    console.log("PDF file generated at:", pdfFilePath);
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

    console.log(`TRANSCRIPTION IN PROCESS CAPT'N: ${audioPath}`);

    const outputDir = path.join(__dirname, '..', 'output');
    const jsonFilePath = path.join(outputDir, `${path.parse(audioPath).name}.json`);
    const txtOutputPath = path.join(outputDir, `${path.parse(audioPath).name}.txt`);

    const command = `bash -c "C:/Users/Leonidas/Desktop/Live-Transcribe-main/src/server/run_transcription.sh '${audioPath}' '${outputDir}'"`;

    console.log('Executing shell command:', command);
    
    exec(command, { shell: 'C:/Program Files/Git/bin/bash.exe' }, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        console.error(`stderr: ${stderr}`);
        return;
      }

      console.log("Proceeding to JSON to TXT conversion");

      // Read the JSON file and parse it
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
          return reject('Error saving transcription text.');
        }
        res.locals[key] = txtOutputPath;
        resolve();
      });
    });
  });
};

module.exports = { upload, transcriptionController };