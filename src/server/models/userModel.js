const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  title: { type: String, required: false },
  company: { type: String, required: false }
});

const User = mongoose.model('User', userSchema);

module.exports = User;