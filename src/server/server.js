if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const twilioController = require('./controllers/twilioController');
const userController = require('./controllers/userController');
const { upload, transcriptionController } = require('./controllers/transcriptionController');

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dist')));

//CORS
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://live-transcribe-38d0d2c8a46e.herokuapp.com',
    'http://localhost:8080',
    'https://*.twilio.com',
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.some(allowedOrigin => origin.includes(allowedOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

app.post('/api/voice', twilioController.handleVoice, (req, res) => {
  res.send({ message: 'Voice endpoint hit' });
});
app.post('/api/fallback', twilioController.handleFallback, (req, res) => {
  res.send({ message: 'Fallback endpoint hit' });
});
app.post('/api/recording', twilioController.handleRecording, (req, res) => {
  res.send({ message: 'Recording endpoint hit' });
});
app.post('/api/subject', twilioController.handleSubject, (req, res) => {
  res.send({ message: 'Subject endpoint hit' });
});
app.post('/api/twilioTranscription', twilioController.handleTranscription, (req, res) => {
  res.send({ message: 'Transcription endpoint hit' });
});
app.post('/api/status', twilioController.handleStatus, (req, res) => {
  res.send({ message: 'Status endpoint hit' });
});

app.post('/api/transcription', upload.single('file'), transcriptionController.transcribe, (req, res) => {
  res.send({ transcription: res.locals.transcription });
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