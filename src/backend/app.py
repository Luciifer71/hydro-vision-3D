import sys
import os
import json
import asyncio
import uuid
import cv2
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any

from fastapi import (
    FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks, HTTPException
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ------------------------------------------------------------------
# PATH SETUP
# ------------------------------------------------------------------
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from ingestion.stream_loader import stream_video_frames
from perception.mask_extractor import PerceptionEngine
from geometry.metric_mapper import MetricMapper
from geometry.geo_utils import GeoTranslator
from analytics.severity_indexer import SeverityIndexer

app = FastAPI(title="HydroVision 3D - Live Analytics API", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SNAPSHOT_DIR = os.path.join(BASE_DIR, "static", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ------------------------------------------------------------------
# MASTER VIDEO RESOLUTION (from stub version — keeps your combined video logic)
# ------------------------------------------------------------------
def resolve_master_video_path() -> str:
    """
    Locates the Master Video file in the data directory.
    Prioritizes filenames containing 'master' or 'combined'; falls back to
    any .mp4 if no explicit master file is found.
    """
    current_file = Path(__file__).resolve()
    possible_roots = [
        current_file.parent.parent.parent,  # project root
        current_file.parent.parent,         # src directory
        Path.cwd()                          # working directory
    ]

    for root in possible_roots:
        for folder_name in ["raw_videos", "raw_video"]:
            folder = root / "data" / folder_name
            if folder.exists():
                master_files = list(folder.glob("*master*.mp4")) + list(folder.glob("*combined*.mp4"))
                if master_files:
                    return str(master_files[0])

                all_videos = list(folder.glob("*.mp4"))
                if all_videos:
                    return str(all_videos[0])

    raise FileNotFoundError("No valid MP4 video found in data/raw_videos (or raw_video) directory.")


# ------------------------------------------------------------------
# CONNECTION MANAGER
# ------------------------------------------------------------------
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
        stale = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                stale.append(connection)
        for c in stale:
            self.disconnect(c)


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
        print("[INIT] Loading AI Pipeline Components...")
        perception_engine = PerceptionEngine()
        metric_mapper = MetricMapper()
        geo_translator = GeoTranslator()
        severity_indexer = SeverityIndexer()
    return perception_engine, metric_mapper, geo_translator, severity_indexer


# ------------------------------------------------------------------
# HELPER UTILITIES
# ------------------------------------------------------------------
def assign_vadodara_zone(lat: float, lon: float) -> str:
    """Assigns lat/lon coordinates to Vadodara Municipal Wards/Zones."""
    if lat > 22.320:
        return "North Zone - Ward 1 (Sayajigunj / Fatehgunj)"
    elif lat < 22.280:
        return "South Zone - Ward 12 (Makarpura / GIDC)"
    elif lon > 73.200:
        return "East Zone - Ward 3 (Waghodia Road)"
    elif lon < 73.160:
        return "West Zone - Ward 6 (Akota / Gotri)"
    else:
        return "Central Zone - Ward 5 (Raopura / Mandvi)"


def compute_priority_score(severity_level: str, area_m2: float, class_name: str) -> int:
    """Calculates maintenance priority score (1 to 100)."""
    base_scores = {"CRITICAL": 50, "HIGH": 35, "MEDIUM": 20, "LOW": 10}
    score = base_scores.get(severity_level, 10)
    score += min(int(area_m2 * 15), 30)

    if class_name.lower() in ["pothole", "pothole_waterlogged", "waterlogging_area", "open_manhole", "road_cave_in"]:
        score += 20

    return min(score, 100)


def save_visual_evidence(frame, bbox: List[float], hazard_id: str) -> str:
    """Crops defect visual evidence and saves frame image to disk."""
    try:
        h, w, _ = frame.shape
        x1, y1, x2, y2 = [int(c) for c in bbox]

        pad_x = int((x2 - x1) * 0.15)
        pad_y = int((y2 - y1) * 0.15)

        x1_crop = max(0, x1 - pad_x)
        y1_crop = max(0, y1 - pad_y)
        x2_crop = min(w, x2 + pad_x)
        y2_crop = min(h, y2 + pad_y)

        crop = frame[y1_crop:y2_crop, x1_crop:x2_crop]
        if crop.size > 0:
            filename = f"{hazard_id}.jpg"
            filepath = os.path.join(SNAPSHOT_DIR, filename)
            cv2.imwrite(filepath, crop)
            return f"/static/snapshots/{filename}"
    except Exception as e:
        print(f"[WARN] Error saving evidence: {e}")
    return ""


# ------------------------------------------------------------------
# CORE PIPELINE EXECUTION LOOP
# ------------------------------------------------------------------
async def run_stream_loop(video_path: str):
    try:
        perception, mapper, geo, indexer = get_pipeline_components()
    except Exception as e:
        print(f"[ERROR] Failed to initialize pipeline components: {e}")
        latest_system_state["status"] = "ERROR"
        return

    active_hazards: Dict[Any, Dict[str, Any]] = {}

    latest_system_state["status"] = "STREAMING"
    latest_system_state["hazards"] = []

    try:
        frame_iter = stream_video_frames(video_path)
    except Exception as e:
        print(f"[ERROR] Could not open video stream at {video_path}: {e}")
        latest_system_state["status"] = "ERROR"
        return

    try:
        for fid, ts, frame in frame_iter:
            try:
                h, w, _ = frame.shape
                detections = perception.process_frame(frame)

                frame_surface_area_m2 = 0.0
                frame_payload = []

                for det in detections:
                    try:
                        tid = det["track_id"]
                        class_name = det.get("class_name", "pothole")
                        area_m2 = mapper.compute_surface_area(det["pixel_area"], image_width_px=w)
                        coords = geo.pixel_to_latlon(det["bbox"], frame_size=(w, h))

                        if tid in active_hazards:
                            active_hazards[tid]["area_m2"] = round(
                                0.7 * active_hazards[tid]["area_m2"] + 0.3 * area_m2, 2
                            )
                            hazard_id = active_hazards[tid]["hazard_id"]
                            evidence_url = active_hazards[tid]["evidence_url"]
                            status = active_hazards[tid].get("status", "OPEN")
                        else:
                            hazard_id = f"HAZ-VDD-{uuid.uuid4().hex[:6].upper()}"
                            evidence_url = save_visual_evidence(frame, det["bbox"], hazard_id)
                            status = "OPEN"
                            active_hazards[tid] = {
                                "hazard_id": hazard_id,
                                "area_m2": area_m2,
                                "evidence_url": evidence_url,
                                "status": status,
                                "type": class_name,
                                "confidence": round(det["confidence"], 2),
                                "location": coords,
                                "bbox": [round(c, 1) for c in det["bbox"]]
                            }

                        smoothed_area = active_hazards[tid]["area_m2"]
                        frame_surface_area_m2 += smoothed_area

                        item_severity = indexer.evaluate_hazard(smoothed_area)["level"]
                        zone_name = assign_vadodara_zone(coords["latitude"], coords["longitude"])
                        priority_score = compute_priority_score(item_severity, smoothed_area, class_name)

                        active_hazards[tid].update({
                            "surface_area_m2": smoothed_area,
                            "severity": item_severity,
                            "priority_score": priority_score,
                            "zone": zone_name,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "visual_evidence_url": evidence_url,
                            "bbox": [round(c, 1) for c in det["bbox"]],
                            "location": coords
                        })

                        hazard_item = {
                            "hazard_id": hazard_id,
                            "track_id": tid,
                            "type": class_name,
                            "confidence": round(det["confidence"], 2),
                            "surface_area_m2": smoothed_area,
                            "severity": item_severity,
                            "priority_score": priority_score,
                            "zone": zone_name,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "visual_evidence_url": evidence_url,
                            "status": status,
                            "bbox": [round(c, 1) for c in det["bbox"]],
                            "location": coords
                        }
                        frame_payload.append(hazard_item)
                    except Exception as det_err:
                        # One bad detection should never kill the whole stream
                        print(f"[WARN] Skipping malformed detection on frame {fid}: {det_err}")
                        continue

                frame_severity = indexer.evaluate_hazard(frame_surface_area_m2)

                all_cumulative_hazards = list(active_hazards.values())
                total_cumulative_area = sum(h["surface_area_m2"] for h in all_cumulative_hazards)

                latest_system_state["total_hazards"] = len(all_cumulative_hazards)
                latest_system_state["total_area_m2"] = round(total_cumulative_area, 2)
                latest_system_state["risk_level"] = frame_severity["level"]
                latest_system_state["hazards"] = all_cumulative_hazards

                broadcast_msg = {
                    "stream_status": "LIVE",
                    "frame_id": fid,
                    "timestamp": round(ts, 2),
                    "summary": {
                        "active_hazards": len(detections),
                        "total_cumulative_hazards": len(all_cumulative_hazards),
                        "total_affected_area": round(total_cumulative_area, 2),
                        "total_area_m2": round(total_cumulative_area, 2),
                        "overall_risk": frame_severity["level"],
                        "risk_level": frame_severity["level"],
                        "action": frame_severity["action"],
                        "alert_count": len(all_cumulative_hazards)
                    },
                    "hazards": frame_payload
                }

                await manager.broadcast(broadcast_msg)
            except Exception as frame_err:
                # Never let one bad frame silently kill the loop / freeze the UI
                print(f"[WARN] Skipping frame {fid} due to error: {frame_err}")
            await asyncio.sleep(0.01)
    except Exception as loop_err:
        print(f"[ERROR] Stream loop terminated unexpectedly: {loop_err}")
        latest_system_state["status"] = "ERROR"
        return

    latest_system_state["status"] = "COMPLETED"


# ------------------------------------------------------------------
# LIVE WEBSOCKET ENDPOINT (dashboard clients subscribe here)
# ------------------------------------------------------------------
@app.websocket("/ws/live-stream")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    print(f"[INFO] Client connected. Active connections: {len(manager.active_connections)}")

    # Auto-start the AI pipeline the moment the first dashboard client
    # subscribes. Without this, connecting to the socket does nothing —
    # frames are only ever pushed while run_stream_loop is running, and
    # nothing else triggers it automatically.
    if latest_system_state["status"] not in ("STREAMING",):
        try:
            video_path = resolve_master_video_path()
            print(f"[INFO] Auto-starting stream loop with: {video_path}")
            asyncio.create_task(run_stream_loop(video_path))
        except FileNotFoundError as e:
            print(f"[ERROR] Could not auto-start stream: {e}")
            await websocket.send_json({"error": str(e), "stream_status": "OFFLINE"})

    try:
        # Keep the socket open; broadcasts are pushed from run_stream_loop.
        # We still listen so client disconnects are detected promptly.
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"[INFO] Client disconnected from WebSocket stream. Remaining: {len(manager.active_connections)}")
    except Exception as e:
        manager.disconnect(websocket)
        print(f"[ERROR] WebSocket exception: {e}")


# ------------------------------------------------------------------
# REST API ENDPOINTS
# ------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {"status": "ONLINE", "stream_status": latest_system_state["status"]}


@app.get("/api/debug/video-path")
async def debug_video_path():
    """Diagnostic endpoint: shows exactly which video file would be used
    and whether it can actually be opened by OpenCV, without starting the
    full AI pipeline."""
    try:
        path = resolve_master_video_path()
    except FileNotFoundError as e:
        return {"resolved": False, "error": str(e)}

    cap = cv2.VideoCapture(path)
    opened = cap.isOpened()
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if opened else 0
    fps = cap.get(cv2.CAP_PROP_FPS) if opened else 0
    cap.release()

    return {
        "resolved": True,
        "path": path,
        "opencv_can_open": opened,
        "frame_count": frame_count,
        "fps": fps
    }


@app.get("/api/stream/start")
async def start_stream_trigger(background_tasks: BackgroundTasks, video_path: str = None):
    """Triggers stream processing in a background task. Defaults to the
    auto-resolved Master Video if no explicit path is supplied."""
    if latest_system_state["status"] == "STREAMING":
        return {"message": "Stream is already running."}

    if not video_path:
        try:
            video_path = resolve_master_video_path()
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e))

    background_tasks.add_task(run_stream_loop, video_path)
    return {"message": "Stream processing started successfully.", "video_path": video_path}


