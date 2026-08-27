import os
import time
import cv2
import numpy as np

MODEL_PATH = "models/ESPCN_x2.pb"

if not os.path.exists(MODEL_PATH):
    print(f"[ERROR] Could not find {MODEL_PATH}. Check file placement.")
    exit(1)

print("[INFO] Initializing OpenCV DNN Super-Resolution Engine...")

# Initialize Super-Resolution Instance
sr = cv2.dnn_superres.DnnSuperResImpl_create()
sr.readModel(MODEL_PATH)
sr.setModel("espcn", 2)  # 2x upscale factor

# Configure OpenCV default optimized CPU backend
sr.setPreferableBackend(cv2.dnn.DNN_BACKEND_DEFAULT)
sr.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)

# Create a sample 480x480 dummy frame
dummy_frame = np.zeros((480, 480, 3), dtype=np.uint8)

# Benchmark Upscale Pass
start = time.time()
upscaled_frame = sr.upsample(dummy_frame)
latency_ms = (time.time() - start) * 1000

print("[SUCCESS] ESPCN 2x upscaling active.")
print(f"[METRIC] Input shape: {dummy_frame.shape} -> Output shape: {upscaled_frame.shape}")
print(f"[METRIC] Single-frame upscaling latency: {latency_ms:.2f} ms")