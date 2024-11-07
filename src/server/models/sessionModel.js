const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true, unique: true },
  deviceIdentifier: { type: String, required: false, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } } // This sets the TTL
});

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;