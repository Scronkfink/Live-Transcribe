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
  console.log("APP; emailController.sendTranscript (7/7);");
  
  if (!res.locals.emailNotification) {
    console.log("Email notifications are disabled. Skipping email notification.");
    return next(); 
  }

  const email = res.locals.email;
  const user = res.locals.user;

  if (!email) {
    return next();
  }

  try {
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', user);

    const transcriptionPdfPath = res.locals.transcriptionPdfPath;
    const transcriptionWordPath = res.locals.transcriptionWordPath;

    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Your transcription from Live-Transcribe", 
      html: htmlContent,
      attachments: [
        {
          filename: 'transcription.pdf',
          path: transcriptionPdfPath,
          contentType: 'application/pdf'
        },
        {
          filename: 'transcription.docx',
          path: transcriptionWordPath,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ]
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