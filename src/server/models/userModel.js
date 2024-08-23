const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const transcriptionSchema = new mongoose.Schema({
  email: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: false },
  audioUrl: { type: String, required: false },
  timestamp: { type: Date, default: Date.now },
  pdf: { type: Buffer, required: false },
  pdfSize: { type: String, required: false},
  length: {type: String, required: false},
  completed: {type: Boolean, required: false},
  summary: { type: Buffer, required: false }
});

const notificationsSchema = new mongoose.Schema({
  email: { type: Boolean, required: false, default: true },
  sms: { type: Boolean, required: false, default: true },
  app: { type: Boolean, required: false, default: true },
});

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  title: { type: String, required: false },
  company: { type: String, required: false },
  transcriptions: [transcriptionSchema],
  notifications: notificationsSchema,
  twoFactorCode: { type: String, required: false },
  twoFactorExpires: { type: Date, required: false },
  deviceIdentifier: { type: String, required: false }
});

// Pre-save hook to hash the password before saving the user
userSchema.pre('save', async function(next) {
  if (this.isModified('password') || this.isNew) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  next();
});

const User = mongoose.model('User', userSchema);

module.exports = User;