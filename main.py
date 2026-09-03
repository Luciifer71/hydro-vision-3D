import asyncio
import os
import time
import uuid
import shutil
from datetime import datetime, timezone
from typing import Dict, List

import cv2
import numpy as np
import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from ultralytics import YOLO

# Perception & Spatial Engine Imports
from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector

# --- GLOBAL OPTIMIZATION ---
# Disable gradients globally to save massive VRAM and CPU cycles
torch.set_grad_enabled(False)

ACTIVE_VIDEO_PATH = "data/raw_videos/master_video.mp4"
STREAM_ACTIVE = False  # <--- ADD THIS LINE (Defaults to Off)

app = FastAPI(
    title="Hydro-Vision 3D AI Perception Engine",
    description="Real-time 2D Hazard Detection & 3D Volumetric Spatial Telemetry Engine",
)

# Enable CORS for React Command Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_compute_device() -> str:
    """Detects best available hardware compute target."""
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def resolve_model_weights() -> str:
    """Locates custom trained best.pt weights across standard output paths."""
    candidates = [
        "best.pt",
        "runs/yolov8s_baseline/weights/best.pt",
        # "runs/detect/hydro_vision_7class/weights/best.pt",
        # "runs/hydro_vision_m4pro/weights/best.pt",
        "weights/best.pt",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return "yolov8n.pt"


def enhance_hazard_classification(frame, coords, base_class_name, confidence):
    """
    Analyzes HSV color space inside the bounding box and prints live metrics.
    Overrides pothole predictions to 'pothole_waterlogged' when
    reflection/mud signatures match.
    """
    x1, y1, x2, y2 = coords
    h_f, w_f = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w_f, x2), min(h_f, y2)

    if y2 <= y1 or x2 <= x1:
        return base_class_name, confidence

    crop = frame[y1:y2, x1:x2]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    avg_saturation = np.mean(hsv[:, :, 1])
    avg_brightness = np.mean(hsv[:, :, 2])

    if "pothole" in base_class_name.lower():
        # Broader threshold for wet/muddy road surfaces
        if avg_brightness > 75 and avg_saturation < 85:
            return "pothole_waterlogged", confidence

    return base_class_name, confidence


# Initialize Core Engines
DEVICE = get_compute_device()
MODEL_PATH = resolve_model_weights()

print(f"[INIT] Hardware Acceleration: {DEVICE.upper()}")
print(f"[INIT] Loaded Weights: {MODEL_PATH}")

yolo_model = YOLO(MODEL_PATH)
depth_engine = DepthEngine(device=DEVICE)
geo_projector = GeoProjector(image_width=1920, image_height=1080, hfov_deg=84.0)

# Shared telemetry state buffer
latest_telemetry = []

# Force initial state to Standby
STREAM_ACTIVE = False

