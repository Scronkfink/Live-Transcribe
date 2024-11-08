const fs = require('fs');
const { spawn } = require('child_process');
const { convertStrToPDF } = require('./conversionUtils.js');

const summarizationController = {};

summarizationController.summarize = async (req, res, next) => {
  console.log("APP; in summarizationController.summarize (6/7);");

  const transcriptionFiles = res.locals.transcriptionPaths;
  const promptPrefix = "Create a short summary of the following transcription and do not include ANYTHING other than the summary: ";
  res.locals.summary = []; 

  const summarizeFile = (filePath) => {
    return new Promise((resolve, reject) => {
      const transcriptionText = fs.readFileSync(filePath, 'utf8');
      const prompt = `${promptPrefix} ${transcriptionText}`;

      const ollamaProcess = spawn(
        process.platform === 'win32'
          ? 'C:/Users/Leonidas/AppData/Local/Programs/Ollama/ollama.exe'
          : '/usr/local/bin/ollama',
        ['run', 'llama3']
      );

      let output = '';
      let errorOutput = '';

      ollamaProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      ollamaProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ollamaProcess.on('close', async (code) => {
        if (code !== 0) {
          console.error(`ollama process exited with code ${code}`);
          console.error(`stderr: ${errorOutput}`);
          return reject(new Error('Error during summarization'));
        }

        console.log(`Generated summary: ${output}`);

        try {
          // Pass 'res' to convertStrToPDF
          const pdfBuffer = await convertStrToPDF(output, res);
          res.locals.summary.push({ text: output, pdf: pdfBuffer });
          resolve();
        } catch (error) {
          console.error('Error converting summary to PDF:', error);
          reject(error);
        }
      });

      ollamaProcess.stdin.write(prompt);
      ollamaProcess.stdin.end();
    });
  };

  try {
    await Promise.all(transcriptionFiles.map(summarizeFile));
    console.log('All summaries generated and converted to PDF');
    next();
  } catch (error) {
    console.error('Error generating summaries:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = summarizationController;
