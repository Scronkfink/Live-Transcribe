require('dotenv').config();
const twilio = require('twilio');
const User = require('../models/userModel.js');

const twilioController = {};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

twilioController.twoFactor = async (req, res, next) => {

  console.log("APP twilioController.twoFactor; this is req.body: ", req.body);
  try {
    const phone = res.locals.phone;
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a random 6-digit code

    // Save the 2FA code and expiration time to the user's record in the database
    await User.findOneAndUpdate(
      { phone: phone },
      { twoFactorCode: code, twoFactorExpires: Date.now() + 5 * 60 * 1000 }, // Code expires in 5 minutes
      { new: true }
    );

    // Send the 2FA code via SMS using Twilio
    await client.messages.create({
      body: `Your 2FA code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    res.status(202).json({ message: '2FA code sent' });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: 'Failed to send 2FA code' });
  }
};

module.exports = twilioController;