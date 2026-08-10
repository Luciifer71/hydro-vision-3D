import sys
import os
import asyncio
from typing import List
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Ensure src modules are resolvable
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from ingestion.stream_loader import stream_video_frames
from perception.mask_extractor import PerceptionEngine
from geometry.metric_mapper import MetricMapper
from geometry.geo_utils import GeoTranslator
from analytics.severity_indexer import SeverityIndexer

app = FastAPI(title="HydroVision 3D - Live Analytics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve frontend static files
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

class ConnectionManager:
    """Manages active WebSocket connections to dashboard clients."""
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

# Global state shared within the single process
latest_system_state = {
    "status": "IDLE",
    "total_hazards": 0,
    "total_area_m2": 0.0,
    "risk_level": "LOW",
    "hazards": []
}

# Heavy models loaded lazily on demand
perception_engine = None
metric_mapper = None
geo_translator = None
severity_indexer = None

def get_pipeline_components():
    global perception_engine, metric_mapper, geo_translator, severity_indexer
    if perception_engine is None:
        print("Initializing AI Pipeline Components inside FastAPI...")
        perception_engine = PerceptionEngine()
        metric_mapper = MetricMapper()
        geo_translator = GeoTranslator()
        severity_indexer = SeverityIndexer()
    return perception_engine, metric_mapper, geo_translator, severity_indexer


async def run_stream_loop(video_path: str):
    perception, mapper, geo, indexer = get_pipeline_components()
    active_hazards = {}

    latest_system_state["status"] = "STREAMING"

    for fid, ts, frame in stream_video_frames(video_path):
        h, w, _ = frame.shape
        detections = perception.process_frame(frame)

        frame_surface_area_m2 = 0.0
        frame_payload = []

        for det in detections:
            tid = det["track_id"]
            area_m2 = mapper.compute_surface_area(det["pixel_area"], image_width_px=w)
            coords = geo.pixel_to_latlon(det["bbox"], frame_size=(w, h))

            if tid in active_hazards:
                active_hazards[tid]["area_m2"] = round(0.7 * active_hazards[tid]["area_m2"] + 0.3 * area_m2, 2)
            else:
                active_hazards[tid] = {"area_m2": area_m2}

            smoothed_area = active_hazards[tid]["area_m2"]
            frame_surface_area_m2 += smoothed_area

            hazard_item = {
                "track_id": tid,
                "type": det["class_name"],
                "confidence": round(det["confidence"], 2),
                "surface_area_m2": smoothed_area,
                "bbox": [round(c, 1) for c in det["bbox"]],
                "location": coords
            }
            frame_payload.append(hazard_item)

        severity = indexer.evaluate_hazard(frame_surface_area_m2)

        # Update in-memory state
        latest_system_state["total_hazards"] = len(detections)
        latest_system_state["total_area_m2"] = round(frame_surface_area_m2, 2)
        latest_system_state["risk_level"] = severity["level"]
        latest_system_state["hazards"] = frame_payload

        # Broadcast via WebSocket
        broadcast_msg = {
            "frame_id": fid,
            "timestamp": round(ts, 2),
            "summary": {
                "active_hazards": len(detections),
                "total_area_m2": round(frame_surface_area_m2, 2),
                "risk_level": severity["level"],
                "action": severity["action"]
            },
            "hazards": frame_payload
        }

        await manager.broadcast(broadcast_msg)
        await asyncio.sleep(0.01)

    latest_system_state["status"] = "COMPLETED"


@app.get("/api/health")
async def health_check():
    return {"status": "ONLINE", "stream_status": latest_system_state["status"]}


@app.get("/api/stream/start")
async def start_stream_trigger(background_tasks: BackgroundTasks, video_path: str = "data/raw_video/sample_drone.mp4"):
    """Triggers stream processing in a background thread."""
    if latest_system_state["status"] == "STREAMING":
        return {"message": "Stream is already running."}
    
    background_tasks.add_task(run_stream_loop, video_path)
    return {"message": "Stream processing started successfully.", "video_path": video_path}


@app.get("/api/hazards")
async def get_hazards():
    return latest_system_state


@app.get("/api/hazards/geojson")
async def get_hazards_geojson():
    features = []
    for h in latest_system_state.get("hazards", []):
        if "location" in h:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [h["location"]["longitude"], h["location"]["latitude"]]
                },
                "properties": {
                    "track_id": h["track_id"],
                    "type": h["type"],
                    "surface_area_m2": h["surface_area_m2"],
                    "confidence": h["confidence"]
                }
            }
            features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features
    }


@app.websocket("/ws/live-stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.get("/api/stream/stop")
async def stop_stream():
    """Resets stream status back to IDLE."""
    latest_system_state["status"] = "IDLE"
    latest_system_state["total_hazards"] = 0
    latest_system_state["total_area_m2"] = 0.0
    latest_system_state["risk_level"] = "LOW"
    latest_system_state["hazards"] = []
    return {"message": "Stream stopped and state reset."}


@app.get("/api/config")
async def get_config():
    """Returns system configuration for the frontend."""
    import json
    config_path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "camera_intrinsics.json")
    config_data = {}
    if os.path.isfile(config_path):
        with open(config_path, "r") as f:
            config_data = json.load(f)
    return {
        "camera": config_data,
        "home_coordinates": {"latitude": 22.3072, "longitude": 73.1812},
        "severity_thresholds": {
            "LOW": {"max_area_m2": 5.0, "score": 1},
            "MODERATE": {"max_area_m2": 25.0, "score": 2},
            "HIGH": {"max_area_m2": 75.0, "score": 3},
            "CRITICAL": {"max_area_m2": float("inf"), "score": 4}
        }
    }


@app.get("/")
async def serve_frontend():
    """Serves the frontend dashboard."""
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"error": "Frontend not found. Place index.html in the frontend/ directory."}