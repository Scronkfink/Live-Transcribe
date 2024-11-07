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

/**
 * handleVoice
 * 
 * Action: Handles the initial incoming call.
 * - Fetches user by phone number.
 * - Plays pre-recorded and personalized messages.
 * - Records the subject of the conversation.
 * 
 * Next Controller: handleSubject
 */
twilioController.handleVoice = async (req, res) => {
  const twiml = new VoiceResponse();
  const callerPhoneNumber = req.body.From.replace(/^\+1/, ''); // Normalize phone number

  console.log("In twilioController.handleVoice (1/7); this is the caller's number: ", callerPhoneNumber);
  try {
    const user = await User.findOne({ phone: callerPhoneNumber }); // Fetch user by phone number
    if (user) {
      const preRecordedVoiceUrl = `${process.env.SERVER_ADDRESS}/api/intro`; // Pre-recorded intro URL

      const message = `Hello, ${user.name}. I'm here to help you transcribe your call today. What would you like the subject of the conversation to be?`;

      // Call ElevenLabs API to generate a personalized message
      const elevenLabsResponse = await axios.post('https://api.elevenlabs.io/v1/text-to-speech/vr0bgRsxEeKlki1dsI7u', {
        text: message,
        model_id: 'eleven_turbo_v2',
      }, {
        headers: {
          'xi-api-key': `${process.env.ELEVENLABS_API_KEY}`
        },
        responseType: 'arraybuffer'
      });

      const audioBuffer = Buffer.from(elevenLabsResponse.data, 'binary');
      const outputDir = path.join(__dirname, '..', 'outputs');

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir); // Create output directory if it doesn't exist
      }

      const personalizedMessagePath = path.join(outputDir, `personalized-${user.phone}-${Date.now()}.mp3`);
      // console.log(`Saving personalized message to: ${personalizedMessagePath}`);

      fs.writeFileSync(personalizedMessagePath, audioBuffer); // Save personalized message

      const personalizedMessageUrl = `${process.env.SERVER_ADDRESS}/api/personalized/${path.basename(personalizedMessagePath)}`;
      // console.log(`Personalized message URL: ${personalizedMessageUrl}`);

      // Play pre-recorded and personalized messages
      twiml.play(preRecordedVoiceUrl);
      twiml.play(personalizedMessageUrl);

      // Record user response
      twiml.record({
        action: '/api/subject',
        method: 'POST',
        maxLength: 5,
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

/**
 * handleSubject
 * 
 * Action: Handles the recording of the conversation subject.
 * - Saves the recording URL to the user's transcriptions.
 * - Prompts the user to add another participant.
 * 
 * Next Controller: addParticipant
 */
twilioController.handleSubject = async (req, res) => {
  console.log("In twilioController.handleSubject (2/7); ");
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  const recordingUrl = req.body.RecordingUrl || 'No recording URL provided';

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const transcription = {
        email: user.email,
        subject: "Pending transcription",
        subjectUrl: recordingUrl, // Placeholder for recorded subject
        body: 'Pending transcription', // Default value for body
        timestamp: new Date()
      };

      user.transcriptions.push(transcription);
      await user.save();

      const twiml = new VoiceResponse();
      twiml.play(`${process.env.SERVER_ADDRESS}/api/recording`);
      twiml.gather({
        action: '/api/addParticipant',
        method: 'POST',
        numDigits: 1,
        timeout: 5 // Timeout in seconds for gathering the input
      });

      res.type('text/xml');
      res.send(twiml.toString());
    } else {
      console.error('User not found');
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error handling subject:', error);
    res.status(500).send('Error handling subject');
  }
};

/**
 * addParticipant
 * 
 * Action: Handles the user's input to add another participant.
 * - If user presses '1', prompts for the new participant's phone number.
 * - If any other key is pressed, proceeds to start recording.
 * 
 * Next Controller: joinConference or startRecording
 */
twilioController.addParticipant = async (req, res) => {
  const digit = req.body.Digits;
  const callSid = req.body.CallSid;
  const conferenceName = `Conference-${callSid}`;

  const twiml = new VoiceResponse();

  if (digit === '1') {
    twiml.say('Please enter the phone number of the person to add, followed by the pound sign.');
    twiml.gather({
      action: '/api/joinConference',
      method: 'POST',
      numDigits: 11, // Assuming US numbers with country code, e.g., +12345678901
      timeout: 10
    });
  } else {
    twiml.say('Proceeding to record your conversation.');
    twiml.redirect('/api/startRecording');
  }

  res.type('text/xml');
  res.send(twiml.toString());
};

/**
 * joinConference
 * 
 * Action: Adds the new participant to the existing conference.
 * - Dials the new participant and joins them to the conference.
 * 
 * Next Controller: startRecording
 */
twilioController.joinConference = async (req, res) => {
  const phoneNumber = req.body.Digits;
  const callSid = req.body.CallSid;
  const conferenceName = `Conference-${callSid}`;

  const twiml = new VoiceResponse();
  const dial = twiml.dial();
  dial.conference({
    record: 'record-from-start',
    recordingTrack: 'individual',
    startConferenceOnEnter: true,
    endConferenceOnExit: false
  }, conferenceName);

  // Initiate the call to the new participant
  client.calls
    .create({
      url: `${process.env.SERVER_ADDRESS}/api/joinConferenceCall?conferenceName=${conferenceName}`,
      to: phoneNumber,
      from: process.env.TWILIO_PHONE_NUMBER
    })
    .then(call => {
      console.log(`Dialing new participant: ${phoneNumber}, Call SID: ${call.sid}`);
    })
    .catch(error => {
      console.error('Error dialing new participant:', error);
    });

  res.type('text/xml');
  res.send(twiml.toString());
};

/**
 * joinConferenceCall
 * 
 * Action: Handles the incoming call to join the conference.
 * - Joins the caller to the specified conference.
 * 
 * Next Controller: startRecording
 */
twilioController.joinConferenceCall = async (req, res) => {
  const conferenceName = req.query.conferenceName;

  const twiml = new VoiceResponse();
  twiml.dial().conference({
    record: 'record-from-start',
    recordingTrack: 'individual',
    startConferenceOnEnter: true,
    endConferenceOnExit: false
  }, conferenceName);

  res.type('text/xml');
  res.send(twiml.toString());
};

/**
 * startRecording
 * 
 * Action: Starts recording the conference.
 * - Joins the caller to the conference with individual recordings enabled.
 * 
 * Next Controller: handleTranscription
 */
twilioController.startRecording = (req, res) => {
  console.log("In twilioController.startRecording(3/7); ");
  const callSid = req.body.CallSid;
  const conferenceName = `Conference-${callSid}`;
  const twiml = new VoiceResponse();
  twiml.say('Recording has started. You may now begin your conversation.');
  twiml.dial().conference({
    record: 'record-from-start',
    recordingTrack: 'individual',
    startConferenceOnEnter: true,
    endConferenceOnExit: false
  }, conferenceName);
  
  res.type('text/xml');
  res.send(twiml.toString());
};

/**
 * handleTranscription
 * 
 * Action: Handles the completion of the recording.
 * - Saves the recording URL to the user's transcriptions.
 * - Ends the call.
 * 
 * Next Controller: None (call ends)
 */
twilioController.handleTranscription = async (req, res, next) => {
  const recordingUrl = req.body.RecordingUrl;
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  res.locals.number = callerPhoneNumber;

  console.log("in twilioController.handleTranscription(4/7);", recordingUrl);

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const transcription = user.transcriptions[user.transcriptions.length - 1];
      transcription.audioUrl = recordingUrl;
      transcription.length = "pending"; // Save the duration if you want to store it
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

/**
 * handleFallback
 * 
 * Action: Handles fallback scenarios.
 * 
 * Next Controller: None
 */
twilioController.handleFallback = (req, res) => {
  res.send('Fallback logic here');
};

/**
 * handleStatus
 * 
 * Action: Handles call status changes.
 * 
 * Next Controller: None
 */
twilioController.handleStatus = (req, res) => {
  res.send('Call status change handling logic here');
};

module.exports = twilioController;
