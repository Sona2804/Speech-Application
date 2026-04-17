// DOM Elements
const audioTab = document.getElementById('audio-tab');
const videoTab = document.getElementById('video-tab');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');
const processingText = document.getElementById('processing-text');
const statusDetail = document.getElementById('status-detail');

const loadingOverlay = document.getElementById('model-loading-overlay');
const loadingText = document.getElementById('model-loading-text');
const progressBar = document.getElementById('model-progress-bar');

let currentTranscript = "";

// --- TRANSFORMERS.JS (AI MODELS) --- //
let transcriber = null;

// Configure Transformers.js not to use local files, but fetch from Hugging Face Hub
window.transformersEnv.allowLocalModels = false;

async function initModels() {
    if (transcriber) return; // already loaded
    
    loadingOverlay.classList.remove('hidden');
    
    try {
        transcriber = await window.transformersPipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
            progress_callback: (data) => {
                if (data.status === 'progress') {
                    const percentage = Math.round((data.loaded / data.total) * 100);
                    progressBar.style.width = `${percentage}%`;
                    loadingText.textContent = `Downloading Whisper AI... ${percentage}%`;
                } else if (data.status === 'ready') {
                    loadingText.textContent = `Models Ready!`;
                    progressBar.style.width = `100%`;
                    setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
                }
            }
        });
    } catch (e) {
        console.error("Failed to load models:", e);
        loadingText.textContent = "Failed to load AI models. Check console.";
        progressBar.style.background = "red";
    }
}

// Basic Disfluency Removal (De-stammering Heuristic)
function cleanTranscript(text) {
    if (!text) return "";
    let cleaned = text;
    // Remove "um", "uh", "ah"
    cleaned = cleaned.replace(/\b(um|uh|ah|like|you know)\b/gi, '');
    // Remove repeated words (e.g., "I I want" -> "I want")
    cleaned = cleaned.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
    // Remove repeated phrases (e.g. "I want to I want to go" -> "I want to go")
    // Simple punctuation cleanup
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
    return cleaned;
}

// TTS
window.replaySpeech = function() {
    if (!currentTranscript) return;
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(currentTranscript);
    speech.lang = 'en-US';
    speech.rate = 0.95; // Slightly slower for clarity
    window.speechSynthesis.speak(speech);
};

// --- AUDIO PROCESSING --- //
async function processAudioBlob(file) {
    await initModels();
    
    // Hide inputs, show processing
    audioTab.classList.add('hidden');
    videoTab.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    processingText.textContent = 'Transcribing Audio...';
    statusDetail.textContent = 'Running Whisper-tiny natively in browser...';

    try {
        // Read file to ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // Decode audio using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Convert to Float32Array
        const offlineContext = new OfflineAudioContext(1, audioBuffer.length, 16000);
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        const renderedBuffer = await offlineContext.startRendering();
        const audioData = renderedBuffer.getChannelData(0); // Float32Array

        // Run Inference
        statusDetail.textContent = 'Applying De-stammering heuristics...';
        const result = await transcriber(audioData);
        
        const rawText = result.text;
        const cleanedText = cleanTranscript(rawText);
        
        showResults(cleanedText || "No speech detected.");

    } catch (e) {
        console.error(e);
        processingText.textContent = 'Processing Error';
        statusDetail.textContent = e.message;
        document.querySelector('.spinner').style.display = 'none';
    }
}

function showResults(text) {
    processingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    
    currentTranscript = text;
    document.getElementById('transcript-text').textContent = text;
    window.replaySpeech();
}

// --- TAB UI --- //
window.switchTab = function(tabName) {
    processingSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active', 'hidden'));
    
    if (tabName === 'audio') {
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
        audioTab.classList.add('active');
        videoTab.classList.add('hidden');
        if (isLiveSignRunning) stopLiveSign();
    } else {
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        videoTab.classList.add('active');
        audioTab.classList.add('hidden');
    }
};

// --- FILE UPLOADS --- //
const audioInput = document.getElementById('audio-input');
document.getElementById('audio-dropzone').addEventListener('click', () => audioInput.click());
audioInput.addEventListener('change', (e) => {
    if (e.target.files.length) processAudioBlob(e.target.files[0]);
});

// --- AUDIO RECORDING --- //
let mediaRecorder;
let audioChunks = [];
let recordingInterval;
let seconds = 0;
const recordAudioBtn = document.getElementById('record-audio-btn');
const audioStatus = document.getElementById('audio-recording-status');
const audioTimer = document.getElementById('audio-timer');

