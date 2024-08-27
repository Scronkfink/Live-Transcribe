#!/bin/bash

# Define variables
HF_TOKEN="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"
AUDIO_PATH=$1
OUTPUT_DIR=$2

# Log the inputs to verify they are being passed correctly
echo "Running transcription..."
echo "HF_TOKEN: $HF_TOKEN"
echo "AUDIO_PATH: $AUDIO_PATH"
echo "OUTPUT_DIR: $OUTPUT_DIR"

# Run the whisperx command with diarization
echo "Starting WhisperX with diarization..."

conda run -n whisperx_env whisperx "$AUDIO_PATH" \
--hf_token $HF_TOKEN \
--model large-v2 --language en --batch_size 16 --diarize --highlight_words True \
--output_dir "$OUTPUT_DIR" --output_format json

# Log after the command runs to see if it finishes
echo "Transcription process completed."
