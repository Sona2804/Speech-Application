import os
import subprocess
import whisper
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import asyncio
import edge_tts
import torch
import librosa
import soundfile as sf
import noisereduce as nr

device = "cuda" if torch.cuda.is_available() else "cpu"

print(f"Loading Whisper model on {device}...")
whisper_model = whisper.load_model("base", device=device)

print(f"Loading T5 text refinement model on {device}...")
t5_tokenizer = AutoTokenizer.from_pretrained("t5-small", legacy=False)
t5_model = AutoModelForSeq2SeqLM.from_pretrained("t5-small").to(device)

def enhance_audio(input_path, temp_clean_path):
    norm_path = input_path + "_norm.wav"
    command = ["ffmpeg", "-y", "-i", input_path, "-filter:a", "loudnorm", norm_path]
    subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        y, sr = librosa.load(norm_path, sr=None)
        reduced_noise = nr.reduce_noise(y=y, sr=sr)
        sf.write(temp_clean_path, reduced_noise, sr)
    except:
        import shutil
        shutil.copy(norm_path, temp_clean_path)
    if os.path.exists(norm_path): os.remove(norm_path)

def transcribe_audio(audio_path):
    result = whisper_model.transcribe(audio_path)
    return result["text"]

def clean_text(text):
    if not text.strip(): return ""
    inputs = t5_tokenizer(f"Fix grammar and remove stutters from the following text: {text}", return_tensors="pt").to(device)
    outputs = t5_model.generate(**inputs, max_length=100)
    return t5_tokenizer.decode(outputs[0], skip_special_tokens=True)

async def text_to_speech(text, output_path):
    voice = "en-US-AriaNeural"
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_path)

def process_audio(input_path, output_path):
    temp_clean_path = input_path + "_temp.wav"
    try:
        enhance_audio(input_path, temp_clean_path)
        raw_text = transcribe_audio(temp_clean_path)
        cleaned_text = clean_text(raw_text)
        asyncio.run(text_to_speech(cleaned_text, output_path))
        return cleaned_text
    finally:
        if os.path.exists(temp_clean_path): os.remove(temp_clean_path)
