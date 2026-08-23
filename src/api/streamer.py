import sys
import os
# Add the root project directory to Python's path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

import cv2
import uvicorn
# ... rest of your code ...


import cv2
import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from src.perception.video_preprocessor import VideoPreprocessor

app = FastAPI()

# Allow your React frontend to access this stream
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to localhost:5173
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize your Preprocessor
preprocessor = VideoPreprocessor(target_resolution=(1920, 1080))

def generate_frames(video_path: str):
    """Reads the raw video, processes it, and yields frames for the web."""
    # 1. Ensure codec compatibility
    web_ready_path = preprocessor.ensure_web_compatible_codec(video_path)
    
    cap = cv2.VideoCapture(web_ready_path)
    
    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break
            
        # 2. Upscale if it's low resolution (480p/720p)
        enhanced_frame = preprocessor.upscale_frame_if_needed(frame)
        
        # 3. Encode as JPEG for web streaming
        ret, buffer = cv2.imencode('.jpg', enhanced_frame)
        frame_bytes = buffer.tobytes()
        
        # 4. Yield as an MJPEG multipart byte stream
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
               
    cap.release()

@app.get("/stream")
async def video_stream():
    """Endpoint that the React frontend will hit to get the live video feed."""
    # Tomorrow, you will replace this with the live drone feed path
    raw_video_source = "datasets/master_video.mp4"  # Placeholder for the actual drone feed
    return StreamingResponse(generate_frames(raw_video_source), media_type="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    print("[API] Starting GCS Streaming Server on port 8000...")
    uvicorn.run(app, host="0.0.0.0", port=8000)