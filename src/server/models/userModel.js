const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
  email: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: false },
  audioUrl: { type: String, required: false }
});

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  title: { type: String, required: false },
  company: { type: String, required: false },
  transcriptions: [transcriptionSchema]
});

const User = mongoose.model('User', userSchema);

module.exports = User;