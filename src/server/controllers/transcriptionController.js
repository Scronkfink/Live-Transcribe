const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const multer = require('multer');
const twilio = require('twilio');
const User = require('../models/userModel.js');
require('dotenv').config();

const transcriptionController = {};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') });

transcriptionController.transcribe = async (req, res) => {
  const audioPath = res.locals.audioPath;

  if (!audioPath) {
    console.error('No audio file found.');
    return res.status(400).send('No audio file found.');
  }

  console.log(`Transcribing audio file at: ${audioPath}`);

  exec(`conda run -n whisperx whisperx ${audioPath} --model large-v2 --compute_type int8 --output_dir ${path.join(__dirname, '..', 'output')} --output_format txt`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error during transcription: ${error}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).send('Error during transcription.');
    }

    console.log(`Transcription stdout: ${stdout}`);

    const outputFilePath = path.join(__dirname, '..', 'output', `${path.parse(audioPath).name}.txt`);
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
        next()
      });
    });
  });
};

transcriptionController.getAudio = async (req, res, next) => {
  console.log("In transcriptionController.getAudio; this is res.locals.number: ", res.locals.number);

  const phoneNumber = res.locals.number;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  try {
    const user = await User.findOne({ phone: phoneNumber });

    if (user && user.transcriptions.length > 0) {
      const latestTranscription = user.transcriptions[user.transcriptions.length - 1];
      const audioUrl = latestTranscription.audioUrl;

      console.log("In transcriptionController.getAudio; this is audioUrl: ", audioUrl);

      if (audioUrl) {
        // Add a delay before making the request to allow the URL to become accessible
        setTimeout(async () => {
          try {
            const response = await axios({
              method: 'GET',
              url: audioUrl,
              responseType: 'stream',
              auth: {
                username: accountSid,
                password: authToken
              }
            });

            const outputPath = path.join(os.tmpdir(), `recording-${user.phone}-${Date.now()}.mp3`);
            const writer = fs.createWriteStream(outputPath);

            response.data.pipe(writer);

            writer.on('finish', () => {
              res.locals.audioPath = outputPath;
              next();
            });

            writer.on('error', (err) => {
              console.error('Error writing audio file:', err);
              res.status(500).send('Error writing audio file');
            });
          } catch (error) {
            console.error('Error fetching audio file:', error);
            res.status(500).send('Error fetching audio file');
          }
        }, 5000); // 5 second delay
      } else {
        res.status(404).send('No audio URL found for the latest transcription');
      }
    } else {
      res.status(404).send('User not found or no transcriptions available');
    }
  } catch (error) {
    console.error('Error fetching user or downloading audio:', error);
    res.status(500).send('Error processing request');
  }
};



module.exports = { upload, transcriptionController };