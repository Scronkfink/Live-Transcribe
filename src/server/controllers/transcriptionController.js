

const transcriptionController = {};

transcriptionController.transcribe = async(req,res,next) => {

  console.log("howdy bitch");
  res.locals.transcription = "sup dawg"
  return next()
};

module.exports = transcriptionController