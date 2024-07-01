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

  console.log("in twilioController.handleVoice; this is req.body: ", req.body)
  console.log("Normalized phone number: ", callerPhoneNumber);

  try {
    const user = await User.findOne({ phoneNumber: callerPhoneNumber });
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
  const callerPhoneNumber = req.body.From;
  const recordingUrl = req.body.RecordingUrl;

  console.log("in twilioController.handleSubject; this is req.body: ", req.body)

  try {
    const user = await User.findOne({ phoneNumber: callerPhoneNumber });
    console.log('User found:', user);

    if (user) {
      const transcription = {
        email: user.email,
        subject: recordingUrl || 'No subject provided', // Placeholder for recorded subject
        body: '' 
      };

      console.log('Transcription object:', transcription);

      user.transcriptions.push(transcription);
      await user.save();
      console.log('User after saving transcription:', user);

      const twiml = new VoiceResponse();
      twiml.say('Wonderful. I will go ahead and start transcribing your conversation as soon as you’re ready. Please start whenever you please.');
      twiml.record({
        action: '/api/twilioTranscription',
        method: 'POST',
        transcribe: true,
        maxLength: 600, // max 10 minutes
        playBeep: true
      });

      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      console.error('User not found');
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error handling subject:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Handle the transcription and email sending
twilioController.handleTranscription = async (req, res) => {
  const transcriptionText = req.body.TranscriptionText;
  const callerPhoneNumber = req.body.From;

  console.log("in twilioController.handleTranscription; this is req.body: ", req.body)

  try {
    const user = await User.findOne({ phoneNumber: callerPhoneNumber });

    if (user) {
      const transcription = user.transcriptions[user.transcriptions.length - 1];
      transcription.body = transcriptionText;

      await user.save();

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL,
          pass: process.env.PASSWORD
        }
      });

      const mailOptions = {
        from: process.env.EMAIL,
        to: transcription.email,
        subject: transcription.subject,
        text: transcription.body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log('Error sending email:', error);
        }
        console.log('Email sent:', info.response);
      });
    } else {
      console.error('User not found');
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error handling transcription:', error);
    res.status(500).send('Error handling transcription');
  }

  res.send('Transcription received.');
};

twilioController.handleFallback = (req, res) => {
  res.send('Fallback logic here');
};

twilioController.handleStatus = (req, res) => {
  res.send('Call status change handling logic here');
};

module.exports = twilioController;