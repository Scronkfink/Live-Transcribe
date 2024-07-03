LiveTranscribe: Putting transcribers out of work, one word at a time.

Our current flow process:

1. Someone calls our number 
2. Call is routed to our "twilioController.handleVoice"
  a. Fetches the user's name from DB using their #
  b. Prompt's user for conversation subject
  c. Re-routes user to "twilioController.handleSubject"
3. "twilioController.handleSubject" 
  a. Saves the audio URL of the subject to the DB
  b. Tells user to start recording whenever they are ready
  c. Upon button press Re-routes to "twilioController.startRecording"
4. "twilioController.startRecording"
  a. Prompts user to start speaking after the beep and to press key when done.
  b. Says "'Thank you, your transcription will be available shortly.'
  c. Re-routes to "twilioController.handleTranscription"
5. "twilioController.handleTranscription" 
  a. Adds recording Url to DB.
  b. Proceeds to next controller "transcriptionController.getAudio"
6. "transcriptionController.getAudio"
  •	Fetches the latest transcription’s audio URL for a user.
	•	Downloads the audio file from the provided URL.
	•	Writes the audio file to a temporary location.
	•	Sets res.locals.audioPath to the path of the downloaded audio file.
	•	Calls next() to pass control to "transcriptionController.transcribe"
7. "transcriptionController.transcribe"
  •	Reads res.locals.audioPath to get the path of the downloaded audio file.
	•	Checks if the audio file exists.
	•	Runs the transcription command using the specified audio file.
	•	Reads the transcription result and saves it to the desktop.
	•	Sets res.locals.transcription to the transcription data.
	•	Calls next() to pass control to the next middleware.
