import asyncio
import io
import json
import random
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# Import our new depth engine module
from src.perception.depth_engine import DepthEngine

app = FastAPI(title="Hydro-Vision 3D API + Depth Anything V2")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global depth engine instance on GPU
depth_engine = DepthEngine(device="cuda:0")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "engine": "Depth Anything V2 (CUDA Active)",
        "gpu": "RTX 4060",
    }

@app.get("/api/stream/start")
@app.post("/api/stream/start")
def start_stream():
    """Handles React UI request to initiate stream feed."""
    return {"status": "success", "message": "Live stream pipeline started"}


@app.get("/api/stream/stop")
@app.post("/api/stream/stop")
def stop_stream():
    """Handles React UI request to stop stream feed."""
    return {"status": "success", "message": "Live stream pipeline paused"}

@app.post("/api/depth/analyze")
async def analyze_frame_depth(file: UploadFile = File(...)):
    """API Endpoint: Receives drone frame, computes depth map + pothole volume."""
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")

    # Run CUDA Inference
    depth_array, b64_depth_map = depth_engine.predict_depth(image)

    # Calculate Volume for sample pothole bounding box [x1, y1, x2, y2]
    h, w = depth_array.shape
    sample_bbox = [int(w * 0.3), int(h * 0.3), int(w * 0.7), int(h * 0.7)]
    volume_m3 = depth_engine.calculate_hazard_volume(
        depth_array, sample_bbox, altitude_m=25.0
    )

    return {
        "status": "success",
        "volume_m3": volume_m3,
        "depth_map_b64": f"data:image/png;base64,{b64_depth_map}",
        "metrics": {"model": "Depth-Anything-V2-Small", "device": "RTX 4060 CUDA"},
    }


@app.websocket("/ws/live-stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    frame_count = 0
    try:
        while True:
            frame_count += 1
            mock_payload = {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "frame_id": frame_count,
                "telemetry": {
                    "altitude": 25.0,
                    "battery": 87,
                    "satellites": 12,
                    "mode": "3D_MAPPING",
                },
                "hazards_summary": {
                    "total_count": 3,
                    "active_risk": "CRITICAL",
                    "total_area_m2": 129.5,
                },
                "depth_analysis": {
                    "status": "ACTIVE",
                    "model": "Depth-Anything-V2",
                    "estimated_volume_m3": round(0.42 * (1 + (frame_count % 5) * 0.1), 3),
                },
            }
            await websocket.send_text(json.dumps(mock_payload))
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        print("[INFO] React Client Disconnected")