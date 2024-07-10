const express = require('express');
const router = express.Router();

// Import the userController
const userController = require('./appControllers/userController.js');
const { upload, transcriptionController } = require('./appControllers/transcriptionController.js');

// Route to handle POST requests to /app/signIn
router.post('/signIn', userController.signIn);

router.post('/signUp', userController.signUp);

router.post('/transcribe', transcriptionController.test);

module.exports = router;