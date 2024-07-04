const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const emailController = {};

const transporter = nodemailer.createTransport({
  service: 'Yahoo',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

emailController.sendTranscript = async (req, res, next) => {
  const email = res.locals.email;
  const user = res.locals.user;

  if (email === "") {
    return next();
  }

  try {
    // Extract the text from the "subject" transcription
    const subjectTranscriptionPath = res.locals.subjectTranscription;
    const subjectTranscriptionText = fs.readFileSync(subjectTranscriptionPath, 'utf8');

    // Read the HTML template and replace placeholders
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', user.name);
    htmlContent = htmlContent.replace('{{pdfLink}}', res.locals.transcriptionPdfLink);
    htmlContent = htmlContent.replace('{{wordLink}}', res.locals.transcriptionWordLink);

    // Create mail options
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: subjectTranscriptionText, // Use the subject transcription as the email subject
      html: htmlContent,
    };

    console.log('Sending email...');
    await transporter.sendMail(mailOptions);
    console.log('Email sent successfully!');
  } catch (error) {
    console.error('Error sending email:', error);
    return next(error);
  }

  return next();
};

module.exports = emailController;