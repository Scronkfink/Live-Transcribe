const fs = require('fs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun } = require('docx');
const path = require('path');

const convertTxtToPdf = (txtFilePath, pdfFilePath) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const txtStream = fs.createReadStream(txtFilePath);
    const pdfStream = fs.createWriteStream(pdfFilePath);

    doc.pipe(pdfStream);
    txtStream.on('data', (chunk) => {
      doc.text(chunk);
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

module.exports = { convertTxtToPdf, convertTxtToWord };