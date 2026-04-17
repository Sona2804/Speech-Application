import os
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uuid
import shutil
from audio_pipeline import process_audio
from video_pipeline import process_video

app = FastAPI(title="Silent To Speech API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
os.makedirs("outputs", exist_ok=True)

@app.get("/")
def read_root():
    return {"status": "Silent To Speech API is running!"}

@app.post("/api/process-audio")
async def handle_audio(file: UploadFile = File(...)):
    try:
        file_ext = os.path.splitext(file.filename)[1]
        file_id = str(uuid.uuid4())
        input_path = os.path.join("uploads", f"{file_id}{file_ext}")
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        output_path = os.path.join("outputs", f"{file_id}_clean.wav")
        transcript = process_audio(input_path, output_path)
        
        return JSONResponse({
            "transcript": transcript,
            "audio_url": f"/outputs/{file_id}_clean.wav"
        })
        
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.post("/api/process-video")
async def handle_video(file: UploadFile = File(...)):
    try:
        file_ext = os.path.splitext(file.filename)[1]
        file_id = str(uuid.uuid4())
        input_path = os.path.join("uploads", f"{file_id}{file_ext}")
        
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        output_path = os.path.join("outputs", f"{file_id}_sign.wav")
        transcript = process_video(input_path, output_path)
        
        return JSONResponse({
            "transcript": transcript,
            "audio_url": f"/outputs/{file_id}_sign.wav"
        })
        
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

from fastapi.staticfiles import StaticFiles
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")
