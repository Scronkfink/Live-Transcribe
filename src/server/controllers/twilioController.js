require('dotenv').config();
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const VoiceResponse = twilio.twiml.VoiceResponse;
const User = require('../models/userModel.js');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const twilioController = {};

// Handle incoming call and ask for the subject
twilioController.handleVoice = async (req, res) => {
  const twiml = new VoiceResponse();
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');

  console.log("in twilioController.handleVoice; this is req.body: ", req.body);
  console.log("Normalized phone number: ", callerPhoneNumber);

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });
    console.log("Database query result: ", user);

    if (user) {
      twiml.say(`Hello, ${user.name}. I'm here to work as your AI assistant on behalf of CopyTalk to offer you some audio transcription services. Would you mind telling me the subject of this conversation?`);
      twiml.record({
        action: '/api/subject',
        method: 'POST',
        maxLength: 30,
        playBeep: true
      });
    } else {
      twiml.say('Hello, I could not find your details. Please provide your name and email.');
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    twiml.say('Sorry, there was an error processing your request. Please try again later.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
};

// Handle the recorded subject and route to the next controller
twilioController.handleSubject = async (req, res) => {
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  const recordingUrl = req.body.RecordingUrl || 'No recording URL provided';

  console.log("In handleSubject controller; this is req.body: ", req.body);
  try {
    const user = await User.findOne({ phone: callerPhoneNumber });
    console.log("User found: ", user);

    if (user) {
      const transcription = {
        email: user.email,
        subject: recordingUrl, // Placeholder for recorded subject, ideally, you'd convert this to text using a service
        body: 'Pending transcription' // Default value for body
      };

      user.transcriptions.push(transcription);
      await user.save();

      const twiml = new VoiceResponse();
      twiml.say('Wonderful. I will go ahead and start transcribing your conversation as soon as you’re ready. Press any key to start recording.');
      twiml.gather({
        action: '/api/startRecording',
        method: 'POST',
        numDigits: 1,
        timeout: 5 // Timeout in seconds for gathering the input
      });

      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      console.error('User not found');
    }
  } catch (error) {
    console.error('Error handling subject:', error);
  }
};

twilioController.startRecording = (req, res) => {
  const twiml = new VoiceResponse();
  twiml.say('Please start speaking after the beep. Press any key when you are done.');
  twiml.record({
    action: '/api/twilioTranscription',
    method: 'POST',
    maxLength: 600, // max 10 minutes
    playBeep: true,
    finishOnKey: '*' // Press * to finish recording
  });
  
  twiml.say('Thank you, your transcription will be available shortly.');
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
};

// Handle the recording completion and save the URL to the database
twilioController.handleTranscription = async (req, res, next) => {
  const recordingUrl = req.body.RecordingUrl;
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  res.locals.number = callerPhoneNumber

  console.log("in twilioController.handleTranscription; this is req.body: ", req.body);

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const transcription = user.transcriptions[user.transcriptions.length - 1];
      transcription.audioUrl = recordingUrl;

      await user.save();

      next()
    } else {
      console.error('User not found');
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error handling transcription:', error);
    res.status(500).send('Error handling transcription');
  }
};

twilioController.handleFallback = (req, res) => {
  res.send('Fallback logic here');
};

twilioController.handleStatus = (req, res) => {
  res.send('Call status change handling logic here');
};

module.exports = twilioController;