const express = require('express');
const router = express.Router();

// Import the userController
const userController = require('./appControllers/userController.js');

// Route to handle POST requests to /app/signIn
router.post('/signIn', userController.signIn);

router.post('/signUp', userController.signUp);

module.exports = router;