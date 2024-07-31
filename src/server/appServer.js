const express = require('express');
const router = express.Router();

const userController = require('./appControllers/userController.js');
const { upload, transcriptionController } = require('./appControllers/transcriptionController.js');
const emailController = require('./appControllers/emailController.js');
const twilioController = require('./appControllers/twilioController.js');

router.post('/signIn', userController.signIn, twilioController.twoFactor);
router.post('/signUp', userController.signUp);
router.post('/test', upload.single('file'), transcriptionController.test, userController.createTranscription, transcriptionController.transcribe, userController.uploadTranscription, emailController.sendTranscript);

router.post('/getTranscriptions', userController.getTranscriptions);
router.post('/getPDF', userController.getPDF);

module.exports = router;