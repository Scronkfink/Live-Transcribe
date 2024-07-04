const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');
const twilio = require('twilio');
const { convertTxtToPdf, convertTxtToWord } = require('./conversionUtils');
const User = require('../models/userModel.js');
require('dotenv').config();

const transcriptionController = {};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') });

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
            res.locals.transcriptionPdfLink = `http://yourdomain.com/downloads/${path.basename(pdfFilePath)}`;
            res.locals.transcriptionWordLink = `http://yourdomain.com/downloads/${path.basename(docxFilePath)}`;

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
    const command = `conda run -n whisperx whisperx "${audioPath}" --model large-v2 --compute_type int8 --output_dir "${outputDir}" --output_format txt`;

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


module.exports = { upload, transcriptionController };