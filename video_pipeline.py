import cv2
import mediapipe as mp
import numpy as np
import asyncio
from sklearn.neighbors import KNeighborsClassifier
from audio_pipeline import text_to_speech

mp_holistic = mp.solutions.holistic
dummy_X = np.random.rand(10, 21 * 3)
dummy_y = ["Hello", "How", "Are", "You", "Thank", "You", "Good", "Morning", "Yes", "No"]
knn_classifier = KNeighborsClassifier(n_neighbors=1)
knn_classifier.fit(dummy_X, dummy_y)

def extract_landmarks(frame, holistic_model):
    image = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    image.flags.writeable = False
    results = holistic_model.process(image)
    if results.right_hand_landmarks:
        return np.array([[res.x, res.y, res.z] for res in results.right_hand_landmarks.landmark]).flatten()
    return None

def process_video(input_path, output_path):
    cap = cv2.VideoCapture(input_path)
    detected_words = []
    with mp_holistic.Holistic(min_detection_confidence=0.5, min_tracking_confidence=0.5) as holistic:
        frame_count = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            if frame_count % 10 == 0:
                landmarks = extract_landmarks(frame, holistic)
                if landmarks is not None:
                    prediction = knn_classifier.predict([landmarks])[0]
                    if not detected_words or detected_words[-1] != prediction:
                        detected_words.append(prediction)
            frame_count += 1
    cap.release()
    transcript = " ".join(detected_words) if detected_words else "No sign language detected."
    asyncio.run(text_to_speech(transcript, output_path))
    return transcript
