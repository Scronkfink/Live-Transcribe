const fs = require('fs');
const { spawn } = require('child_process');
const { convertStrToPDF } = require('./conversionUtils.js');

const summarizationController = {};

summarizationController.summarize = async (req, res, next) => {
  console.log("APP; in summarizationController.summarize (4/7);");

  const filePath = res.locals.transcription;
  const promptPrefix = "Create a short summary of the following transcription: ";

  try {
    const transcriptionText = fs.readFileSync(filePath, 'utf8');
    const prompt = `${promptPrefix} ${transcriptionText}`;

    const ollamaProcess = spawn('ollama', ['run', 'llama3']);

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
        return res.status(500).json({ error: 'Internal Server Error' });
      }
      console.log(`Ahoy! Here be the summary: ${output}`);

      try {
        await convertStrToPDF(output, res);
        console.log('Summary successfully converted to PDF and stored in res.locals.summary');
        next();
      } catch (error) {
        console.error('Error converting summary to PDF:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });

    ollamaProcess.stdin.write(prompt);
    ollamaProcess.stdin.end();
  } catch (error) {
    console.error('Error reading transcription file:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = summarizationController;