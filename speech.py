import streamlit as st
from audio_utils import process_audio_pipeline
import tempfile
import os

# Configure page
st.set_page_config(page_title="Audio Enhancer & Transcriber", layout="wide")
st.title("🎙️ Audio Processing Pipeline")
st.write("Upload an audio file to enhance, transcribe, and resynthesize")

# File uploader
uploaded_file = st.file_uploader(
    "Choose an audio file (WAV/MP3)", 
    type=["wav", "mp3"],
    accept_multiple_files=False
)

if uploaded_file:
    with st.spinner("Processing audio..."):
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_file:
            tmp_file.write(uploaded_file.read())
            audio_path = tmp_file.name

        try:
            # Run full pipeline
            enhanced_audio, transcription, synthesized_audio = process_audio_pipeline(audio_path)
            
            # Display results
            col1, col2 = st.columns(2)
            
            with col1:
                st.subheader("Enhanced Audio")
                st.audio(enhanced_audio)
                
            with col2:
                st.subheader("Synthesized Speech")
                st.audio(synthesized_audio)
            
            st.subheader("Transcription")
            st.code(transcription, language="text")
            
        except Exception as e:
            st.error(f"❌ Processing failed: {str(e)}")
        finally:
            # Cleanup
            for f in [audio_path, enhanced_audio, synthesized_audio]:
                if os.path.exists(f):
                    os.remove(f)
