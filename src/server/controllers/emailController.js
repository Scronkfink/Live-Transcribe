const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const emailController = {};

function cleanupExpiredFiles() {
  const outputDir = path.join(__dirname, '../outputs');
  const expirationTime = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  fs.readdir(outputDir, (err, files) => {
    if (err) {
      console.error('Error reading the output directory:', err);
      return;
    }

    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error('Error getting file stats:', err);
          return;
        }

        const now = Date.now();
        const fileAge = now - stats.mtimeMs;

        if (fileAge > expirationTime) {
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`Failed to delete file ${filePath}:`, err);
            } else {
              console.log(`Deleted file: ${filePath}`);
            }
          });
        }
      });
    });
  });
};

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

  cleanupExpiredFiles();

  if (email === "") {
    return next();
  }

  try {
    // Extract the text from the "subject" transcription
    const subjectTranscriptionPath = res.locals.subjectTranscription;
    let subjectTranscriptionText = fs.readFileSync(subjectTranscriptionPath, 'utf8');

    // Use a regular expression to remove everything up to and including the first " - "
    subjectTranscriptionText = subjectTranscriptionText.replace(/^.*? - /, '');

    // Read the HTML template and replace placeholders
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', user);

    // Get the paths for PDF and Word documents
    const transcriptionPdfPath = res.locals.transcriptionPdfPath;
    const transcriptionWordPath = res.locals.transcriptionWordPath;

    // Create mail options
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: subjectTranscriptionText, // Use the subject transcription as the email subject
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

emailController.uploadTranscript = async (req, res, next) => {
  const email = res.locals.email;

  if (!email) {
    return next();
  }

  try {

    // Read the HTML template and remove the userName placeholder
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', ''); // Remove userName placeholder

    // Get the paths for txt document
    const transcription = res.locals.outputFilePath;

    // Create mail options
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: 'Your Transcription from Live-Transcribe', // Set the email subject
      html: htmlContent,
      attachments: [
        {
          filename: 'transcription.txt',
          path: transcription,
          contentType: 'text/plain'
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
}

emailController.test = async (req, res, next) => {
  const email = "jacksonchanson@gmail.com";
  const user = "Jackson";

  if (email === "") {
    return next();
  }

  try {
    // Read the HTML template and replace placeholders
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', user);

    const transcriptionPdfPath = '/Users/hanson/Desktop/test.pdf';
    const transcriptionWordPath = '/Users/hanson/Desktop/test.docx';

    // Create mail options with attachments
    const mailOptions = {
      from: process.env.EMAIL,
      to: email,
      subject: "Sup dawg", // Use the subject transcription as the email subject
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