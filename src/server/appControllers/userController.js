const userController = {};
const User = require('../models/userModel.js');
const Session = require('../models/sessionModel.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');


userController.signIn = async (req, res, next) => {
  const { email, password, deviceIdentifier } = req.body;

  console.log("APP userController.signIn; this is req.body: ", req.body);

  // //THIS IS FOR APP DEVELOPER ONLY
  // if (email === "jacksonchanson@gmail.com" && password === "Butch0200") {
  //   // Find the user by email
  //   const user = await User.findOne({ email: "jacksonchanson@gmail.com" });

  //   if (!user) {
  //     // If the user is not found, return an error
  //     console.log("APP userController.signIn; user not found");
  //     return res.status(402).json({ message: 'Invalid credentials' });
  //   }

  //   // Directly return the user's information without checking for a session
  //   return res.status(202).json({
  //     message: 'Successfully signed in',
  //     email: user.email,
  //     phone: user.phone,
  //     name: user.name,
  //     deviceIdentifier: user.deviceIdentifier, // Include the device identifier
  //     notifications: {
  //       sms: user.notifications?.sms || false, // Default to false if undefined
  //       email: user.notifications?.email || false, // Default to false if undefined
  //       app: user.notifications?.app || false // Default to false if undefined
  //     }
  //   });
  // } 

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      // If the user is not found, return an error
      console.log("APP userController.signIn; user not found")
      return res.status(402).json({ message: 'Invalid credentials' });
    }

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // If the password does not match, return an error
      return res.status(402).json({ message: 'Invalid credentials' });
    }

    // Check for an existing valid session
    const existingSession = await Session.findOne({ userId: user._id, expiresAt: { $gt: new Date() } });

    if (existingSession) {

      existingSession.expiresAt = new Date(Date.now() + 168 * 60 * 60 * 1000); // Example: extend by 7 days
      await existingSession.save();
      // If a valid session exists, skip 2FA
      return res.status(202).json({
        message: 'Successfully signed in without 2FA',
        email: user.email,
        phone: user.phone,
        name: user.name,
        sessionToken: existingSession.token, // Include the session token in the response
        deviceIdentifier: user.deviceIdentifier, // Include the device identifier
        notifications: {
          sms: user.notifications?.sms || false, // Default to false if undefined
          email: user.notifications?.email || false, // Default to false if undefined
          app: user.notifications?.app || false // Default to false if undefined
        }
      });
    }

    // Store the user's phone and deviceIdentifier in res.locals and proceed to the next controller
    res.locals.phone = user.phone;
    res.locals.deviceIdentifier = deviceIdentifier;

    // Update the user's deviceIdentifier in the database
    user.deviceIdentifier = deviceIdentifier;
    await user.save();

    next();

  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

function generateSessionToken() {
  return require('crypto').randomBytes(64).toString('hex');
};

