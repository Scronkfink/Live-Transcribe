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
}

const transporter = nodemailer.createTransport({
  service: 'Yahoo',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

emailController.sendTranscript = async (req, res, next) => {
  console.log("APP; emailController.sendTranscript (7/7);");

  const audioFilePath = res.locals.audioFilePath;

  cleanupExpiredFiles();

  if (audioFilePath && fs.existsSync(audioFilePath)) {
    fs.unlink(audioFilePath, (err) => {
      if (err) {
        console.error("Failed to delete the audio file:", err);
      } else {
        console.log("Audio file deleted successfully:", audioFilePath);
      }
    });
  }

  if (!res.locals.emailNotification) {
    console.log("Email notifications are disabled. Sendin' 202.");
    return res.status(202).json({ message: 'Email notifications are disabled' });
  }
  

  const email = res.locals.email;
  const emails = res.locals.emails || []; // Get the array of additional emails, if any
  const user = res.locals.user;

  if (!email && (!emails || emails.length === 0)) {
    return next(); // No email to send to
  }

  try {
    let htmlContent = fs.readFileSync(path.join(__dirname, '../../email.html'), 'utf8');
    htmlContent = htmlContent.replace('{{userName}}', user);

    const transcriptionPdfPath = res.locals.transcriptionPdfPath;
    const transcriptionWordPath = res.locals.transcriptionWordPath;

    // Collect all recipients: the main email and any additional emails in the array
    let allRecipients = [email];
    if (emails && emails.length > 0) {
      allRecipients = allRecipients.concat(emails);
    }

    const mailOptions = {
      from: process.env.EMAIL,
      to: allRecipients,
      subject: res.locals.subject || "Your transcription from Live-Transcribe", 
      html: htmlContent,
      attachments: [
        {
          filename: `${res.locals.subject}.pdf` || 'transcription.pdf',
          path: transcriptionPdfPath,
          contentType: 'application/pdf'
        },
        {
          filename: `${res.locals.subject}.docx` || 'transcription.docx',
          path: transcriptionWordPath,
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }
      ]
    };

    console.log('Sending email to:', allRecipients);
    await transporter.sendMail(mailOptions);
    console.log('Email(s) sent successfully!');
  } catch (error) {
    console.error('Error sending email:', error);
    return next(error);
  }

  return res.status(200).send("completed");
};






module.exports = emailController;