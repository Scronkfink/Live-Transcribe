const User = require('../models/userModel.js');

const userController = {};

userController.addUser = async (req, res) => {
  const { email, name, phone } = req.body;

  console.log("userController.addUser; this is req.body: ", req.body);

  // Check if all required fields are provided and phone is not null or undefined
  if (!email || !name || !phone) {
    return res.status(400).json({ error: 'Please provide email, name, and phone number.' });
  }

  try {
    console.log("Creating new user with: ", { email, name, phone });
    const newUser = new User({ email, name, phone });
    console.log("New user instance created: ", newUser);
    await newUser.save();
    console.log("User created successfully: ", newUser);
    res.status(202).json({ message: 'User added successfully', user: newUser });
  } catch (error) {
    console.error('Error adding user:', error);
    if (error.code === 11000) {
      res.status(409).json({ error: 'User with this phone number already exists.' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
};

module.exports = userController;