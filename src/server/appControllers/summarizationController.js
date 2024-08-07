const { spawn } = require('child_process');

const summarizationController = {};

summarizationController.summarize = async (req, res, next) => {
  const prompt = "In two words, tell me what you think about colors";

  const ollamaProcess = spawn('ollama', ['run', 'llama3']);

  let output = '';
  let errorOutput = '';

  ollamaProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  ollamaProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  ollamaProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`ollama process exited with code ${code}`);
      console.error(`stderr: ${errorOutput}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    console.log(`stdout: ${output}`);
    return res.status(200).json({ response: output });
  });

  ollamaProcess.stdin.write(prompt);
  ollamaProcess.stdin.end();
};

module.exports = summarizationController;