const userController = {};
const User = require('../models/userModel.js');
const bcrypt = require('bcrypt');

// Updated signIn function to check the user's credentials in the database
userController.signIn = async (req, res) => {
  const { email, password } = req.body;

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

    // If the credentials are correct, return a success message along with user details
    return res.status(200).json({
      message: 'Successfully signed in',
      email: user.email,
      phone: user.phone, // Assuming the user model has a phone field
    });

  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};

userController.signUp = async (req, res) => {
  const { email, phone, password } = req.body;

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
    });

    // Save the user to the database
    await newUser.save();

    // Return success response
    return res.status(201).json({ message: 'User successfully signed up', email: newUser.email, phone: newUser.phone });

  } catch (error) {
    // Handle any errors that occur during the process
    console.error(error);
    return res.status(500).json({ message: 'Server error' });
  }
};


module.exports = userController;