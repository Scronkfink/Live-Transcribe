const User = require('../models/userModel.js');

const userController = {};

userController.addUser = async (req, res) => {
  const { email, name, phone } = req.body;

  if (!email || !name || !phone) {
    return res.status(400).json({ error: 'Please provide email, name, and phone number.' });
  }
  try {
    const newUser = new User({ email, name, phone });
    await newUser.save();
    res.status(202).json({ message: 'User added successfully', user: newUser });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = userController;