def generate_mjpeg_stream():
    """Synchronous generator to prevent event-loop starvation and allow clean Ctrl+C exits."""
    global latest_telemetry, ACTIVE_VIDEO_PATH, STREAM_ACTIVE

    cap = None
    current_video_path = None
    frame_count = 0
    drone_lat, drone_lon, altitude = 22.30720, 73.18200, 25.0

    last_boxes = []
    last_depth_colormap = None

    while True:
        # --- 1. STANDBY / KILL-SWITCH CHECK ---
        if not STREAM_ACTIVE:
            if cap is not None:
                cap.release()
                cap = None
            
            # Render clear standby frame
            standby = np.zeros((480, 854, 3), dtype=np.uint8)
            cv2.putText(
                standby, "SYSTEM STANDBY - UPLOAD VIDEO TO START AI PIPELINE", 
                (90, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2
            )
            _, buffer = cv2.imencode(".jpg", standby, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")
            
            time.sleep(0.5)
            continue

        # --- 2. INITIALIZE VIDEO ---
        if cap is None or current_video_path != ACTIVE_VIDEO_PATH:
            cap = cv2.VideoCapture(ACTIVE_VIDEO_PATH)
            current_video_path = ACTIVE_VIDEO_PATH
            frame_count = 0

        ret, frame = cap.read()
        if not ret:
            print("[INFO] Video file playback complete. Halting stream and locking telemetry report.")
            STREAM_ACTIVE = False  # Automatically turns off the GPU pipeline
            if cap is not None:
                cap.release()
                cap = None
            break   

        frame_count += 1
        annotated_frame = frame.copy()
        h_orig, w_orig = frame.shape[:2]

        current_lat = drone_lat + (frame_count * 0.000005)
        current_lon = drone_lon + (frame_count * 0.000006)

        # --- 3. RUN AI INFERENCE (Every 3rd Frame) ---
        if frame_count % 3 == 1 or last_depth_colormap is None:
            try:
                # YOLO Detections
                if DEVICE == "cuda":
                    with torch.cuda.amp.autocast():
                        results = yolo_model.predict(source=frame, conf=0.20, imgsz=960, device=DEVICE, verbose=False)[0]
                else:
                    results = yolo_model.predict(source=frame, conf=0.20, imgsz=960, device=DEVICE, verbose=False)[0]

                # Real Depth Anything V2 Map
                pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                depth_array, _ = depth_engine.predict_depth(pil_img)
                
                norm_depth = cv2.normalize(depth_array, None, 0, 255, norm_type=cv2.NORM_MINMAX).astype(np.uint8)
                last_depth_colormap = cv2.applyColorMap(norm_depth, cv2.COLORMAP_INFERNO)

                boxes = results.boxes
                current_frame_logs = []
                current_boxes = []

                if len(boxes) > 0:
                    for box in boxes:
                        cls_id = int(box.cls[0])
                        raw_class_name = yolo_model.names[cls_id]
                        confidence = float(box.conf[0])
                        coords = box.xyxy[0].cpu().numpy().astype(int).tolist()
                        x1, y1, x2, y2 = coords
                        
                        box_area = max(0, x2 - x1) * max(0, y2 - y1)
                        if box_area > (0.25 * (w_orig * h_orig)): continue
                        if confidence < 0.20: continue

                        class_name, confidence = enhance_hazard_classification(frame, coords, raw_class_name, confidence)
                        center_x, center_y = (x1 + x2) // 2, (y1 + y2) // 2

                        gps = geo_projector.pixel_to_gps(
                            pixel_x=center_x, 
                            pixel_y=center_y,
                            drone_lat=22.3072,   # Make sure this uses your flight/video variables
                            drone_lon=73.1812, 
                            altitude_m=25.0,
                            pitch_deg=-90.0          # Nadir orientation pointing straight down
                        )
                        
                        # 1. Get the raw volume
                        raw_volume = depth_engine.calculate_hazard_volume(depth_array, coords, altitude_m=altitude)
                        
                        # 2. Scale it down and KEEP the variable name as volume_m3
                        volume_m3 = raw_volume * 0.1 

                        current_frame_logs.append({
                            "id": f"HAZ-{class_name.upper().replace(' ', '-')}",
                            "frame": frame_count,
                            "hazard": class_name,
                            "confidence": round(confidence, 2),
                            "volume_m3": round(volume_m3, 3), # Rounds to 3 decimal places
                            "latitude": round(gps["latitude"], 6),
                            "longitude": round(gps["longitude"], 6),
                            "bbox": coords,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                        
                        current_boxes.append({
                            "coords": coords, "class": class_name, 
                            "conf": confidence, "vol": volume_m3
                        })

                latest_telemetry = current_frame_logs
                last_boxes = current_boxes

            except Exception as e:
                print(f"[AI PIPELINE WARNING] Frame {frame_count} error: {e}")

        # --- 4. RENDER OVERLAYS ---
        depth_viz = last_depth_colormap.copy() if last_depth_colormap is not None else np.zeros_like(annotated_frame)

        for b in last_boxes:
            x1, y1, x2, y2 = b["coords"]
            cls_name = b["class"]
            conf = b["conf"]
            vol = b["vol"]

            box_color = (0, 255, 255) if "waterlogged" in cls_name.lower() else (0, 255, 0)
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 2)
            
            tag_label = f"{cls_name.upper()} {conf:.2f} ({vol}m3)"
            cv2.putText(annotated_frame, tag_label, (x1, max(20, y1 - 10)), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
            cv2.rectangle(depth_viz, (x1, y1), (x2, y2), (255, 255, 255), 2)

        # --- 5. ENCODE & STREAM ---
        h, w = annotated_frame.shape[:2]
        target_h = 480
        scale = target_h / float(h)
        target_w = int(w * scale)

        left_view = cv2.resize(annotated_frame, (target_w, target_h))
        right_view = cv2.resize(depth_viz, (target_w, target_h))

        cv2.putText(left_view, "1. 2D DETECTOR & GPS", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        cv2.putText(right_view, f"2. 3D DEPTH ({DEVICE.upper()})", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

        composite_frame = np.hstack((left_view, right_view))

        _, buffer = cv2.imencode(".jpg", composite_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
        yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")

        time.sleep(0.001)


# def generate_mjpeg_stream():
#     """
#     Generates an optimized dual 2D/3D MJPEG stream.
#     NOTE: This is a synchronous generator so FastAPI assigns it to a background thread, 
#     preventing the event loop from starving and fixing your WebSocket lag.
#     """
#     global latest_telemetry, ACTIVE_VIDEO_PATH

#     cap = cv2.VideoCapture(ACTIVE_VIDEO_PATH)
#     if not cap.isOpened():
#         print(f"[ERROR] Unable to open video source: {ACTIVE_VIDEO_PATH}")
#         yield (b"--frame\r\nContent-Type: text/plain\r\n\r\nStream Error\r\n")
#         return

#     frame_count = 0
#     drone_lat, drone_lon, altitude = 22.30720, 73.18200, 25.0

#     # Cache for Persistent Graphics
#     last_boxes = []
#     last_depth_colormap = None

#     while True:
#         ret, frame = cap.read()
#         if not ret:
#             # Auto-loop video continuously for presentation
#             cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
#             continue

#         frame_count += 1
#         annotated_frame = frame.copy()
#         h_orig, w_orig = frame.shape[:2]

#         current_lat = drone_lat + (frame_count * 0.000005)
#         current_lon = drone_lon + (frame_count * 0.000006)

#         # ------------------------------------------------------------------
#         # 1. AI PERCEPTION PIPELINE (Runs every 3rd frame)
#         # ------------------------------------------------------------------
#         if frame_count % 3 == 1 or last_depth_colormap is None:
#             try:
#                 if DEVICE == "cuda":
#                     with torch.cuda.amp.autocast():
#                         results = yolo_model.predict(source=frame, conf=0.20, imgsz=960, device=DEVICE, verbose=False)[0]
#                 else:
#                     results = yolo_model.predict(source=frame, conf=0.20, imgsz=960, device=DEVICE, verbose=False)[0]

#                 # 3D Depth Anything V2 Estimation
#                 pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
#                 depth_array, _ = depth_engine.predict_depth(pil_img)
#                 norm_depth = cv2.normalize(depth_array, None, 0, 255, norm_type=cv2.NORM_MINMAX).astype(np.uint8)
#                 last_depth_colormap = cv2.applyColorMap(norm_depth, cv2.COLORMAP_INFERNO)

#                 boxes = results.boxes
#                 current_frame_logs = []
#                 current_boxes = []

#                 if len(boxes) > 0:
#                     for box in boxes:
#                         cls_id = int(box.cls[0])
#                         raw_class_name = yolo_model.names[cls_id]
#                         confidence = float(box.conf[0])
#                         coords = box.xyxy[0].cpu().numpy().astype(int).tolist()
#                         x1, y1, x2, y2 = coords
                        
#                         box_area = max(0, x2 - x1) * max(0, y2 - y1)
#                         total_image_area = w_orig * h_orig

#                         if box_area > (0.25 * total_image_area): continue
#                         if confidence < 0.20: continue

#                         class_name, confidence = enhance_hazard_classification(frame, coords, raw_class_name, confidence)
#                         center_x, center_y = (x1 + x2) // 2, (y1 + y2) // 2

#                         gps = geo_projector.pixel_to_gps(
#                             pixel_x=center_x, pixel_y=center_y, drone_lat=current_lat, 
#                             drone_lon=current_lon, altitude_m=altitude
#                         )
#                         volume_m3 = depth_engine.calculate_hazard_volume(depth_array, coords, altitude_m=altitude)

#                         current_frame_logs.append({
#                             "id": str(uuid.uuid4())[:8],
#                             "frame": frame_count,
#                             "hazard": class_name,
#                             "confidence": round(confidence, 2),
#                             "volume_m3": volume_m3,
#                             "latitude": round(gps["latitude"], 6),
#                             "longitude": round(gps["longitude"], 6),
#                             "bbox": coords,
#                             "timestamp": datetime.now(timezone.utc).isoformat(),
#                         })
                        
#                         current_boxes.append({
#                             "coords": coords, "class": class_name, 
#                             "conf": confidence, "vol": volume_m3
#                         })

#                 latest_telemetry = current_frame_logs
#                 last_boxes = current_boxes

#             except Exception as e:
#                 print(f"[AI PROCESSING WARNING] Frame {frame_count} skipped due to error: {e}")

#         # ------------------------------------------------------------------
#         # 2. PERSISTENT GRAPHICS RENDERING (Applied to EVERY frame)
#         # ------------------------------------------------------------------
#         depth_viz = last_depth_colormap.copy() if last_depth_colormap is not None else np.zeros_like(annotated_frame)

#         for b in last_boxes:
#             x1, y1, x2, y2 = b["coords"]
#             cls_name = b["class"]
#             conf = b["conf"]
#             vol = b["vol"]

#             box_color = (0, 255, 255) if "waterlogged" in cls_name.lower() else (0, 255, 0)
#             cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), box_color, 2)
            
#             tag_label = f"{cls_name.upper()} {conf:.2f} ({vol}m3)"
#             cv2.putText(annotated_frame, tag_label, (x1, max(20, y1 - 10)), 
#                         cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
#             cv2.rectangle(depth_viz, (x1, y1), (x2, y2), (255, 255, 255), 2)

#         # ------------------------------------------------------------------
#         # 3. DYNAMIC ASPECT RATIO RESIZING & ENCODING
#         # ------------------------------------------------------------------
#         h, w = annotated_frame.shape[:2]
#         target_h = 480
#         scale = target_h / float(h)
#         target_w = int(w * scale)

#         left_view = cv2.resize(annotated_frame, (target_w, target_h))
#         right_view = cv2.resize(depth_viz, (target_w, target_h))

#         cv2.putText(left_view, "1. 2D DETECTOR & GPS", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
#         cv2.putText(right_view, f"2. 3D DEPTH ({DEVICE.upper()})", (15, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

#         composite_frame = np.hstack((left_view, right_view))

#         # Compressing quality to 65 for incredibly fast web streaming
#         _, buffer = cv2.imencode(".jpg", composite_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
#         yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + buffer.tobytes() + b"\r\n")

#         # Give the CPU a micro-rest to keep FastAPI running smoothly
#         time.sleep(0.001)

#     cap.release()


@app.websocket("/ws/live-stream")
async def websocket_live_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Client connected to /ws/live-stream")
    try:
        while True:
            await websocket.send_json({
                "status": "online",
                "device": DEVICE,
                "model": MODEL_PATH,
                "telemetry": latest_telemetry,
            })
            await asyncio.sleep(0.05)
    except WebSocketDisconnect:
        print("[WS] Client disconnected from /ws/live-stream")
    except Exception as e:
        print(f"[WS Error] {e}")


@app.websocket("/api/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Telemetry client connected to /api/ws/telemetry")
    try:
        while True:
            await websocket.send_json(latest_telemetry)
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        print("[WS] Dashboard disconnected from telemetry stream.")
    except Exception as e:
        print(f"[Telemetry WS Error] {e}")


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    global ACTIVE_VIDEO_PATH, STREAM_ACTIVE
    file_location = f"data/raw_videos/{file.filename}"
    os.makedirs("data/raw_videos", exist_ok=True)
    
    with open(file_location, "wb+") as file_object:
        shutil.copyfileobj(file.file, file_object)
        
    ACTIVE_VIDEO_PATH = file_location
    STREAM_ACTIVE = True  # <--- Automatically start the AI when uploaded
    return {"status": "success", "message": f"Video {file.filename} loaded successfully", "path": ACTIVE_VIDEO_PATH}

@app.get("/api/stream/start")
@app.post("/api/stream/start")
def start_stream():
    global STREAM_ACTIVE
    STREAM_ACTIVE = True
    return {"status": "success", "message": "Live stream pipeline active"}

@app.get("/api/stream/stop")
@app.post("/api/stream/stop")
def stop_stream():
    global STREAM_ACTIVE
    STREAM_ACTIVE = False
    return {"status": "success", "message": "Live stream pipeline paused"}

@app.get("/api/stream_video")
async def api_stream_video():
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

@app.get("/stream")
async def stream_video():
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )

@app.get("/api/telemetry")
def get_telemetry():
    return {"status": "active", "detections": latest_telemetry}

@app.get("/health")
def health_check():
    return {
        "status": "online",
        "device": DEVICE,
        "weights": MODEL_PATH,
        "stream_endpoint": "/stream",
    }


# --- SUPABASE INTEGRATION ---
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://lkfpdrskgfffwtzbtlnq.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

supabase: Client | None = None
if SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    print("[WARNING] SUPABASE_KEY is not set. Supabase sync is disabled.")

async def push_telemetry_to_supabase(logs):
    if supabase is None:
        return
    try:
        for log in logs:
            supabase.table("hazard_telemetry").insert({
                "hazard_type": log["hazard"],
                "confidence": log["confidence"],
                "volume_m3": log["volume_m3"],
                "latitude": log["latitude"],
                "longitude": log["longitude"],
                "geom": f"POINT({log['longitude']} {log['latitude']})"
            }).execute()
    except Exception as e:
        print(f"[Supabase Sync Error] {e}")


from pydantic import BaseModel

class StatusUpdate(BaseModel):
    status: str

@app.post("/api/hazards/{hazard_id}/status")
async def update_hazard_status(hazard_id: str, payload: StatusUpdate):
    """Updates the status of an active hazard log in the backend."""
    # If you store hazards in a global list or database dictionary, update it here.
    # For now, this returns a successful 200 OK response to keep the UI synced.
    return {"status": "success", "hazard_id": hazard_id, "new_status": payload.status}