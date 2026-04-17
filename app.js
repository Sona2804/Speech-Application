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

const MALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0001.bin';
const FEMALE_EMBEDDING_URL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin';

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

function playGlitchFreeNativeSpeech(text) {
    window.speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    const isMale = voiceSelect.value === 'male';
    const voices = window.speechSynthesis.getVoices();
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
        
        if (!cleanedText) throw new Error("No speech detected.");
        
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
    
    playGlitchFreeNativeSpeech(text);
}

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
let wristXHistory = [];
let baselineFaceWidth = 0;

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

// Complex 3D Math to detect advanced signs and facial expressions
function detectSigns(results) {
    const now = Date.now();
    if (now - lastSignTime < 1000) return null; // 1 second debounce

    let detectedSign = null;

    // 1. Check Face Mesh (Emotions / Lip Reading)
    if (results.faceLandmarks) {
        const face = results.faceLandmarks;
        const leftMouthCorner = face[61];
        const rightMouthCorner = face[291];
        const upperLipInner = face[13];
        const lowerLipInner = face[14];
        
        // Pythagorean distance
        const mouthWidth = Math.sqrt(Math.pow(leftMouthCorner.x - rightMouthCorner.x, 2) + Math.pow(leftMouthCorner.y - rightMouthCorner.y, 2));
        const mouthHeight = Math.sqrt(Math.pow(upperLipInner.x - lowerLipInner.x, 2) + Math.pow(upperLipInner.y - lowerLipInner.y, 2));
        
        // Calibrate baseline
        if (baselineFaceWidth === 0 && mouthHeight < 0.02) {
            baselineFaceWidth = mouthWidth;
        }

        if (mouthHeight > 0.06) {
            detectedSign = "Surprised";
        } else if (baselineFaceWidth > 0 && mouthWidth > baselineFaceWidth * 1.15 && mouthHeight < 0.04) {
            detectedSign = "Happy";
        }
    }

    // 2. Check for "Love" (Both hands crossed on chest)
    if (results.rightHandLandmarks && results.leftHandLandmarks) {
        const rWrist = results.rightHandLandmarks[0];
        const lWrist = results.leftHandLandmarks[0];
        const dist = Math.sqrt(Math.pow(rWrist.x - lWrist.x, 2) + Math.pow(rWrist.y - lWrist.y, 2));
        if (dist < 0.2) { // Wrists are close together
            return "Love";
        }
    }

    // 3. Single Hand Gestures (Priority: Right hand, fallback: Left hand)
    const hand = results.rightHandLandmarks || results.leftHandLandmarks;
    if (hand && !detectedSign) {
        const wrist = hand[0];
        const thumbTip = hand[4];
        const indexTip = hand[8];
        const middleTip = hand[12];
        const ringTip = hand[16];
        const pinkyTip = hand[20];
        
        const indexMcp = hand[5];
        const middleMcp = hand[9];
        const ringMcp = hand[13];
        const pinkyMcp = hand[17];
        
        const isFist = indexTip.y > indexMcp.y && middleTip.y > middleMcp.y && ringTip.y > ringMcp.y && pinkyTip.y > pinkyMcp.y;
        const isOpen = indexTip.y < indexMcp.y && middleTip.y < middleMcp.y && ringTip.y < ringMcp.y && pinkyTip.y < pinkyMcp.y;
        
        // "I / Me" -> Thumb pointing at chest (Hand is a fist, thumb is extended horizontally towards center)
        if (isFist && Math.abs(thumbTip.y - indexMcp.y) < 0.1 && (thumbTip.x > indexMcp.x || thumbTip.x < indexMcp.x)) {
            // Very basic heuristic for pointing at self
            if (wrist.y > 0.5 && wrist.y < 0.9) { // lower half of frame, near chest
                // For simplicity, if they make a fist and tuck thumb inwards towards body
                detectedSign = "I";
            }
        }

        // "You" -> Pointing directly at camera (Index extended, others closed, Index Z is very negative)
        if (!isOpen && !isFist && indexTip.y < indexMcp.y && middleTip.y > middleMcp.y && ringTip.y > ringMcp.y) {
            // Check Z-axis depth! Z is negative when closer to camera
            if (indexTip.z < -0.05) {
                detectedSign = "You";
            }
        }

        // "Good" (Thumbs Up)
        if (isFist && thumbTip.y < indexMcp.y - 0.05) {
            detectedSign = "Good";
        }

        // "Bad" (Thumbs Down)
        if (isFist && thumbTip.y > indexMcp.y + 0.1) {
            detectedSign = "Bad";
        }

        // Waving / Stop
        if (isOpen) {
            wristXHistory.push(wrist.x);
            if (wristXHistory.length > 20) wristXHistory.shift();

            if (wristXHistory.length === 20) {
                let directionChanges = 0;
                let lastDiff = 0;
                for (let i = 1; i < wristXHistory.length; i++) {
                    let diff = wristXHistory[i] - wristXHistory[i-1];
                    if (Math.abs(diff) > 0.015) {
                        if (lastDiff !== 0 && (diff > 0) !== (lastDiff > 0)) {
                            directionChanges++;
                        }
                        lastDiff = diff;
                    }
                }
                if (directionChanges >= 2) {
                    wristXHistory = []; 
                    detectedSign = "Hello";
                }
            }
            if (!detectedSign) detectedSign = "Stop";
        } else {
            wristXHistory = [];
        }

        if (isFist && !detectedSign) {
            detectedSign = "Yes";
        }
    }
    
    return detectedSign;
}

