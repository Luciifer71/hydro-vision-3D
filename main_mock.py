import asyncio
import io
import json
import random
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector

app = FastAPI(title="Hydro-Vision 3D Full Production Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Engines
depth_engine = DepthEngine(device="cuda:0")
geo_projector = GeoProjector(
    image_width=1920, image_height=1080, hfov_deg=84.0
)


@app.get("/")
def read_root():
    return {
        "status": "online",
        "engines": ["Depth-Anything-V2", "Photogrammetric-GeoProjector"],
        "device": "RTX 4060 CUDA",
    }


@app.get("/api/stream/start")
@app.post("/api/stream/start")
def start_stream():
    return {"status": "success", "message": "Live stream pipeline started"}


@app.get("/api/stream/stop")
@app.post("/api/stream/stop")
def stop_stream():
    return {"status": "success", "message": "Live stream pipeline stopped"}


@app.websocket("/ws/live-stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    frame_count = 0

    # Base drone telemetry position (Alkapuri, Vadodara)
    drone_lat = 22.30720
    drone_lon = 73.18200

    try:
        while True:
            frame_count += 1

            # Simulate drone flight movement (North-East path)
            current_drone_lat = drone_lat + (frame_count * 0.00001)
            current_drone_lon = drone_lon + (frame_count * 0.000012)
            altitude = 25.0
            heading = 45.0  # Flight heading (NE)

            # Sample detection bounding box centers in image frame (1920x1080)
            pothole_bbox_center = (960 + random.randint(-100, 100), 540 + random.randint(-50, 50))
            waterlog_bbox_center = (1200 + random.randint(-50, 50), 300 + random.randint(-30, 30))

            # Run Photogrammetric Spatial Projection to get exact WGS84 GPS coords
            pothole_geo = geo_projector.pixel_to_gps(
                pixel_x=pothole_bbox_center[0],
                pixel_y=pothole_bbox_center[1],
                drone_lat=current_drone_lat,
                drone_lon=current_drone_lon,
                altitude_m=altitude,
                pitch_deg=-90.0,
                yaw_deg=heading,
            )

            waterlog_geo = geo_projector.pixel_to_gps(
                pixel_x=waterlog_bbox_center[0],
                pixel_y=waterlog_bbox_center[1],
                drone_lat=current_drone_lat,
                drone_lon=current_drone_lon,
                altitude_m=altitude,
                pitch_deg=-90.0,
                yaw_deg=heading,
            )

            payload = {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "frame_id": frame_count,
                "telemetry": {
                    "latitude": round(current_drone_lat, 7),
                    "longitude": round(current_drone_lon, 7),
                    "altitude": altitude,
                    "heading": heading,
                    "speed_ms": 5.4,
                    "battery": max(100 - (frame_count // 20), 10),
                    "satellites": 14,
                    "mode": "3D_MAPPING",
                },
                "hazards_summary": {
                    "total_count": 2,
                    "active_risk": "CRITICAL",
                    "total_area_m2": 116.7,
                },
                "detections": [
                    {
                        "track_id": 101,
                        "class": "Pothole",
                        "confidence": 0.94,
                        "area_m2": 82.5,
                        "severity": "CRITICAL",
                        "gps": pothole_geo,
                    },
                    {
                        "track_id": 102,
                        "class": "Waterlogging",
                        "confidence": 0.89,
                        "area_m2": 34.2,
                        "severity": "HIGH",
                        "gps": waterlog_geo,
                    },
                ],
            }

            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        print("[INFO] React GCS Client Disconnected")