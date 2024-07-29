const userController = {};
const User = require('../models/userModel.js');
const Session = require('../models/sessionModel.js');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

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
    console.log("APP user.controller.signIn; session not found.");
    // Store the user's phone in res.locals and proceed to the next controller
    res.locals.phone = user.phone;
    next();

  } catch (error) {
    // Handle any errors that occur during the process
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


module.exports = userController;