// The AI Grammar Parsing Engine
function parseGrammar(sequence) {
    const raw = sequence.join(" ");
    
    // Natural Sentence Rules
    const rules = [
        { pattern: "I Love You", out: "I love you so much." },
        { pattern: "Hello You Good", out: "Hello, you are looking good today." },
        { pattern: "Stop You Bad", out: "Stop right there, you are bad." },
        { pattern: "I Happy", out: "I am feeling very happy." },
        { pattern: "You Surprised", out: "You look surprised!" },
        { pattern: "Hello I Happy", out: "Hello, I am happy to see you." },
        { pattern: "You Good", out: "You are doing a good job." },
        { pattern: "I Good", out: "I am doing good." },
        { pattern: "I Bad", out: "I am having a bad day." },
        { pattern: "Yes You Good", out: "Yes, I agree, you are good." }
    ];

    for (let rule of rules) {
        if (raw === rule.pattern) {
            return rule.out;
        }
    }

    // Fallback if no exact grammar rule matches (just string them together nicely)
    let fallback = sequence.join(", ");
    return fallback.charAt(0).toUpperCase() + fallback.slice(1) + ".";
}

async function processSequence() {
    if (detectedSignSequence.length === 0) return;
    
    // Pass raw sequence through Grammar Engine
    const finalTranscript = parseGrammar(detectedSignSequence);
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
    
    // Draw Face Mesh for Lip Reading
    if (results.faceLandmarks) {
        window.drawConnectors(canvasCtx, results.faceLandmarks, window.FACEMESH_LIPS, {color: '#E0B0FF', lineWidth: 1});
    }

    // Draw Hands
    const hands = [results.rightHandLandmarks, results.leftHandLandmarks];
    for (let landmarks of hands) {
        if (landmarks) {
            window.drawConnectors(canvasCtx, landmarks, window.HAND_CONNECTIONS, {color: '#00A86B', lineWidth: 2});
            window.drawLandmarks(canvasCtx, landmarks, {color: '#FFFDD0', lineWidth: 1, radius: 2});
        }
    }
    
    // Detect Sequence
    const sign = detectSigns(results);
    if (sign) {
        if (detectedSignSequence.length === 0 || detectedSignSequence[detectedSignSequence.length - 1] !== sign) {
            lastSignTime = Date.now();
            detectedSignSequence.push(sign);
            liveSignStatus.textContent = `Sequence: ${detectedSignSequence.join(" -> ")}`;
        } else {
            lastSignTime = Date.now();
        }
    }
    canvasCtx.restore();
}

recordVideoBtn.addEventListener('click', async () => {
    if (isLiveSignRunning) {
        processSequence();
    } else {
        try {
            isLiveSignRunning = true;
            detectedSignSequence = []; 
            baselineFaceWidth = 0; // reset emotion baseline
            videoPreviewContainer.classList.remove('hidden');
            liveSignStatus.classList.remove('hidden');
            liveSignStatus.textContent = "Recording... Act a sequence (e.g. 'I' -> 'Love' -> 'You')";
            
            recordVideoBtn.classList.add('recording');
            recordVideoBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Translate Sentence';
            
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
                refineFaceLandmarks: true, // Need face landmarks for emotions!
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
