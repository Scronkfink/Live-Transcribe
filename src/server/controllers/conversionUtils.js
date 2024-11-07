const fs = require('fs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const path = require('path');

const sanitizeText = (text) => {
  // Remove any non-printable characters or control characters
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
};

const convertTxtToPdf = (txtFilePath, pdfFilePath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const txtStream = fs.createReadStream(txtFilePath, { encoding: 'utf8' });
    const pdfStream = fs.createWriteStream(pdfFilePath);

    doc.pipe(pdfStream);

    txtStream.on('data', (chunk) => {
      const sanitizedChunk = sanitizeText(chunk);
      doc.text(sanitizedChunk);
    });

    txtStream.on('end', () => {
      doc.end();
    });

    pdfStream.on('finish', () => {
      resolve();
    });

    pdfStream.on('error', (err) => {
      reject(err);
    });
  });
};

const convertTxtToWord = (txtFilePath, wordFilePath) => {
  return new Promise((resolve, reject) => {
    fs.readFile(txtFilePath, 'utf8', (err, data) => {
      if (err) return reject(err);

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: data.split('\n').map(line => new Paragraph({
              children: [new TextRun(line)]
            }))
          }
        ]
      });

      Packer.toBuffer(doc).then(buffer => {
        fs.writeFile(wordFilePath, buffer, (err) => {
          if (err) return reject(err);
          resolve();
        });
      }).catch(reject);
    });
  });
};

const convertStrToPDF = async (string, res) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const sanitizedString = sanitizeText(string);

      // Pipe the document to a buffer
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        res.locals.summary = pdfBuffer;
        resolve();
      });

      // Add text to the document
      doc.text(sanitizedString, {
        x: 50,
        y: 50,
        width: 500,
        align: 'left'
      });

      // Finalize the PDF and end the document
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};



module.exports = { convertTxtToPdf, convertTxtToWord, convertStrToPDF };