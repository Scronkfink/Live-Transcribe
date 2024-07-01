require('dotenv').config();
const twilio = require('twilio');
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);
const User = require('../models/userModel.js');

const twilioController = {};

twilioController.handleVoice = async (req, res) => {
  
  const phoneNumber = req.body.From; // Twilio sends the caller's phone number in the 'From' field
  try {
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      res.status(404).send('User not found');
      return;
    }
    // Implement logic to interact with ElevenLabs and return TwiML response
    res.send('Voice call handling logic here');
  } catch (error) {
    res.status(500).send('Error fetching user data');
  }
};

twilioController.handleFallback = (req, res) => {
  // Fallback logic here
  res.send('Fallback logic here');
};

twilioController.handleStatus = (req, res) => {
  // Call status change handling logic here
  res.send('Call status change handling logic here');
};

module.exports = { twilioController };