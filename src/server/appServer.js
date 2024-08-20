const express = require('express');
const router = express.Router();

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
router.post('/notifications', userController.updateNotifications)

router.post('/uploadFile', upload.single('file'), setAudioPath, userController.createTranscription, transcriptionController.transcribe, summarizationController.summarize, userController.uploadTranscription, twilioController.transcriptionReady, emailController.sendTranscript, (req, res) => {
  res.send({ transcription: res.locals.transcription });
});





module.exports = router;