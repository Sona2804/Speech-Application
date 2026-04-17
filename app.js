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

// Speaker Embeddings for SpeechT5
const MALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin';
const FEMALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin';

// Configure Transformers.js
window.transformersEnv.allowLocalModels = false;

async function initModels() {
    if (transcriber && synthesizer) return; 
    
    loadingOverlay.classList.remove('hidden');
    let loadedModels = 0;
    const totalModels = 2;
    
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
        if (!transcriber) {
            transcriber = await window.transformersPipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
                progress_callback: (d) => updateProgress(d, "Whisper-base AI")
            });
        }
        
        if (!synthesizer) {
            synthesizer = await window.transformersPipeline('text-to-speech', 'Xenova/speecht5_tts', {
                quantized: false,
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

// Generate TTS and return a blob URL for DOWNLOAD ONLY
async function generateSpeechAudioBlob(text) {
    const isMale = voiceSelect.value === 'male';
    const embeddingUrl = isMale ? MALE_EMBEDDING_URL : FEMALE_EMBEDDING_URL;
    
    const result = await synthesizer(text, { speaker_embeddings: embeddingUrl });
    
    const wav = new wavefile.WaveFile();
    wav.fromScratch(1, result.sampling_rate, '32f', result.audio);
    const wavBuffer = wav.toBuffer();
    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
}

// Native Browser TTS for GLITCH-FREE PLAYBACK
function playGlitchFreeNativeSpeech(text) {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    
    // Attempt to match requested gender using available native voices
    const isMale = voiceSelect.value === 'male';
    const voices = window.speechSynthesis.getVoices();
    
    // Heuristic: Try to find a voice name containing 'Male' or 'Female', or fallback
    let selectedVoice = null;
    for (let voice of voices) {
        if (voice.lang.includes('en')) {
            if (isMale && (voice.name.includes('Male') || voice.name.includes('David') || voice.name.includes('Guy'))) {
                selectedVoice = voice; break;
            }
            if (!isMale && (voice.name.includes('Female') || voice.name.includes('Zira') || voice.name.includes('Samantha'))) {
                selectedVoice = voice; break;
            }
        }
    }
    
    if (selectedVoice) speech.voice = selectedVoice;
    speech.rate = 0.95;
    window.speechSynthesis.speak(speech);
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
        
        statusDetail.textContent = 'Generating downloadable audio...';
        const downloadAudioUrl = await generateSpeechAudioBlob(cleanedText);
        
        showResults(cleanedText, downloadAudioUrl);

    } catch (e) {
        console.error(e);
        processingText.textContent = 'Processing Error';
        statusDetail.textContent = e.message || 'An error occurred during processing.';
        document.querySelector('.spinner').style.display = 'none';
    }
}

function showResults(text, downloadAudioUrl) {
    processingSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    
    currentTranscript = text;
    document.getElementById('transcript-text').textContent = text;
    
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.href = downloadAudioUrl;
    
    // Play glitch-free native speech
    playGlitchFreeNativeSpeech(text);
}

// Fix voices loading asynchronously
window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };

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

// Sign Language Sequence Tracking
let detectedSignSequence = [];
let lastSignTime = 0;

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

// Variables for realistic gesture detection
let wristXHistory = [];

function detectSigns(landmarks) {
    const wrist = landmarks[0];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const thumbTip = landmarks[4];
    
    const indexMcp = landmarks[5];
    const middleMcp = landmarks[9];
    const ringMcp = landmarks[13];
    const pinkyMcp = landmarks[17];
    
    const now = Date.now();
    if (now - lastSignTime < 1000) return null;

    // Detect if hand is generally open (fingers above knuckles)
    const isOpen = indexTip.y < indexMcp.y && middleTip.y < middleMcp.y && ringTip.y < ringMcp.y && pinkyTip.y < pinkyMcp.y;
    // Detect if hand is closed (fist)
    const isClosed = indexTip.y > indexMcp.y && middleTip.y > middleMcp.y && ringTip.y > ringMcp.y && pinkyTip.y > pinkyMcp.y;

    if (isOpen) {
        // Could be "Stop" or "Hello" (waving)
        wristXHistory.push(wrist.x);
        if (wristXHistory.length > 20) wristXHistory.shift();

        if (wristXHistory.length === 20) {
            let directionChanges = 0;
            let lastDiff = 0;
            for (let i = 1; i < wristXHistory.length; i++) {
                let diff = wristXHistory[i] - wristXHistory[i-1];
                if (Math.abs(diff) > 0.015) { // 1.5% screen movement
                    if (lastDiff !== 0 && (diff > 0) !== (lastDiff > 0)) {
                        directionChanges++;
                    }
                    lastDiff = diff;
                }
            }
            if (directionChanges >= 2) {
                wristXHistory = []; 
                return "Hello"; // Waving!
            }
        }
        return "Stop"; // Just holding hand open
    } else {
        wristXHistory = []; // Hand is no longer open, reset wave tracker
    }

    if (isClosed) {
        return "Yes"; // Closed fist
    }
    
    return null;
}

async function processSequence() {
    if (detectedSignSequence.length === 0) return;
    
    const finalTranscript = detectedSignSequence.join(". ");
    detectedSignSequence = []; // reset
    
    stopLiveSign();
    await initModels();
    
    audioTab.classList.add('hidden');
    videoTab.classList.add('hidden');
    processingSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    
    try {
        statusDetail.textContent = 'Generating downloadable audio...';
        const downloadAudioUrl = await generateSpeechAudioBlob(finalTranscript);
        showResults(finalTranscript, downloadAudioUrl);
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
    
    // Check both hands so left-handed people can use it too!
    const landmarks = results.rightHandLandmarks || results.leftHandLandmarks;
    
    if (landmarks) {
        window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#00A86B', lineWidth: 2});
        window.drawLandmarks(canvasCtx, landmarks, {color: '#FFFDD0', lineWidth: 1, radius: 2});
        
        const sign = detectSigns(landmarks);
        if (sign) {
            // Prevent duplicate signs from repeating consecutively
            if (detectedSignSequence.length === 0 || detectedSignSequence[detectedSignSequence.length - 1] !== sign) {
                lastSignTime = Date.now();
                detectedSignSequence.push(sign);
                liveSignStatus.textContent = `Sequence: ${detectedSignSequence.join(" -> ")}`;
            } else {
                // Keep pushing the debounce timer forward if they hold the same sign
                lastSignTime = Date.now();
            }
        }
    }
    canvasCtx.restore();
}

recordVideoBtn.addEventListener('click', async () => {
    if (isLiveSignRunning) {
        // User clicked STOP manually! Now process the sequence.
        processSequence();
    } else {
        try {
            isLiveSignRunning = true;
            detectedSignSequence = []; // clear sequence
            videoPreviewContainer.classList.remove('hidden');
            liveSignStatus.classList.remove('hidden');
            liveSignStatus.textContent = "Recording... Try waving, showing a fist, or open palm. Click Stop when done.";
            
            recordVideoBtn.classList.add('recording');
            recordVideoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop & Translate Sequence';
            
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
