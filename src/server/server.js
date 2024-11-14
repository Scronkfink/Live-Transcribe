if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const appServer = require('./appServer');
const twilioController = require('./controllers/twilioController');
const userController = require('./controllers/userController');
const emailController = require('./controllers/emailController');
const summarizationController = require('./controllers/summarizationController');
const { upload, transcriptionController } = require('./controllers/transcriptionController');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../dist')));
app.set('trust proxy', 1); 

// CORS Configuration
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://live-transcribe-38d0d2c8a46e.herokuapp.com',
    'https://livetranscribe.org',
    'https://www.livetranscribe.org',
    process.env.SERVER_ADDRESS, // Your current NGROK URL (if applicable)
    'https://*.twilio.com',
    'http://10.0.2.2',  // Android emulator (localhost equivalent)
    'http://localhost'  // Android apps on physical devices
  ];

  const origin = req.headers.origin;

  if (origin && allowedOrigins.some(allowedOrigin => {
    if (allowedOrigin.includes('*')) {
      const regex = new RegExp(allowedOrigin.replace(/\*/g, '.*'));
      return regex.test(origin);
    }
    return origin === allowedOrigin;
  })) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }

  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

// Ensure Outputs Directory Exists
const outputDir = path.join(__dirname, 'outputs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

app.use('/downloads', express.static(path.join(__dirname, 'outputs')));
app.use('/app', appServer);

// Twilio Webhook Endpoints
app.post('/api/voice', twilioController.handleVoice);
app.post('/api/subject', twilioController.handleSubject);
app.post('/api/addParticipant', twilioController.addParticipant);
app.post('/api/joinConference', twilioController.joinConference);
app.post('/api/joinConferenceCall', twilioController.joinConferenceCall);
app.post('/api/calleeJoined', twilioController.calleeJoined);

app.post('/api/startRecording', twilioController.startRecording);
app.post('/api/twilioTranscription', 
  twilioController.handleTranscription, 
  transcriptionController.twilioTranscribe,
  summarizationController.summarize,  
  emailController.sendTranscript
);
app.post('/api/status', twilioController.handleStatus);
app.post('/api/fallback', twilioController.handleFallback);

// Transcription Endpoint
const setAudioPath = (req, res, next) => {
  if (req.file && req.file.path) {
    res.locals.audioPath = req.file.path;
    console.log(`File uploaded to: ${res.locals.audioPath}`);
  } else {
    console.error('No file uploaded.');
    return res.status(400).send('No file uploaded.');
  }
  next();
};

app.post('/api/transcription', upload.single('file'), setAudioPath, transcriptionController.transcribe, emailController.uploadTranscript, (req, res) => {
  res.send({ transcription: res.locals.transcription });
});

// Email Test Endpoint
app.post("/api/email", emailController.test, (req, res) => {
  res.send({ message: 'Email Sent' });
});

// Serve Pre-recorded Audio Files
app.get('/api/intro', (req, res) => {
  const filePath = path.join(__dirname, 'voices', 'intro.mp3');
  res.sendFile(filePath);
});

app.get('/api/recording', (req, res) => {
  const filePath = path.join(__dirname, 'voices', 'Recording.mp3');
  res.sendFile(filePath);
});

app.get('/api/beep', (req, res) => {
  const filePath = path.join(__dirname, 'voices', 'beep.mp3');
  res.sendFile(filePath);
});

app.get('/api/end', (req, res) => {
  const filePath = path.join(__dirname, 'voices', 'end.mp3');
  res.sendFile(filePath);
});

// Serve Personalized Messages
app.get('/api/personalized/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(outputDir, filename);

  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error sending personalized message file:', err);
      res.status(500).send('Error sending personalized message file');
    }
  });
});

// User Endpoint
app.post("/api/user", userController.addUser, (req, res) => {
  res.send({ message: 'User endpoint hit' });
});

// Catch-All Route to Serve Frontend
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../dist/index.html'));
});

// Start Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
}).then(() => console.log('Connected to Database'))
  .catch(err => console.error('Could not connect to MongoDB...', err));
