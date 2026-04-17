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
const voiceSelect = document.getElementById('voice-select');

let currentTranscript = "";

// --- TRANSFORMERS.JS (AI MODELS) --- //
let transcriber = null;
let synthesizer = null;

// Speaker Embeddings for SpeechT5 (Using high-quality US Male/Female specific vectors)
const MALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin';
const FEMALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin';

// Configure Transformers.js
window.transformersEnv.allowLocalModels = false;

async function initModels() {
    if (transcriber && synthesizer) return; // already loaded
    
    loadingOverlay.classList.remove('hidden');
    let loadedModels = 0;
    const totalModels = 2; // Whisper and SpeechT5
    
    const updateProgress = (data, modelName) => {
        if (data.status === 'progress') {
            const percentage = Math.round(((loadedModels * 100) + ((data.loaded / data.total) * 100)) / totalModels);
            progressBar.style.width = `${percentage}%`;
            loadingText.textContent = `Downloading ${modelName}... ${percentage}%`;
        } else if (data.status === 'ready') {
            loadedModels++;
            if (loadedModels === totalModels) {
                loadingText.textContent = `High-Accuracy Models Ready!`;
                progressBar.style.width = `100%`;
                setTimeout(() => loadingOverlay.classList.add('hidden'), 500);
            }
        }
    };

    try {
        // Upgrade to whisper-base.en for significantly better accuracy
        if (!transcriber) {
            transcriber = await window.transformersPipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                progress_callback: (d) => updateProgress(d, "Whisper-base AI")
            });
        }
        
        // Add SpeechT5 for high quality, downloadable TTS
        if (!synthesizer) {
            synthesizer = await window.transformersPipeline('text-to-speech', 'Xenova/speecht5_tts', {
                quantized: false, // Unquantized produces dramatically more realistic and clear voices
                progress_callback: (d) => updateProgress(d, "SpeechT5 TTS AI")
            });
        }
    } catch (e) {
        console.error("Failed to load models:", e);
        loadingText.textContent = "Failed to load AI models. Check console.";
        progressBar.style.background = "red";
    }
}

function cleanTranscript(text) {
    if (!text) return "";
    let cleaned = text;
    cleaned = cleaned.replace(/\b(um|uh|ah|like|you know)\b/gi, '');
    cleaned = cleaned.replace(/\b(\w+)(?:\s+\1\b)+/gi, '$1');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/\s+([.,!?])/g, '$1');
    return cleaned;
}

// Generate TTS and return a blob URL
async function generateSpeechAudio(text) {
    const isMale = voiceSelect.value === 'male';
    const embeddingUrl = isMale ? MALE_EMBEDDING_URL : FEMALE_EMBEDDING_URL;
    
    statusDetail.textContent = 'Generating realistic AI speech...';
    
    const result = await synthesizer(text, {
        speaker_embeddings: embeddingUrl
    });
    
    // result.audio is a Float32Array, result.sampling_rate is usually 16000
    // Use wavefile library to encode to WAV
    const wav = new wavefile.WaveFile();
    wav.fromScratch(1, result.sampling_rate, '32f', result.audio);
    
    const wavBuffer = wav.toBuffer();
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

// --- AUDIO PROCESSING --- //
async function processAudioBlob(file) {
    await initModels();
    
    audioTab.classList.add('hidden');
    videoTab.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    processingText.textContent = 'Transcribing Audio...';
    statusDetail.textContent = 'Running accurate Whisper-base natively...';

    try {
        const arrayBuffer = await file.arrayBuffer();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const offlineContext = new OfflineAudioContext(1, audioBuffer.length, 16000);
        const source = offlineContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(offlineContext.destination);
        source.start();
        const renderedBuffer = await offlineContext.startRendering();
        const audioData = renderedBuffer.getChannelData(0);

        statusDetail.textContent = 'Transcribing...';
        const result = await transcriber(audioData);
        
        const rawText = result.text;
        const cleanedText = cleanTranscript(rawText);
        
        if (!cleanedText) {
            throw new Error("No speech detected.");
        }
        
        const audioUrl = await generateSpeechAudio(cleanedText);
        showResults(cleanedText, audioUrl);

    } catch (e) {
        console.error(e);
        processingText.textContent = 'Processing Error';
        statusDetail.textContent = e.message || 'An error occurred during processing.';
        document.querySelector('.spinner').style.display = 'none';
    }
}

function showResults(text, audioUrl) {
    processingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    
    currentTranscript = text;
    document.getElementById('transcript-text').textContent = text;
    
    const player = document.getElementById('output-audio');
    const downloadBtn = document.getElementById('download-btn');
    
    player.src = audioUrl;
    downloadBtn.href = audioUrl;
    
    // Auto-play the generated speech
    player.play().catch(e => console.log("Auto-play prevented by browser:", e));
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
        recordAudioBtn.classList.remove('recording');
        recordAudioBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> Start Recording';
        audioStatus.classList.add('hidden');
        clearInterval(recordingInterval);
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(t => t.stop());
        }
    } else {
        try {
            await initModels(); 
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

// Variables for realistic gesture detection (Waving)
let wristXHistory = [];

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

function detectWaving(landmarks) {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    
    // The hand must be raised (index tip significantly above wrist)
    if (indexTip.y > wrist.y - 0.1) {
        wristXHistory = []; // Reset history if hand is lowered
        return false;
    }

    // Track the horizontal movement of the wrist
    wristXHistory.push(wrist.x);
    if (wristXHistory.length > 20) {
        wristXHistory.shift(); // Keep last 20 frames
    }

    if (wristXHistory.length === 20) {
        // Calculate variance or reversals in X direction to detect waving
        let directionChanges = 0;
        let lastDiff = 0;
        for (let i = 1; i < wristXHistory.length; i++) {
            let diff = wristXHistory[i] - wristXHistory[i-1];
            if (Math.abs(diff) > 0.01) { // significant movement
                if (lastDiff !== 0 && (diff > 0) !== (lastDiff > 0)) {
                    directionChanges++;
                }
                lastDiff = diff;
            }
        }
        
        // If the hand changed horizontal direction multiple times while raised, it's a wave!
        if (directionChanges >= 3) {
            wristXHistory = []; // Reset to prevent multiple immediate triggers
            return true;
        }
    }
    return false;
}

async function processDetectedSign(text) {
    stopLiveSign();
    await initModels();
    
    audioTab.classList.add('hidden');
    videoTab.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    try {
        const audioUrl = await generateSpeechAudio(text);
        showResults(text, audioUrl);
    } catch (e) {
        console.error(e);
        processingText.textContent = 'Processing Error';
        statusDetail.textContent = e.message || 'An error occurred during TTS generation.';
        document.querySelector('.spinner').style.display = 'none';
    }
}

function onResults(results) {
    if (!isLiveSignRunning) return;
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.translate(canvasElement.width, 0);
    canvasCtx.scale(-1, 1);
    
    if (results.rightHandLandmarks) {
        window.drawConnectors(canvasCtx, results.rightHandLandmarks, window.HAND_CONNECTIONS, {color: '#00A86B', lineWidth: 2});
        window.drawLandmarks(canvasCtx, results.rightHandLandmarks, {color: '#FFFDD0', lineWidth: 1, radius: 2});
        
        // Realistic Waving Detection
        if (detectWaving(results.rightHandLandmarks)) {
            liveSignStatus.textContent = "Detected: Waving (Hello)";
            processDetectedSign("Hello there! It is so nice to meet you.");
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
            liveSignStatus.textContent = "Look into the camera and wave your hand!";
            
            recordVideoBtn.classList.add('recording');
            recordVideoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Camera';
            
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