userController.authenticate = async (req, res) => {

  console.log("APP; in userController.authenticate; this is req.body: ", req.body)
  const { email, code, deviceIdentifier } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      // If the user is not found, return an error
      return res.status(401).json({ message: 'Invalid email or code' });
    }

    // Check if the provided code matches the stored 2FA code and is not expired
    if (user.twoFactorCode === code && user.twoFactorExpires > Date.now()) {
      // Clear the 2FA code and expiration from the user's record
      user.twoFactorCode = null;
      user.twoFactorExpires = null;
      await user.save();

      // Generate a session token
      const sessionToken = generateSessionToken();
      const session = new Session({
        userId: user._id,
        deviceIdentifier: deviceIdentifier,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 168 * 60 * 60 * 1000) // Set session to expire in 7 days
      });
      await session.save();

      return res.status(200).json({
        message: '2FA verification successful',
        sessionToken: sessionToken // Include the session token in the response
      });
    } else {
      // If the code does not match or is expired, return an error
      return res.status(402).json({ message: 'Invalid email or code' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.signUp = async (req, res, next) => {
  let { email, phone, password, firstName, lastName, deviceIdentifier } = req.body;

  const name = `${firstName} ${lastName}`;

  console.log("APP userController.signUp; this is req.body: ", req.body);

  // Check if any necessary information is missing
  if (!email || !phone || !password || !firstName || !lastName || !deviceIdentifier) {
    return res.status(402).json({ message: 'Missing necessary information' });
  }

  // Remove dashes from phone number
  phone = phone.replace(/-/g, "");

  // Validate the phone number (assuming a U.S. phone number format)
  const phoneRegex = /^[2-9]{1}[0-9]{2}[0-9]{3}[0-9]{4}$/;
  if (!phoneRegex.test(phone)) {
    return res.status(405).json({ message: 'Invalid phone number format' });
  }

  res.locals.phone = phone;

  try {
    // Check if the user already exists
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create a new user
    const newUser = new User({
      email,
      phone,
      password, // Password will be hashed due to pre-save hook in the model
      name,
      deviceIdentifier,
      notifications: { // Add default notification settings
        email: true,
        sms: true,
        app: true
      }
    });

    // Save the user to the database
    await newUser.save();
    console.log("APP user.controller.signUp; user added successfully");
    // Return success response
    next();

  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.createTranscription = async (req, res, next) => {
  console.log("APP; in userController.createTranscription (2/7);");
  
  const { email, subject, length } = req.body;

  res.locals.phone = req.body.phone
  res.locals.subject = req.body.subject
  
  try {
    const user = await User.findOne({ email });
  
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
  
    // Save notification settings to res.locals
    res.locals.smsNotification = user.notifications?.sms ?? true; // Default to false if undefined
    res.locals.emailNotification = user.notifications?.email ?? true; // Default to false if undefined
    res.locals.appNotification = user.notifications?.app ?? true;
    res.locals.diarization = user?.diarization ?? false; // Default to false if undefined
    
    console.log("APP; in userController.createTranscription (2/7); this is res.locals.diarization: ", res.locals.diarization )
    const newTranscription = {
      email: email,
      subject: subject || "n/a",
      length: Math.floor(length) || "n/a",
      timestamp: new Date(),
      completed: false
    };
  
    user.transcriptions.push(newTranscription);
    await user.save();
  
    console.log(`New transcription added for user(2/7): ${email}`);
    next();
  } catch (error) {
    console.error('Error creating transcription:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

userController.uploadTranscription = async (req, res, next) => {
  console.log("APP; in userController.uploadTranscription (5/7);");

  const { email, subject } = req.body;
  const pdfFilePath = res.locals.transcriptionPdfPath;
  const summaryPDFBuffer = res.locals.summary;

  try {
    const user = await User.findOne({ email, "transcriptions.subject": subject });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transcription = user.transcriptions.find(transcription => transcription.subject === subject);

    if (!transcription) {
      return res.status(404).json({ message: 'Transcription not found' });
    }

    const pdfBuffer = fs.readFileSync(pdfFilePath);
    const pdfSize = (pdfBuffer.length / 1024).toFixed(2); // Calculate PDF size in KB

    transcription.pdf = pdfBuffer;
    transcription.pdfSize = `${pdfSize} KB`; // Set the pdfSize property
    transcription.summary = summaryPDFBuffer; // Set the summary property as PDF buffer
    transcription.completed = true;

    await user.save();

    console.log(`Transcription updated with PDF, summary, and marked as completed for user: ${email}`);
    next();
  } catch (error) {
    console.error('Error uploading transcription:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

userController.getTranscriptions = async (req, res) => {

  console.log("APP; in userController.getTranscriptions; this is req.body: ", req.body)
  const { email } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      // If the user is not found, return an error
      return res.status(404).json({ message: 'User not found' });
    }

    // Extract the subjects, timestamps, and size of the PDF of each transcription
    const transcriptions = user.transcriptions.map(transcription => {
      // Convert length from seconds to "MM:SS" format
      const lengthInSeconds = transcription.length;
      const minutes = Math.floor(lengthInSeconds / 60);
      const seconds = lengthInSeconds % 60;
      const formattedLength = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
      return {
          subject: transcription.subject,
          date: transcription.timestamp.toISOString().split('T')[0],
          size: transcription.pdfSize || "pending",
          length: formattedLength,
          completed: transcription.completed
      };
  });

    // Send the transcriptions back as a response
    console.log("APP; in userController.getTranscriptions; this is response: ", transcriptions)
    res.status(202).json({ transcriptions });

  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.getPDF = async (req, res) => {

  console.log("APP; in userController.getPDF; this is req.body: ", req.body);
  
  const { email, subject } = req.body;

  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      // If the user is not found, return an error
      return res.status(404).json({ message: 'User not found' });
    }

    // Find the transcription with the specified subject
    const transcription = user.transcriptions.find(t => t.subject === subject);

    if (!transcription) {
      // If the transcription is not found, return an error
      return res.status(404).json({ message: 'Transcription not found' });
    }

    if (!transcription.pdf) {
      // If the PDF is not found, return an error
      return res.status(404).json({ message: 'PDF not found' });
    }

    // Send the PDF file in the response
    res.setHeader('Content-Type', 'application/pdf');
    res.send(transcription.pdf);

  } catch (error) {
    // Handle any errors that occur during the process
    console.error('Error fetching PDF:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.deleteTranscription = async (req, res) => {
  try {
      const { email, subject } = req.body;

      // Find the user by email
      let user = await User.findOne({ email: email });

      if (!user) {
          return res.status(404).json({ message: "User not found" });
      }

      // Remove the transcription with the given subject
      user.transcriptions = user.transcriptions.filter(transcription => transcription.subject !== subject);

      // Save the updated user
      await user.save();

      res.status(200).json({ success: true, message: "Transcription deleted successfully" });
  } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
  }
};

userController.getSummary = async (req, res) => {
  const { email, subject, phoneNumber } = req.body;

  try {
    const user = await User.findOne({ email, "transcriptions.subject": subject });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transcription = user.transcriptions.find(transcription => transcription.subject === subject);

    if (!transcription) {
      return res.status(404).json({ message: 'Transcription not found' });
    }

    const summaryPDF = transcription.summary;

    if (!summaryPDF) {
      return res.status(404).json({ message: 'Summary PDF not found' });
    }

    // Send the PDF summary in the response
    res.setHeader('Content-Type', 'application/pdf');
    res.send(summaryPDF);

  } catch (error) {
    console.error('Error fetching summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

userController.faceID = async (req, res) => {
  console.log("in userController.faceID; this is req.body: ", req.body);
  const { deviceIdentifier } = req.body;

  try {
    const user = await User.findOne({ deviceIdentifier });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const sessionToken = crypto.randomBytes(64).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    const session = new Session({
      userId: user._id,
      token: sessionToken,
      expiresAt: expiresAt
    });

    await session.save();

    return res.status(202).json({
      message: 'Successfully signed in with faceID',
      email: user.email,
      phone: user.phone,
      name: user.name,
      sessionToken: session.token, // Include the session token in the response 
    });
  } catch (error) {
    console.error('Error in Face ID authentication:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.updateNotifications = async (req, res) => {

  console.log("APP; in userController.updateNotifications; this is req.body: ", req.body);

  try {
    // Extract the phone number and potential notification settings from the request body
    const { phone, emailNotification, smsNotification, appNotification, diarization } = req.body;

    // Find the user by phone number
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the notifications object only if the respective field is provided in the request
    if (typeof emailNotification === 'boolean') {
      user.notifications.email = emailNotification;
    }
    if (typeof smsNotification === 'boolean') {
      user.notifications.sms = smsNotification;
    }
    if (typeof appNotification === 'boolean') {
      user.notifications.app = appNotification;
    }
    if (typeof diarization === 'boolean') {
      user.diarization = diarization;
    }

    // Save the updated user
    await user.save();
    console.log()
    return res.status(200).json({ message: 'Notification settings updated successfully' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.updateInfo = async (req, res) => {

  console.log("APP; in userController.updateInfo; this is req.body: ", req.body)

  const { email, phone, newEmail, newPhone } = req.body;

  // Ensure the current email and phone are provided
  if (!email || !phone) {
    return res.status(400).json({ message: 'Current email and phone are required' });
  }

  try {
    // Find the user by current email and phone
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update the user's email if a new one is provided
    if (newEmail) {
      
      // Check if the new email already exists in the database
      const existingEmailUser = await User.findOne({ email: newEmail });
      if (existingEmailUser) {
        console.log("New email is already in use")
        return res.status(409).json({ message: 'New email is already in use' });
      }
      user.email = newEmail;
    }

    // Update the user's phone if a new one is provided
    if (newPhone) {
      // Check if the new phone already exists in the database
      const existingPhoneUser = await User.findOne({ phone: newPhone });
      if (existingPhoneUser) {
        console.log("New phone is already in use")
        return res.status(409).json({ message: 'New phone number is already in use' });
      }
      user.phone = newPhone;
    }

    // Save the updated user information
    await user.save();
    console.log("User successfully updated!")

    return res.status(202).json({
      message: 'Successfully updated user',
      email: user.email,
      phone: user.phone,
      name: user.name,
      deviceIdentifier: user.deviceIdentifier, // Include the device identifier
      notifications: {
        sms: user.notifications?.sms || false, // Default to false if undefined
        email: user.notifications?.email || false, // Default to false if undefined
        app: user.notifications?.app || false // Default to false if undefined
      }
    });
  } catch (error) {
    console.error('Error updating user info:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.deleteAccount = async (req, res) => {
  console.log("APP; userController.deleteAccount; this is req.body: ", req.body)
  const { phone } = req.body;  // Extract phone number from request body

  if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
  }

  try {
      // Find and delete the user by phone number
      const deletedUser = await User.findOneAndDelete({ phone });

      if (!deletedUser) {
          return res.status(404).json({ error: "User not found" });
      }

      // If deletion is successful
      console.log(`Account: ${phone} successfully deleted`);
      return res.status(202).json({ message: "Account successfully deleted" });
  } catch (error) {
      // Handle any errors during the deletion process
      console.log("Error deleting account:", error);
      return res.status(500).json({ error: "Server error. Could not delete account." });
  }
};

userController.checkSession = async (req, res) => {
  console.log('APP; in userController.checkSession; this is req.body: ', req.body);

  try {
    const { deviceIdentifier } = req.body;

    // Find the user by the deviceIdentifier in the User collection
    const user = await User.findOne({ deviceIdentifier });

    if (!user) {
      console.log('User not found');
      return res.status(402).json({ message: 'User not found' });
    }

    // Check if a session exists for the user (by their userId)
    const existingSession = await Session.findOne({ userId: user._id });

    if (!existingSession) {
      console.log('Session not found');
      return res.status(402).json({ message: 'Session not found' });
    }

    // Return the user info as requested
    console.log("User found: ", user.name)
    return res.status(202).json({
      message: 'Successfully signed in without 2FA',
      email: user.email,
      phone: user.phone,
      name: user.name,
      sessionToken: existingSession.token, // Include the session token in the response
      deviceIdentifier: existingSession.deviceIdentifier, // Include the device identifier
      notifications: {
        sms: user.notifications?.sms || false, // Default to false if undefined
        email: user.notifications?.email || false, // Default to false if undefined
        app: user.notifications?.app || false // Default to false if undefined
      }
    });
  } catch (err) {
    console.error('Error checking session:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


userController.signOut = async (req, res) => {
  console.log("APP; in userController.signOut; this is req.body: ", req.body)
  try {
    const { email } = req.body;

    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Find and delete the session associated with the user's userId
    const deletedSession = await Session.findOneAndDelete({ userId: user._id });

    if (!deletedSession) {
      return res.status(404).json({ message: 'Session not found' });
    }

    return res.status(202).json({ message: 'Successfully signed out' });
  } catch (err) {
    console.error('Error signing out:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


module.exports = userController;