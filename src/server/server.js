const express = require('express');
const http = require('http');
const path = require('path');
const app = express();
const server = http.createServer(app);

const { upload, transcriptionController } = require('./controllers/transcriptionController');

app.use(express.json());
app.use(express.static(path.join(__dirname, '../../dist')));

app.use((req, res, next) => {
  const allowedOrigins = ['https://ancestryai.xyz', 'http://localhost:8080'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});

app.post('/api/transcription', upload.single('file'), transcriptionController.transcribe, (req, res) => {
  res.send({ transcription: res.locals.transcription });
});

app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../../dist/index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});