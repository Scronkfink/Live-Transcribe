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
const summarizationController = require('./appControllers/summarizationController');
const { upload, transcriptionController } = require('./controllers/transcriptionController');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../dist')));

//CORS
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://live-transcribe-38d0d2c8a46e.herokuapp.com',
    'http://localhost:8080',
    'https://*.twilio.com',
  ];
  const origin = req.headers.origin;
  if (origin && allowedOrigins.some(allowedOrigin => origin.includes(allowedOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

app.use('/downloads', express.static(path.join(__dirname, 'output')));

app.use('/app', appServer);

app.post('/api/voice', twilioController.handleVoice, (req, res) => {
  res.send({ message: 'Voice endpoint hit' });
});

app.get('/summarize', summarizationController.summarize);

app.post('/api/subject', twilioController.handleSubject, (req, res) => {
  res.send({ message: 'Subject endpoint hit' });
});

app.post('/api/startRecording', twilioController.startRecording, (req, res) => {
  res.send({ message: 'Start recording endpoint hit' });
});

app.post('/api/twilioTranscription', 
  twilioController.handleTranscription, 
  transcriptionController.getAudio,  
  emailController.sendTranscript
);

app.post('/api/status', twilioController.handleStatus, (req, res) => {
  res.send({ message: 'Status endpoint hit' });
});

app.post('/api/fallback', twilioController.handleFallback, (req, res) => {
  res.send({ message: 'Fallback endpoint hit' });
});

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

app.post("/api/email", emailController.test, (req, res) => {
  res.send({ message: 'Email Sent' });
});

app.get('/api/intro', (req, res) => {
  const filePath = path.join(__dirname, 'voices', 'britishIntro.mp3');
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

app.post("/api/user", userController.addUser, (req, res) => {
  res.send({ message: 'User endpoint hit' });
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

mongoose.connect(process.env.MONGODB_URI, {
}).then(() => console.log('Connected to Database'))
  .catch(err => console.error('Could not connect to MongoDB...', err));