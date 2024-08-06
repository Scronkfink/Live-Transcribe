const userController = {};
const User = require('../models/userModel.js');
const Session = require('../models/sessionModel.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

// Updated signIn function to check the user's credentials in the database
userController.signIn = async (req, res, next) => {
  const { email, password } = req.body;

  console.log("APP userController.signIn; this is req.body: ", req.body);
  try {
    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      // If the user is not found, return an error
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      // If the password does not match, return an error
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check for an existing valid session
    const existingSession = await Session.findOne({ userId: user._id, expiresAt: { $gt: new Date() } });

    if (existingSession) {
      // If a valid session exists, skip 2FA
      return res.status(202).json({
        message: 'Successfully signed in without 2FA',
        email: user.email,
        phone: user.phone,
        name: user.name,
        sessionToken: existingSession.token // Include the session token in the response
      });
    }

    console.log("APP user.controller.signIn; session not found. Procceeding to 2fa");
    // Store the user's phone in res.locals and proceed to the next controller
    res.locals.phone = user.phone;
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
  const { email, code } = req.body;

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
        token: sessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Set session to expire in 24 hours
      });
      await session.save();

      return res.status(200).json({
        message: '2FA verification successful',
        sessionToken: sessionToken // Include the session token in the response
      });
    } else {
      // If the code does not match or is expired, return an error
      return res.status(401).json({ message: 'Invalid email or code' });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.signUp = async (req, res) => {
  let { email, phone, password, firstName } = req.body;

  const name = firstName;

  console.log("APP userController.signUp; this is req.body: ", req.body);

  // Remove dashes from phone number
  phone = phone.replace(/-/g, "");

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
      name 
    });

    // Save the user to the database
    await newUser.save();
    console.log("APP user.controller.signUp; user added successfully");
    // Return success response
    return res.status(202).json({ message: 'User successfully signed up', email: newUser.email, phone: newUser.phone, name: newUser.name });

  } catch (error) {
    // Handle any errors that occur during the process

    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.createTranscription = async (req, res, next) => {
  console.log("APP; in userController.createTranscription");
  
  const { email, subject, length } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newTranscription = {
      email: email,
      subject: subject,
      length: Math.floor(length),
      timestamp: new Date(),
      completed: false
    };

    user.transcriptions.push(newTranscription);
    await user.save();

    console.log(`New transcription added for user: ${email}`);
    next()
  } catch (error) {
    console.error('Error creating transcription:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

userController.uploadTranscription = async (req, res, next) => {
  console.log("APP; in userController.uploadTranscription");

  const { email, subject } = req.body;
  const pdfFilePath = res.locals.transcriptionPdfPath;

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
    transcription.completed = true;

    await user.save();

    console.log(`Transcription updated with PDF and marked as completed for user: ${email}`);
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

module.exports = userController;