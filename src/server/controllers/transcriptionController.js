const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');

const transcriptionController = {};

const upload = multer({ dest: 'uploads/' });

transcriptionController.transcribe = async (req, res, next) => {
  console.log("Received a file for transcription.");

  const file = req.file;

  if (!file) {
    console.error('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, '..', file.path);
  console.log(`File uploaded to: ${filePath}`);

  exec(`whisperx ${filePath} --model large-v2 --compute_type int8 --output_dir ./output --output_format txt`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error during transcription: ${error}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).send('Error during transcription.');
    }

    console.log(`Transcription stdout: ${stdout}`);

    const outputFilePath = path.join(__dirname, '..', 'output', `${path.parse(file.filename).name}.txt`);
    console.log(`Reading transcription result from: ${outputFilePath}`);
    
    fs.readFile(outputFilePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading output file: ${err}`);
        return res.status(500).send('Error reading transcription result.');
      }

      console.log('Transcription successful.');
      res.download(outputFilePath, 'transcription.txt', (err) => {
        if (err) {
          console.error(`Error sending output file: ${err}`);
          return res.status(500).send('Error sending transcription result.');
        }
      });
    });
  });
};

module.exports = { upload, transcriptionController };