function formatTime(s) {
    const mins = Math.floor(s / 60).toString().padStart(2, '0');
    const secs = (s % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

recordAudioBtn.addEventListener('click', async () => {
    if (recordAudioBtn.classList.contains('recording')) {
        // Stop recording
        recordAudioBtn.classList.remove('recording');
        recordAudioBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Recording';
        audioStatus.classList.add('hidden');
        clearInterval(recordingInterval);
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
        }
    } else {
        // Start recording
        try {
            await initModels(); // Start downloading models in background if not already
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.addEventListener("dataavailable", e => audioChunks.push(e.data));
            mediaRecorder.addEventListener("stop", () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                processAudioBlob(audioBlob);
            });
            
            mediaRecorder.start();
            recordAudioBtn.classList.add('recording');
            recordAudioBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Recording';
            audioStatus.classList.remove('hidden');
            seconds = 0;
            audioTimer.textContent = '00:00';
            recordingInterval = setInterval(() => {
                seconds++;
                audioTimer.textContent = formatTime(seconds);
            }, 1000);
        } catch (err) {
            alert('Microphone access denied.');
            console.error(err);
        }
    }
});

// --- MEDIA PIPE SIGN LANGUAGE (LIVE) --- //
const videoElement = document.getElementById('webcam-preview');
const canvasElement = document.getElementById('output-canvas');
const canvasCtx = canvasElement.getContext('2d');
const recordVideoBtn = document.getElementById('record-video-btn');
const videoPreviewContainer = document.getElementById('video-preview-container');
const liveSignStatus = document.getElementById('live-sign-status');

let camera = null;
let isLiveSignRunning = false;
let signDebounce = 0;

function stopLiveSign() {
    isLiveSignRunning = false;
    if (camera) {
        camera.stop();
        camera = null;
    }
    const stream = videoElement.srcObject;
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
        videoElement.srcObject = null;
    }
    videoPreviewContainer.classList.add('hidden');
    liveSignStatus.classList.add('hidden');
    recordVideoBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Live Sign Language';
    recordVideoBtn.classList.remove('recording');
}

function onResults(results) {
    if (!isLiveSignRunning) return;
    
    // Draw landmarks
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    // Flip canvas horizontally to match the mirrored video
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    
    if (results.rightHandLandmarks) {
        window.drawConnectors(canvasCtx, results.rightHandLandmarks, window.HAND_CONNECTIONS, {color: '#00A86B', lineWidth: 2});
        window.drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FFFDD0', lineWidth: 1, radius: 2});
        
        // Simple Heuristic for MVP: Hand raised = "Hello"
        const wrist = results.rightHandLandmarks[0];
        const indexTip = results.rightHandLandmarks[8];
        
        if (indexTip.y < wrist.y - 0.2 && Date.now() - signDebounce > 3000) {
            signDebounce = Date.now();
            liveSignStatus.textContent = "Detected: Hello";
            showResults("Hello! I am speaking using sign language.");
            stopLiveSign(); // Stop after detection for MVP demo flow
        }
    }
    canvasCtx.restore();
}

recordVideoBtn.addEventListener('click', async () => {
    if (isLiveSignRunning) {
        stopLiveSign();
    } else {
        try {
            isLiveSignRunning = true;
            videoPreviewContainer.classList.remove('hidden');
            liveSignStatus.classList.remove('hidden');
            liveSignStatus.textContent = "Looking for signs... (Try raising your hand!)";
            
            recordVideoBtn.classList.add('recording');
            recordVideoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Camera';
            
            // Set canvas size to match video
            canvasElement.width = 640;
            canvasElement.height = 480;

            const holistic = new Holistic({locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
            }});
            
            holistic.setOptions({
                modelComplexity: 1,
                smoothLandmarks: true,
                enableSegmentation: false,
                smoothSegmentation: false,
                refineFaceLandmarks: false,
                minDetectionConfidence: 0.5,
                minTrackingConfidence: 0.5
            });
            
            holistic.onResults(onResults);
            
            camera = new Camera(videoElement, {
                onFrame: async () => {
                    await holistic.send({image: videoElement});
                },
                width: 640,
                height: 480
            });
            
            camera.start();
            
        } catch (e) {
            alert('Camera access failed.');
            console.error(e);
            stopLiveSign();
        }
    }
});
