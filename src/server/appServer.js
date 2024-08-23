const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const userController = require('./appControllers/userController.js');
const { upload, transcriptionController } = require('./appControllers/transcriptionController.js');
const emailController = require('./appControllers/emailController.js');
const twilioController = require('./appControllers/twilioController.js');
const summarizationController = require('./appControllers/summarizationController.js')


const setAudioPath = (req, res, next) => {
  if (req.file && req.file.path) {
    res.locals.audioFilePath = req.file.path;
    console.log(`File uploaded to: ${res.locals.audioFilePath}`);
  } else {
    console.error('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }
  next();
};

router.post('/signIn', userController.signIn, twilioController.twoFactor);
router.post('/authentication', userController.authenticate);
router.post('/signUp', userController.signUp, twilioController.twoFactor);
router.post('/test', upload.single('file'), transcriptionController.test, userController.createTranscription, transcriptionController.transcribe, summarizationController.summarize, userController.uploadTranscription, twilioController.transcriptionReady, emailController.sendTranscript);
router.post("/deleteTranscription", userController.deleteTranscription);
router.post("/faceIDSignIn", userController.faceID);
router.post('/getTranscriptions', userController.getTranscriptions);
router.post('/getPDF', userController.getPDF);
router.post('/getSummary', userController.getSummary);
router.post('/notifications', userController.updateNotifications);

router.post('/uploadFile', upload.single('file'), setAudioPath, userController.createTranscription, transcriptionController.transcribe, summarizationController.summarize, userController.uploadTranscription, twilioController.transcriptionReady, emailController.sendTranscript, (req, res) => {
  res.send({ transcription: res.locals.transcription });
});


const UPLOADS_DIR = path.join(__dirname, 'output');
const SECRET_KEY = process.env.SECRET_KEY;

router.get('/download', (req, res) => {
  const { filePath, expires, signature } = req.query;

  // Validate parameters
  if (!filePath || !expires || !signature) {
    return res.status(400).send('Missing required query parameters.');
  }

  // Log critical information for debugging
  console.log("Requested filePath:", filePath);
  console.log("Expiration time:", expires);
  console.log("Provided signature:", signature);

  // Validate expiration
  const currentTime = Math.floor(Date.now() / 1000);
  if (parseInt(expires) < currentTime) {
    console.log('URL has expired.');
    return res.status(403).send('URL has expired.');
  }

  // Validate signature
  const expectedSignature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${filePath}:${expires}`)
    .digest('hex');

  console.log("Expected signature:", expectedSignature);

  if (signature !== expectedSignature) {
    console.log('Invalid signature.');
    return res.status(403).send('Invalid signature.');
  }

  // Ensure the file path is within the uploads directory for security reasons
  const resolvedFilePath = path.join(UPLOADS_DIR, path.basename(filePath));
  console.log("Resolved filePath:", resolvedFilePath);

  // Check if the file exists and serve it
  if (fs.existsSync(resolvedFilePath)) {
    console.log('File found, sending...');
    res.sendFile(resolvedFilePath);
  } else {
    console.log('File not found at path:', resolvedFilePath);
    res.status(404).send('File not found.');
  }
});


module.exports = router;