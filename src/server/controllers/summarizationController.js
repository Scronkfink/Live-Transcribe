const fs = require('fs');
const { spawn } = require('child_process');
const { convertStrToPDF } = require('./conversionUtils.js');

const summarizationController = {};

summarizationController.summarize = async (req, res, next) => {
  console.log("APP; in summarizationController.summarize (6/7);");

  const filePath = res.locals.transcription;
  const promptPrefix = "Create a short summary of the following transcription and do not include ANYTHING other than the summary: ";

  try {
    const transcriptionText = fs.readFileSync(filePath, 'utf8');
    const prompt = `${promptPrefix} ${transcriptionText}`;

    const ollamaProcess = spawn(
      process.platform === 'win32'
          ? 'C:/Users/Leonidas/AppData/Local/Programs/Ollama/ollama.exe'  // Windows-specific path
          : '/usr/local/bin/ollama',  // Mac/Unix path, update this to the correct path if different
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