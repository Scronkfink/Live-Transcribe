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
  const conferenceName = `Conference-${req.body.CallSid}`; // Unique conference name based on caller's SID
  const ownerCallSid = req.body.CallSid; // Capture moderator's CallSid

  console.log("In twilioController.handleVoice (1/7); this is the caller's number: ", callerPhoneNumber);
  
  try {
    const user = await User.findOne({ phone: callerPhoneNumber }); // Fetch user by phone number
    
    if (user) {
      const preRecordedVoiceUrl = `${process.env.SERVER_ADDRESS}/api/intro`;
      res.locals.username = user.name.split(' ')[0];
      res.locals.participantCount = 1;

      const message = `Hey ${res.locals.username}, after the beep, please tell me what you want the subject of the conversation to be.`;

      // Call ElevenLabs API to generate a personalized message
      const elevenLabsResponse = await axios.post('https://api.elevenlabs.io/v1/text-to-speech/t8Np6Kzi4OFDJT2X3tfD', {
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
      fs.writeFileSync(personalizedMessagePath, audioBuffer); // Save personalized message

      const personalizedMessageUrl = `${process.env.SERVER_ADDRESS}/api/personalized/${path.basename(personalizedMessagePath)}`;


      // Play pre-recorded and personalized messages in the conference
      twiml.play(preRecordedVoiceUrl);
      twiml.play(personalizedMessageUrl);

      // Record the user’s response with the conference name in the query
      twiml.record({
        action: `/api/subject?conferenceName=${conferenceName}&ownerCallSid=${encodeURIComponent(ownerCallSid)}`,
        method: 'POST',
        maxLength: 4,
        playBeep: true
      });
      
    } else {
      twiml.say('Hello, I could not find your details. Please provide your name and email.');
    }

  } catch (error) {
    console.error('Error fetching user or generating personalized message:', error);
    twiml.say('Sorry, there was an error processing your request. Please try again later.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
};

// Updated handleSubject to pass down conferenceName
twilioController.handleSubject = async (req, res) => {
  console.log("In twilioController.handleSubject (2/7); ");
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  const recordingUrl = req.body.RecordingUrl || 'No recording URL provided';
  const conferenceName = req.query.conferenceName; // Retrieve conference name
  res.locals.participantCount = 1;
  const ownerCallSid = req.query.ownerCallSid;

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const transcription = {
        email: user.email,
        subject: "Pending transcription",
        subjectUrl: recordingUrl,
        body: 'Pending transcription',
        timestamp: new Date()
      };

      user.transcriptions.push(transcription);
      await user.save();

      const twiml = new VoiceResponse();
      const gather = twiml.gather({
        action: `/api/addParticipant?conferenceName=${conferenceName}&participantCount=${res.locals.participantCount}&username=${encodeURIComponent(user.name)}&ownerCallSid=${encodeURIComponent(ownerCallSid)}`,
        method: 'POST',
        numDigits: 1,
        timeout: 5
      });
      gather.play(`${process.env.SERVER_ADDRESS}/api/recording`);

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

// Updated addParticipant to include conferenceName in join request
twilioController.addParticipant = async (req, res) => {
  console.log("In twilioController.addParticipant; this is digits: ", req.body.Digits);
  const digit = req.body.Digits;
  const participantCount = parseInt(req.query.participantCount, 10) || 1;
  const username = req.query.username;
  const conferenceName = req.query.conferenceName; // Retrieve conference name
  const ownerCallSid = req.query.ownerCallSid

  const twiml = new VoiceResponse();

  if (digit === '1') {
    twiml.say('Please enter the phone number of the person to add, followed by the pound sign.');
    twiml.gather({
      action: `/api/joinConference?conferenceName=${conferenceName}&participantCount=${participantCount + 1}&username=${encodeURIComponent(username)}&ownerCallSid=${encodeURIComponent(ownerCallSid)}`,
      method: 'POST',
      numDigits: 11,
      timeout: 10
    });
  } else {
    twiml.redirect(`/api/startRecording?conferenceName=${conferenceName}&participantCount=${participantCount}&ownerCallSid=${encodeURIComponent(ownerCallSid)}`);
  }

  res.type('text/xml');
  res.send(twiml.toString());
};

// Updated joinConference to use conferenceName for adding participant to existing conference
twilioController.joinConference = async (req, res) => {
  console.log("In twilioController.joinConference");
  const phoneNumber = req.body.Digits;
  const participantCount = parseInt(req.query.participantCount, 10)
  const conferenceName = req.query.conferenceName; // Use existing conference name
  const username = req.query.username;
  const ownerCallSid = req.query.ownerCallSid;

  if (!phoneNumber) {
    console.error("Phone number is missing.");
    return res.status(400).send('Phone number is missing.');
  }

  // Initiate conference for the moderator
  const twimlCaller = new VoiceResponse();
  twimlCaller.say(`Please wait while we call.`);
  twimlCaller.dial().conference({
    startConferenceOnEnter: false,
    endConferenceOnExit: true,
    waitUrl: '', // No hold music for the moderator, allows direct joining
  }, conferenceName);

  res.type('text/xml');
  res.send(twimlCaller.toString());

  // Call the new participant and connect them to the conference when they answer
  const twimlCallee = new VoiceResponse();
  twimlCallee.say(`You have been added to a conference call hosted by ${username}. The meeting will begin shortly.`);
  twimlCallee.dial().conference({
    startConferenceOnEnter: true,
    endConferenceOnExit: false, // Keep the conference active even if participant leaves
    waitUrl: '', // Empty to prevent hold music for the participant
  }, conferenceName);

  client.calls.create({
    url: `${process.env.SERVER_ADDRESS}/api/joinConferenceCall?conferenceName=${conferenceName}&username=${encodeURIComponent(username)}`,
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    statusCallback: `${process.env.SERVER_ADDRESS}/api/calleeJoined?ownerCallSid=${encodeURIComponent(ownerCallSid)}&conferenceName=${conferenceName}&participantCount=${participantCount}`,
    statusCallbackEvent: ['answered'],
    statusCallbackMethod: 'POST'
  }).then(call => {
    console.log(`Dialing new participant: ${phoneNumber}, Call SID: ${call.sid}`);
  }).catch(error => {
    console.error('Error dialing new participant:', error);
  });
};

twilioController.joinConferenceCall = async (req, res) => {
  const conferenceName = req.query.conferenceName; // Retrieve the conference name from the query
  const username = req.query.username; // Get the moderator's name

  console.log(`Joining participant to conference: ${conferenceName}`);

  const twiml = new VoiceResponse();

  // Announce the moderator's name before joining
  twiml.say(`You have been added to a conference call by ${username}.`);
  
  // Dial into the conference
  twiml.dial().conference({
    startConferenceOnEnter: false, // Keeps participant in waiting room until moderator starts
    endConferenceOnExit: false,    // Conference stays active even if this participant leaves
  }, conferenceName);

  // Send the TwiML response to Twilio
  res.type('text/xml');
  res.send(twiml.toString());
};


twilioController.calleeJoined = async (req, res) => {
  console.log("in CalleeJoined")
  const conferenceName = req.query.conferenceName; // Use existing conference name
  const ownerCallSid = req.query.ownerCallSid;
  const calleePhoneNumber = req.body.To; // Callee's phone number
  const participantCount = parseInt(req.query.participantCount, 10);

  try {
    // Retrieve participant count and username dynamically from your data source or database
    const user = await User.findOne({ phone: req.body.From.replace(/^\+1/, '') });
    const username = user ? user.name.split(' ')[0] : 'User'; // Default username if none found

    // Construct TwiML to notify the owner
    const twiml = new VoiceResponse();
    twiml.say(`Someone has joined the call. Press 1 to add another caller or any other key to proceed with recording.`);
    twiml.gather({
      action: `/api/addParticipant?participantCount=${participantCount}&username=${encodeURIComponent(username)}&conferenceName=${encodeURIComponent(conferenceName)}&ownerCallSid=${encodeURIComponent(ownerCallSid)}`,
      method: 'POST',
      numDigits: 1,
      timeout: 5
    });

    // Update the owner's call with the new TwiML
    await client.calls(ownerCallSid)
      .update({ twiml: twiml.toString() });

    console.log(`Notified owner that ${calleePhoneNumber} has joined the call in conference ${conferenceName}.`);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error notifying owner:', error);
    res.sendStatus(500);
  }
};


twilioController.startRecording = (req, res) => {
  console.log("In twilioController.startRecording")
  const participantCount = parseInt(req.query.participantCount, 10) || 1;
  const twiml = new VoiceResponse();
  
  // Play a beep sound to signal the start of recording
  twiml.play(`${process.env.SERVER_ADDRESS}/api/beep`);
  
  // Begin recording, allowing any key to end the recording
  twiml.record({
    action: `/api/twilioTranscription?participantCount=${participantCount}`,
    method: 'POST',
    maxLength: process.env.TWILIO_MAX_LENGTH || 600,
    playBeep: true,
    finishOnKey: '0123456789#*'
  });
  
  twiml.play(`${process.env.SERVER_ADDRESS}/api/end`);
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
};


twilioController.handleTranscription = async (req, res, next) => {
  console.log("in twilioController.handleTranscription; this is req.body: ", req.body);


  const recordingUrl = req.body.RecordingUrl;
  const callerPhoneNumber = req.body.From.replace(/^\+1/, '');
  res.locals.number = callerPhoneNumber;

  try {
    const user = await User.findOne({ phone: callerPhoneNumber });

    if (user) {
      const twiml = new VoiceResponse();
      twiml.play(`${process.env.SERVER_ADDRESS}/api/end`);
      twiml.hangup();

      res.type('text/xml');
      res.send(twiml.toString());

      const transcription = user.transcriptions[user.transcriptions.length - 1];
      transcription.audioUrls = transcription.audioUrls || [];
      transcription.audioUrls.push(recordingUrl);

      const expectedRecordings = parseInt(req.query.participantCount, 10) || 1;
      const receivedRecordings = transcription.audioUrls.length;

      if (receivedRecordings === expectedRecordings) {
        res.locals.receivedRecordings = receivedRecordings;
        await user.save();
        next();
      } else {
        await user.save();
        console.log(`Waiting for more recordings: ${receivedRecordings}/${expectedRecordings} received.`);
        res.sendStatus(200);
      }
    } else {
      res.status(404).send('User not found');
    }
  } catch (error) {
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
