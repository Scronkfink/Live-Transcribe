require('dotenv').config();
const twilio = require('twilio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const User = require('../models/userModel.js');
const VoiceResponse = twilio.twiml.VoiceResponse;

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const twilioController = {};

twilioController.handleVoice = async (req, res) => {
  const twiml = new VoiceResponse();
  const callerPhoneNumber = req.body.From.replace(/^\+1/, ''); // Normalize phone number

  console.log("Normalized phone number: ", callerPhoneNumber);

  try {
    const user = await User.findOne({ phone: callerPhoneNumber }); // Fetch user by phone number
    if (user) {
      const preRecordedVoiceUrl = `${process.env.SERVER_ADDRESS}/api/intro`; // Pre-recorded intro URL

      const message = `Hello, ${user.name}. I'm here to work as your AI assistant on behalf of CopyTalk to offer you some audio transcription services. Would you mind telling me the subject of this conversation?`;

      // Call ElevenLabs API to generate a personalized message
      const elevenLabsResponse = await axios.post('https://api.elevenlabs.io/v1/text-to-speech/UDoSXdwuEuC59qu2AfUo', {
        text: message,
        model_id: 'eleven_turbo_v2',
      }, {
        headers: {
          'xi-api-key': `${process.env.ELEVENLABS_API_KEY}`
        },
        responseType: 'arraybuffer'
      });

      const audioBuffer = Buffer.from(elevenLabsResponse.data, 'binary');
      const outputDir = path.join(__dirname, '..', 'output');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir); // Create output directory if it doesn't exist
      }

      const personalizedMessagePath = path.join(outputDir, `personalized-${user.phone}-${Date.now()}.mp3`);
      console.log(`Saving personalized message to: ${personalizedMessagePath}`);

      fs.writeFileSync(personalizedMessagePath, audioBuffer); // Save personalized message

      const personalizedMessageUrl = `${process.env.SERVER_ADDRESS}/api/personalized/${path.basename(personalizedMessagePath)}`;
      console.log(`Personalized message URL: ${personalizedMessageUrl}`);

      // Play pre-recorded and personalized messages
      twiml.play(preRecordedVoiceUrl);
      twiml.play(personalizedMessageUrl);

      // Record user response
      twiml.record({
        action: '/api/subject',
        method: 'POST',
        maxLength: 30,
        playBeep: true
      });
    } else {
      // Handle case when user is not found
      twiml.say('Hello, I could not find your details. Please provide your name and email.');
    }
  } catch (error) {
    // Handle errors
    console.error('Error fetching user or generating personalized message:', error);
    twiml.say('Sorry, there was an error processing your request. Please try again later.');
  }

  // Send TwiML response
  res.type('text/xml');
  res.send(twiml.toString());
};


twilioController.handleSubject = async (req, res) => {
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  const recordingUrl = req.body.RecordingUrl || 'No recording URL provided';

  // console.log("In handleSubject controller; this is req.body: ", req.body);
  try {
    const user = await User.findOne({ phone: callerPhoneNumber });
    console.log("User found: ", user);

    if (user) {
      const transcription = {
        email: user.email,
        subject: recordingUrl, // Placeholder for recorded subject, ideally, you'd convert this to text using a service
        body: 'Pending transcription', // Default value for body
        timestamp: new Date()
      };

      user.transcriptions.push(transcription);
      await user.save();

      const twiml = new VoiceResponse();
      twiml.play(`${process.env.SERVER_ADDRESS}/api/recording`);
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
  twiml.play(`${process.env.SERVER_ADDRESS}/api/beep`);
  twiml.record({
    action: '/api/twilioTranscription',
    method: 'POST',
    maxLength: 600, // max 10 minutes
    playBeep: true,
    finishOnKey: '*' // Press * to finish recording
  });
  
  twiml.play(`${process.env.SERVER_ADDRESS}/api/end`);
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
};

// Handle the recording completion and save the URL to the database
twilioController.handleTranscription = async (req, res, next) => {
  const recordingUrl = req.body.RecordingUrl;
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  res.locals.number = callerPhoneNumber;

  console.log("in twilioController.handleTranscription; this is req.body: ", req.body);

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const transcription = user.transcriptions[user.transcriptions.length - 1];
      transcription.audioUrl = recordingUrl;
      await user.save();

      // Create TwiML response to hang up the call immediately
      const twiml = new VoiceResponse();
      twiml.play(`${process.env.SERVER_ADDRESS}/api/end`);
      twiml.hangup();

      res.type('text/xml');
      res.send(twiml.toString());

      // Proceed to the next middleware after sending the TwiML response
      next();
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