import sys
import os
import cv2
import numpy as np

# Ensure src/ modules are importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.perception.video_preprocessor import VideoPreprocessor

def test_upscaler():
    print("=" * 60)
    print("   TESTING VIDEO PRE-PROCESSOR & SUPER-RESOLUTION   ")
    print("=" * 60)

    preprocessor = VideoPreprocessor(target_resolution=(1920, 1080))

    # Create a simulated low-res 480p frame (640x480) with noise
    low_res_frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
    print(f"[TEST 1] Input Low-Res Frame Shape  : {low_res_frame.shape}")

    # Upscale
    enhanced_frame = preprocessor.upscale_frame_if_needed(low_res_frame)
    print(f"[TEST 2] Output Enhanced Frame Shape : {enhanced_frame.shape}")

    assert enhanced_frame.shape == (1080, 1920, 3), "Upscaling dimensions failed!"
    print("\n[SUCCESS] Pre-processor upscaling verification passed!")

if __name__ == "__main__":
    test_upscaler()