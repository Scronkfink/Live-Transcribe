require('dotenv').config();
const twilio = require('twilio');
const User = require('../models/userModel.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const twilioController = {};

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const SECRET_KEY = process.env.SECRET_KEY
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

    // console.log("Updated user with 2FA code:", updatedUser);

    // Send the 2FA code via SMS using Twilio
    const message = await client.messages.create({
      body: `Howdy! This is Live-Transcribe. Your verification code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone
    });

    console.log("Sent 2FA code via SMS to: ", updatedUser.phone);

    res.status(202).json({ 
      message: '2FA code sent',
      email: updatedUser.email,
      phone: updatedUser.phone,
      name: updatedUser.name,
      sessionToken: null,
      notifications: {
        sms: updatedUser.notifications?.sms || true, // Default to false if undefined
        email: updatedUser.notifications?.email || true, // Default to false if undefined
        app: updatedUser.notifications?.app || true // Default to false if undefined
      } // Include other fields as necessary
    });
  } catch (error) {
    console.error("Error in twilioController.twoFactor:", error);
    res.status(500).json({ message: 'Failed to send 2FA code' });
  }
};

twilioController.fallback = async (req, res, next) => {
  const { MessageStatus } = req.body;

  // Check if the message was delivered successfully
  if (MessageStatus === 'delivered') {
    console.log('Message delivered successfully.');
    res.status(200).end(); // End the request once processed
  } else if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
    console.error('Failed to deliver the message.');
    res.status(500).json({ message: 'Message delivery failed' });
  } else {
    console.log('Message status:', MessageStatus);
    res.status(200).end(); // Acknowledge the status update
  }
};

twilioController.transcriptionReady = async (req, res, next) => {
  console.log("APP; in twilioController.transcriptionReady (6/7); this is the phoneNumber & twilioNumber: ", res.locals.phone, twilioPhoneNumber);

  try {
    const transcriptionPDF = res.locals.transcriptionPdfPath;

    // Check if SMS notifications are enabled
    if (!res.locals.smsNotification) {
      console.log("SMS notifications are disabled. Skipping SMS notification.");
      return next(); // Skip sending the SMS and proceed to the next middleware
    }

    const phoneNumber = res.locals.phone;

    if (!phoneNumber) {
      return res.status(400).send('Phone number not found in res.locals');
    }

    // Generate the secure signed URL
    const signedUrl = generateSignedUrl(transcriptionPDF);

    // console.log("Generated signed URL:", signedUrl);
    
    // Send the SMS with the signed URL
    await client.messages.create({
      body: `Your transcription "${res.locals.subject}" is ready. You can access it through a secure URL here: ${signedUrl}`,
      from: twilioPhoneNumber,
      to: phoneNumber
    });

    console.log(`Message sent to ${phoneNumber} with secure URL`);
    next();
  } catch (error) {
    console.error('Failed to send message:', error);
    next(error);
  }
};

function generateSignedUrl(filePath, expiresIn = 3600) {
  const expirationTime = Math.floor(Date.now() / 1000) + expiresIn;

  // console.log("Original filePath:", filePath);
  
  const signature = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`${filePath}:${expirationTime}`)
    .digest('hex');

  return `${process.env.BASE_URL}/app/download?filePath=${encodeURIComponent(
    filePath
  )}&expires=${expirationTime}&signature=${signature}`;
};

module.exports = twilioController;