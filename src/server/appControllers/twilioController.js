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
    console.log("Phone number to send 2FA code:", phone);
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // Generate a random 6-digit code
    console.log("Generated 2FA code:", code);

    // Save the 2FA code and expiration time to the user's record in the database
    const updatedUser = await User.findOneAndUpdate(
      { phone: phone },
      { twoFactorCode: code, twoFactorExpires: Date.now() + 5 * 60 * 1000 }, // Code expires in 5 minutes
      { new: true }
    );

    if (!updatedUser) {
      console.error("Failed to update user with 2FA code");
      return res.status(500).json({ message: 'Failed to update user with 2FA code' });
    }

    console.log("Updated user with 2FA code:", updatedUser);

    // Send the 2FA code via SMS using Twilio
    const message = await client.messages.create({
      body: `Howdy! This is Live-Transcribe. Your verification code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    console.log("Sent 2FA code via SMS:", message.sid);

    res.status(202).json({ 
      message: '2FA code sent',
      email: updatedUser.email,
      phone: updatedUser.phone,
      name: updatedUser.name,
      sessionToken: null // Include other fields as necessary
    });
  } catch (error) {
    console.error("Error in twilioController.twoFactor:", error);
    res.status(500).json({ message: 'Failed to send 2FA code' });
  }
};

module.exports = twilioController;