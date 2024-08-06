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

  console.log("APP, transcriptionController.test; this is req.body: ", req.body);

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
    const command = `conda run -n whisperx whisperx "${audioPath}" --model large-v2 --language en --compute_type int8 --output_dir "${outputDir}" --output_format txt`;

    const startTime = Date.now();

    exec(command, (error, stdout, stderr) => {
      const endTime = Date.now();
      const transcriptionTime = (endTime - startTime) / 1000;

      console.log(`ARR! Transcription be completed in ${transcriptionTime} seconds, matey!`);
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

module.exports = { upload, transcriptionController };