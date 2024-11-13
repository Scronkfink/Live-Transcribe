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
      const preRecordedVoiceUrl = `${process.env.SERVER_ADDRESS}/api/intro`;
      res.locals.username = user.name.split(' ')[0];
      res.locals.participantCount = 1; // Pre-recorded intro URL

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
        maxLength: 4,
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
  res.locals.participantCount = 1;
  
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

      // Corrected: Use '&' to separate query parameters
      const gather = twiml.gather({
        action: `/api/addParticipant?participantCount=${res.locals.participantCount}&username=${encodeURIComponent(user.name)}`,
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
  console.log("In twilioController.addParticipant; this is digits: ", req.body.Digits);
  const digit = req.body.Digits;
  const participantCount = parseInt(req.query.participantCount, 10) || 1;
  const username = req.query.username;
  console.log("Participant count:", participantCount);
  console.log("Username:", username);

  const twiml = new VoiceResponse();

  if (digit === '1') {
    console.log("Digit '1' detected, prompting for new participant's phone number.");
    twiml.say('Please enter the phone number of the person to add, followed by the pound sign.');
    twiml.gather({
      action: `/api/joinConference?participantCount=${participantCount + 1}&username=${encodeURIComponent(username)}`,
      method: 'POST',
      numDigits: 11,
      timeout: 10
    });
  } else {
    console.log("Digit not '1', redirecting to startRecording.");
    twiml.redirect(`/api/startRecording?participantCount=${participantCount}`);
  }
  
  res.type('text/xml');
  console.log("Sending TwiML response to Twilio.");
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
  console.log("In twilioController.joinConference");
  console.log("Received req.body:", req.body);
  console.log("Received req.query:", req.query);

  const phoneNumber = req.body.Digits;
  const participantCount = parseInt(req.query.participantCount, 10) || 1;
  const conferenceName = `Conference-${req.body.CallSid}`;
  const username = req.query.username; 
  const ownerCallSid = req.body.CallSid; 

  console.log("Phone number entered:", phoneNumber);
  console.log("Conference name:", conferenceName);
  console.log("Username:", username);
  console.log("Owner CallSid:", ownerCallSid);

  if (!phoneNumber) {
    console.error("Phone number is missing.");
    return res.status(400).send('Phone number is missing.');
  }

  const twimlCaller = new VoiceResponse();
  twimlCaller.say(`Please wait while we call ${phoneNumber}.`);
  twimlCaller.play({ loop: 10 }, 'http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3');

  res.type('text/xml');
  console.log("Sending TwiML response for the original caller.");
  res.send(twimlCaller.toString());

  const twimlCallee = new VoiceResponse();
  twimlCallee.say(`You have been added to a conference call hosted by ${username}. The meeting should begin shortly.`);
  twimlCallee.play({ loop: 10 }, 'http://com.twilio.music.classical.s3.amazonaws.com/BusyStrings.mp3');

  console.log("Attempting to create call to new participant.");
  client.calls.create({
    url: `${process.env.SERVER_ADDRESS}/api/joinConferenceCall?conferenceName=${conferenceName}`,
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
    statusCallback: `${process.env.SERVER_ADDRESS}/api/calleeJoined?ownerCallSid=${ownerCallSid}`,
    statusCallbackEvent: ['answered'],
    statusCallbackMethod: 'POST'
  }).then(call => {
    console.log(`Dialing new participant: ${phoneNumber}, Call SID: ${call.sid}`);
  }).catch(error => {
    console.error('Error dialing new participant:', error);
  });
};




twilioController.calleeJoined = async (req, res) => {
  const ownerCallSid = req.body.ownerCallSid; // Retrieved from statusCallbackParameters
  const calleePhoneNumber = req.body.To; // Callee's phone number

  try {
    // Retrieve participantCount and username from existing data or pass them as needed
    const participantCount = 1; // Example value; adjust as necessary
    const username = 'User'; // Retrieve the actual username as needed

    // Construct TwiML to notify the owner
    const twiml = new VoiceResponse();
    twiml.say(`${calleePhoneNumber} has joined the call. Press 1 to add another caller or any other key to proceed with recording.`);
    twiml.gather({
      action: `/api/addParticipant?participantCount=${participantCount}&username=${encodeURIComponent(username)}`,
      method: 'POST',
      numDigits: 1,
      timeout: 5
    });

    // Update the owner's call with the new TwiML
    await client.calls(ownerCallSid)
      .update({ twiml: twiml.toString() });

    console.log(`Notified owner that ${calleePhoneNumber} has joined the call.`);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error notifying owner:', error);
    res.sendStatus(500);
  }
};


twilioController.notifyOwnerOnCalleeJoin = async (req, res) => {
  const phoneNumber = req.query.phoneNumber;
  const twiml = new VoiceResponse();

  twiml.say(`${phoneNumber} has joined the call. Press 1 to add another caller or any other key to proceed with recording.`);
  twiml.gather({
    action: `/api/addParticipant?participantCount=`, // Adjust as needed
    method: 'POST',
    numDigits: 1,
    timeout: 5
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

  // Join the conference
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
