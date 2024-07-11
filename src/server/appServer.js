const express = require('express');
const router = express.Router();

const userController = require('./appControllers/userController.js');
const { upload, transcriptionController } = require('./appControllers/transcriptionController.js');
const emailController = require('./appControllers/emailController.js');

router.post('/signIn', userController.signIn);
router.post('/signUp', userController.signUp);
router.post('/test', upload.single('file'), transcriptionController.test, transcriptionController.transcribe, emailController.sendTranscript);

module.exports = router;