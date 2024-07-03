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

transcriptionController.transcribe = async (req, res, next) => {
  const audioPath = res.locals.audioPath;

  if (!audioPath) {
    console.error('No audio file found.');
    return res.status(400).send('No audio file found.');
  }

  // Check if the audio file exists
  if (!fs.existsSync(audioPath)) {
    console.error(`Audio file does not exist at: ${audioPath}`);
    return res.status(400).send('Audio file does not exist.');
  }

  console.log(`TRANSCRIPTION IN PROCESS CAPT'N: ${audioPath}`);

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
        next();
      });
    });
  });
};



module.exports = { upload, transcriptionController };