@app.get("/api/stream/stop")
async def stop_stream():
    """Resets stream status back to IDLE."""
    latest_system_state["status"] = "IDLE"
    latest_system_state["total_hazards"] = 0
    latest_system_state["total_area_m2"] = 0.0
    latest_system_state["risk_level"] = "LOW"
    latest_system_state["hazards"] = []
    return {"message": "Stream stopped and state reset."}


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
                    "hazard_id": h.get("hazard_id"),
                    "track_id": h.get("track_id"),
                    "class_name": h.get("type"),
                    "surface_area_m2": h.get("surface_area_m2"),
                    "confidence": h.get("confidence"),
                    "severity": h.get("severity", "LOW"),
                    "priority_score": h.get("priority_score", 10),
                    "zone": h.get("zone", "Unassigned"),
                    "timestamp": h.get("timestamp"),
                    "visual_evidence_url": h.get("visual_evidence_url"),
                    "status": h.get("status", "OPEN")
                }
            }
            features.append(feature)

    return {"type": "FeatureCollection", "features": features}


class StatusUpdateRequest(BaseModel):
    hazard_id: str
    status: str  # OPEN, IN_PROGRESS, RESOLVED


@app.post("/api/hazards/status")
async def update_hazard_status(payload: StatusUpdateRequest):
    """Updates defect ticket status for maintenance closure tracking."""
    if payload.status not in ["OPEN", "IN_PROGRESS", "RESOLVED"]:
        raise HTTPException(status_code=400, detail="Invalid status option.")

    updated = False
    for h in latest_system_state.get("hazards", []):
        if h.get("hazard_id") == payload.hazard_id:
            h["status"] = payload.status
            updated = True
            break

    if not updated:
        raise HTTPException(status_code=404, detail="Hazard ID not found.")

    return {"message": "Status updated successfully.", "hazard_id": payload.hazard_id, "new_status": payload.status}


@app.get("/api/config")
async def get_config():
    """Returns system configuration for the frontend."""
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