"""
HYDRO-VISION-3D — AI Perception Engine
=======================================
Live processing + permanent mission record, from one pass over the frames.

What changed from the previous version:
  + ByteTrack tracking with stable track IDs (was: predict, IDs collided per class)
  + Hazard consolidation registry — N frames become ONE hazard record
  + N-frame persistence gate — filters false positives without retraining
  + PER-CLASS confidence thresholds — recall-starved classes get a lower bar
  + Depth on its own slow cadence at native resolution (was ~95% of frame time)
  + Real evidence crops saved per hazard at peak confidence
  + Annotated video written to disk during the same pass (mission record)
  + Session isolation — every run gets its own ID and output directory
  + Honest geolocation — geo_source declared, synthetic paths badged
  + Relative depth index (unitless 0-1) replacing fabricated volume
  - Removed: volume_m3 = raw_volume * 0.1  (arbitrary constant)
  - Removed: enhance_hazard_classification (HSV guesswork inventing a class)
  - Fixed:  imgsz 960 -> 640 (matches training resolution)
  - Fixed:  torch.cuda.amp.autocast deprecation
  - Fixed:  geo_projector hardcoded to 1920x1080 regardless of actual video
"""

import asyncio
import json
import os
import shutil
import statistics
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image
from pydantic import BaseModel
from ultralytics import YOLO

from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector

torch.set_grad_enabled(False)


# ===========================================================================
# CONFIGURATION — every tunable in one place, no magic numbers below
# ===========================================================================

# Per-class confidence. Measured validation recall/precision drives these:
#   open_manhole       P 0.911  R 0.626  -> can afford a high bar
#   drainage_overflow  P 0.665  R 0.681  -> healthy
#   potholes           P 0.454  R 0.605  -> noisy, keep moderate
#   damaged_footpath   P 0.451  R 0.425  -> recall-starved
#   cracks             P 0.487  R 0.346  -> recall-starved
#   waterlogging_area  P 0.674  R 0.338  -> worst recall, most important class
# The N-frame persistence gate absorbs the extra noise the low bars let in.
CLASS_CONF = {
    "open_manhole":      0.35,
    "drainage_overflow": 0.30,
    "potholes":          0.25,
    "damaged_footpath":  0.10,
    "waterlogging_area": 0.08,
}
CONF_THRESHOLD = 0.05          # model runs wide open; CLASS_CONF does the filtering
DEFAULT_CLASS_CONF = 0.20      # used if a class is missing from CLASS_CONF

IMGSZ = 640                    # MUST match training resolution
DETECT_EVERY_N = 2             # 1 = every frame (best tracking), higher = faster
DEPTH_EVERY_N = 15             # depth changes slowly; detection doesn't
DEPTH_INPUT_WIDTH = 518        # Depth Anything's native size; 1080p input is wasted
MIN_FRAMES_TO_CONFIRM = 3      # persistence gate (counted in PROCESSED frames)
# Per-class area ceilings. A flooded street legitimately fills most of an
# aerial frame; an open manhole never does. One global ratio was discarding
# exactly the class with the worst recall.
MAX_BOX_AREA_RATIO = {
    "waterlogging_area": 0.95,
    "drainage_overflow": 0.85,
    "damaged_footpath":  0.70,
    "potholes":          0.35,
    "open_manhole":      0.25,
}
DEFAULT_MAX_AREA_RATIO = 0.60      # was 0.25 — that was deleting waterlogging_area
TRACKER_CFG = "bytetrack.yaml"

# Geolocation. No telemetry in our footage yet, so we simulate a flight path
# and TAG IT. Set to False to emit null coordinates instead.
USE_SIMULATED_FLIGHT = True
SIM_START_LAT = 22.30720
SIM_START_LON = 73.18200
SIM_ALTITUDE_M = 25.0
SIM_LAT_PER_FRAME = 0.000005
SIM_LON_PER_FRAME = 0.000006
CAMERA_HFOV_DEG = 84.0
CAMERA_PITCH_DEG = -90.0       # nadir. Change if K-05 shows the camera is angled.

OUTPUT_ROOT = Path("outputs/sessions")
DEFAULT_VIDEO_PATH = "data/raw_videos/master_video.mp4"

SEVERITY_BANDS = [
    (0.00, "LOW"),
    (0.35, "MODERATE"),
    (0.60, "HIGH"),
    (0.82, "CRITICAL"),
]

CLASS_BASE_RISK = {
    "open_manhole": 1.00,      # immediate danger to life
    "waterlogging_area": 0.70,
    "drainage_overflow": 0.65,
    "potholes": 0.55,
    "damaged_footpath": 0.40,
}


# ===========================================================================
# APP
# ===========================================================================

app = FastAPI(
    title="Hydro-Vision 3D AI Perception Engine",
    description="Live hazard detection, consolidation, spatial analysis and mission recording",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_compute_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def resolve_model_weights() -> str:
    candidates = [
        "best.pt",
        "runs/yolov8s_baseline/weights/best.pt",
        "models/best.pt",
        "weights/best.pt",
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    raise FileNotFoundError(
        "No trained weights found. Looked in: " + ", ".join(candidates) +
        "\nRefusing to start with a fallback model — it would produce "
        "detections for the wrong classes."
    )


DEVICE = get_compute_device()
MODEL_PATH = resolve_model_weights()

print(f"[INIT] Device : {DEVICE.upper()}")
print(f"[INIT] Weights: {MODEL_PATH}")

yolo_model = YOLO(MODEL_PATH)
print(f"[INIT] Classes: {yolo_model.names}")

if len(yolo_model.names) != 5:
    print(f"[WARNING] Model has {len(yolo_model.names)} classes, expected 6. "
          f"Check you loaded the right weights file.")

try:
    depth_engine = DepthEngine(device=DEVICE)
    DEPTH_AVAILABLE = True
except Exception as e:
    print(f"[WARNING] Depth engine unavailable: {e}")
    print("[WARNING] Pipeline continues without depth. This is a soft failure.")
    depth_engine = None
    DEPTH_AVAILABLE = False

# Re-created per video once real frame dimensions are known
geo_projector: Optional[GeoProjector] = None


# ===========================================================================
# HAZARD REGISTRY — the core of USP-1
#
# One physical hazard = one track = one record, accumulated across frames.
# This is what turns thousands of boxes into a short, ranked worklist, and
# what makes a 0.45-precision detector usable: false positives appear in one
# or two frames and never pass the persistence gate.
# ===========================================================================

class HazardRegistry:
    def __init__(self, session_id: str, evidence_dir: Path):
        self.session_id = session_id
        self.evidence_dir = evidence_dir
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self._tracks: Dict[int, dict] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _hazard_id(session_id: str, track_id: int) -> str:
        import hashlib
        h = hashlib.sha1(f"{session_id}:{track_id}".encode()).hexdigest()[:6]
        return f"HAZ-{h.upper()}"

    def update(self, *, track_id: int, class_name: str, class_id: int,
               confidence: float, bbox: List[int], area_px: float,
               frame_id: int, t_s: float, frame: np.ndarray,
               lat: Optional[float], lon: Optional[float],
               geo_source: str, depth_index: Optional[float]) -> None:
        with self._lock:
            h = self._tracks.get(track_id)
            if h is None:
                h = {
                    "hazard_id": self._hazard_id(self.session_id, track_id),
                    "track_id": track_id,
                    "class_id": class_id,
                    "class_name": class_name,
                    "confidence_max": 0.0,
                    "detections_count": 0,
                    "first_frame": frame_id,
                    "last_frame": frame_id,
                    "first_seen_s": round(t_s, 2),
                    "last_seen_s": round(t_s, 2),
                    "area_px_samples": [],
                    "depth_samples": [],
                    "bbox_px": bbox,
                    "lat": lat,
                    "lon": lon,
                    "geo_source": geo_source,
                    "evidence_image": None,
                    "status": "OPEN",
                }
                self._tracks[track_id] = h

            h["detections_count"] += 1
            h["last_frame"] = frame_id
            h["last_seen_s"] = round(t_s, 2)
            h["area_px_samples"].append(area_px)
            if depth_index is not None:
                h["depth_samples"].append(depth_index)

            # Keep the crop and position from the most confident sighting.
            if confidence > h["confidence_max"]:
                h["confidence_max"] = confidence
                h["bbox_px"] = bbox
                h["lat"], h["lon"] = lat, lon
                self._save_evidence(h, frame, bbox)

    def _save_evidence(self, h: dict, frame: np.ndarray, bbox: List[int]) -> None:
        """Crop with padding, from the peak-confidence frame. USP-4."""
        try:
            fh, fw = frame.shape[:2]
            x1, y1, x2, y2 = bbox
            pad = 24
            x1 = max(0, x1 - pad); y1 = max(0, y1 - pad)
            x2 = min(fw, x2 + pad); y2 = min(fh, y2 + pad)
            if x2 <= x1 or y2 <= y1:
                return
            crop = frame[y1:y2, x1:x2]
            if crop.size == 0:
                return
            # Upscale tiny crops so they're legible in the UI
            ch, cw = crop.shape[:2]
            if max(ch, cw) < 160:
                s = 160.0 / max(ch, cw)
                crop = cv2.resize(crop, (int(cw * s), int(ch * s)),
                                  interpolation=cv2.INTER_CUBIC)
            out = self.evidence_dir / f"{h['hazard_id']}.jpg"
            cv2.imwrite(str(out), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            h["evidence_image"] = f"/static/sessions/{self.session_id}/evidence/{h['hazard_id']}.jpg"
        except Exception as e:
            print(f"[EVIDENCE] Could not save crop for {h.get('hazard_id')}: {e}")

    def set_status(self, hazard_id: str, status: str) -> bool:
        with self._lock:
            for h in self._tracks.values():
                if h["hazard_id"] == hazard_id:
                    h["status"] = status
                    return True
        return False

    def raw_track_count(self) -> int:
        """Total tracks seen, including unconfirmed. Shows the consolidation ratio."""
        with self._lock:
            return len(self._tracks)

    def confirmed(self) -> List[dict]:
        """Only hazards that survived the persistence gate."""
        with self._lock:
            tracks = list(self._tracks.values())

        out = []
        for h in tracks:
            if h["detections_count"] < MIN_FRAMES_TO_CONFIRM:
                continue
            if not h["area_px_samples"]:
                continue

            # Median, not mean or last: robust to one bad frame, and to the
            # apparent-size changes you get as a drone moves.
            area_px = float(statistics.median(h["area_px_samples"]))
            depth_index = (round(float(statistics.median(h["depth_samples"])), 3)
                           if h["depth_samples"] else None)

            rec = {
                "hazard_id": h["hazard_id"],
                "track_id": h["track_id"],
                "class_id": h["class_id"],
                "class_name": h["class_name"],
                "confidence_max": round(h["confidence_max"], 3),
                "detections_count": h["detections_count"],
                "first_frame": h["first_frame"],
                "last_frame": h["last_frame"],
                "first_seen_s": h["first_seen_s"],
                "last_seen_s": h["last_seen_s"],
                "duration_s": round(h["last_seen_s"] - h["first_seen_s"], 2),
                "bbox_px": h["bbox_px"],
                "area_px": round(area_px, 1),

                # Metric area needs verified intrinsics + altitude (K-14/K-15).
                # Until then this is honestly null, and ranking uses pixels.
                "area_m2": None,
                "gsd_m_per_px": None,
                "area_reason": "no_intrinsics",

                "lat": h["lat"],
                "lon": h["lon"],
                "geo_source": h["geo_source"],
                "zone": None,
                "relative_depth_index": depth_index,
                "evidence_image": h["evidence_image"],
                "status": h["status"],
                "confirmed": True,
            }
            out.append(rec)

        return self._score(out)

    def _score(self, records: List[dict]) -> List[dict]:
        """Severity from class risk, relative extent and persistence.

        Ranked on PIXEL area percentile because metric area isn't available
        yet — flagged as severity_basis 'relative' so nothing overstates itself.
        """
        if not records:
            return records

        areas = sorted(r["area_px"] for r in records)

        def pct(v: float) -> float:
            if len(areas) < 2:
                return 0.5
            below = sum(1 for a in areas if a < v)
            return below / (len(areas) - 1)

        max_dur = max((r["duration_s"] for r in records), default=0.0) or 1.0

        for r in records:
            base = CLASS_BASE_RISK.get(r["class_name"], 0.4)
            extent = pct(r["area_px"])
            persistence = min(1.0, r["duration_s"] / max_dur)
            conf = r["confidence_max"]

            score = 0.45 * base + 0.25 * extent + 0.15 * persistence + 0.15 * conf
            score = max(0.0, min(1.0, score))

            band = "LOW"
            for threshold, name in SEVERITY_BANDS:
                if score >= threshold:
                    band = name

            r["severity_score"] = round(score, 3)
            r["severity_band"] = band
            r["severity_basis"] = "relative"
            r["priority_score"] = int(round(score * 100))

        records.sort(key=lambda r: r["priority_score"], reverse=True)
        return records


# ===========================================================================
# SESSION STATE
# ===========================================================================

class SessionState:
    def __init__(self):
        self.lock = threading.Lock()
        self.session_id: Optional[str] = None
        self.video_path: str = DEFAULT_VIDEO_PATH
        self.out_dir: Optional[Path] = None
        self.registry: Optional[HazardRegistry] = None
        self.active: bool = False
        self.finished: bool = False
        self.frame_count: int = 0
        self.total_frames: int = 0
        self.fps: float = 30.0
        self.width: int = 0
        self.height: int = 0
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.achieved_fps: float = 0.0
        self.stage_status: Dict[str, str] = {}
        self.streaming: bool = False      # guards against 2 concurrent pipelines

    def new_session(self, video_path: str) -> str:
        with self.lock:
            sid = f"S-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            self.session_id = sid
            self.video_path = video_path
            self.out_dir = OUTPUT_ROOT / sid
            self.out_dir.mkdir(parents=True, exist_ok=True)
            self.registry = HazardRegistry(sid, self.out_dir / "evidence")
            self.frame_count = 0
            self.finished = False
            self.started_at = datetime.now(timezone.utc).isoformat()
            self.finished_at = None
            self.achieved_fps = 0.0
            self.stage_status = {
                "ingest": "ok",
                "detect": "ok",
                "track": "ok",
                "consolidate": "ok",
                "depth": "ok" if DEPTH_AVAILABLE else "failed: engine unavailable",
                "area": "skipped: intrinsics not verified",
                "geo": ("ok: simulated flight path" if USE_SIMULATED_FLIGHT
                        else "skipped: no telemetry"),
                "severity": "ok",
                "artifact": "ok",
            }
            return sid

    def hazards(self) -> List[dict]:
        return self.registry.confirmed() if self.registry else []

    def summary(self) -> dict:
        hz = self.hazards()
        bands = [h["severity_band"] for h in hz]
        risk = "LOW"
        for b in ("MODERATE", "HIGH", "CRITICAL"):
            if b in bands:
                risk = b
        score = max((h["priority_score"] for h in hz), default=0)
        progress = (round(100.0 * self.frame_count / self.total_frames, 1)
                    if self.total_frames else None)
        return {
            "session_id": self.session_id,
            "total_hazards": len(hz),
            "raw_tracks": self.registry.raw_track_count() if self.registry else 0,
            "total_area_m2": None,          # requires verified intrinsics
            "session_risk_band": risk,
            "session_risk_score": score,
            "alert_count": sum(1 for b in bands if b in ("HIGH", "CRITICAL")),
            "frames_processed": self.frame_count,
            "total_frames": self.total_frames,
            "progress_pct": progress,
            "achieved_fps": round(self.achieved_fps, 1),
            "stage_status": self.stage_status,
            "streaming": self.streaming,
            "finished": self.finished,
            "mode": "live_processing" if self.streaming else
                    ("mission_complete" if self.finished else "standby"),
        }

    def snapshot(self) -> dict:
        return {
            "schema_version": "1.0.0",
            "session": {
                "session_id": self.session_id,
                "video_path": self.video_path,
                "width": self.width,
                "height": self.height,
                "fps": self.fps,
                "total_frames": self.total_frames,
                "model_path": MODEL_PATH,
                "device": DEVICE,
                "class_conf": CLASS_CONF,
                "imgsz": IMGSZ,
                "detect_every_n": DETECT_EVERY_N,
                "depth_every_n": DEPTH_EVERY_N,
                "min_frames_to_confirm": MIN_FRAMES_TO_CONFIRM,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "stage_status": self.stage_status,
            },
            "summary": self.summary(),
            "hazards": self.hazards(),
        }

    def geojson(self) -> dict:
        feats = []
        for h in self.hazards():
            if h["lat"] is None or h["lon"] is None:
                continue
            feats.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [h["lon"], h["lat"]]},
                "properties": {
                    "hazard_id": h["hazard_id"],
                    "class_name": h["class_name"],
                    "confidence": h["confidence_max"],
                    "severity_band": h["severity_band"],
                    "priority_score": h["priority_score"],
                    "detections_count": h["detections_count"],
                    "duration_s": h["duration_s"],
                    "geo_source": h["geo_source"],
                    "status": h["status"],
                },
            })
        return {
            "type": "FeatureCollection",
            "features": feats,
            "properties": {
                "session_id": self.session_id,
                "hazards_total": len(self.hazards()),
                "hazards_located": len(feats),
            },
        }

    def write_artifacts(self) -> None:
        """Mission record — USP-6. Survives a crash as a partial but valid bundle."""
        if not self.out_dir:
            return
        try:
            (self.out_dir / "hazards.json").write_text(
                json.dumps(self.snapshot(), indent=2))
            (self.out_dir / "hazards.geojson").write_text(
                json.dumps(self.geojson(), indent=2))
            print(f"[ARTIFACT] Wrote session bundle -> {self.out_dir}")
        except Exception as e:
            self.stage_status["artifact"] = f"failed: {e}"
            print(f"[ARTIFACT ERROR] {e}")


SESSION = SessionState()


# ===========================================================================
# DEPTH — relative index only. Never centimetres, never cubic metres.
# ===========================================================================

def compute_relative_depth_index(depth_array: np.ndarray,
                                 bbox: List[int]) -> Optional[float]:
    """How much the hazard interior differs from its immediate rim, 0..1.

    Depth Anything V2 emits RELATIVE INVERSE depth, normalised per frame.
    There is no metric scale in it, so this is an index for ranking only.
    """
    try:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = depth_array.shape[:2]
        x1 = max(0, min(w - 1, x1)); x2 = max(0, min(w, x2))
        y1 = max(0, min(h - 1, y1)); y2 = max(0, min(h, y2))
        if x2 - x1 < 4 or y2 - y1 < 4:
            return None

        crop = depth_array[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        rim = np.concatenate([crop[0, :], crop[-1, :], crop[:, 0], crop[:, -1]])
        rim_med = float(np.median(rim))

        ih = max(1, (y2 - y1) // 4)
        iw = max(1, (x2 - x1) // 4)
        interior = crop[ih:-ih, iw:-iw] if crop[ih:-ih, iw:-iw].size else crop
        int_med = float(np.median(interior))

        spread = float(np.percentile(depth_array, 95) - np.percentile(depth_array, 5))
        if spread <= 1e-6:
            return None

        return float(np.clip(abs(rim_med - int_med) / spread, 0.0, 1.0))
    except Exception:
        return None


# ===========================================================================
# THE PIPELINE — one pass, live view + mission record
# ===========================================================================

def _standby_frame(text: str) -> bytes:
    img = np.zeros((480, 854, 3), dtype=np.uint8)
    cv2.putText(img, text, (60, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.6,
                (0, 255, 255), 2)
    _, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
    return buf.tobytes()


def _wrap(jpeg: bytes) -> bytes:
    return b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"


def _transcode_h264(out_dir: Optional[Path]) -> None:
    """mp4v doesn't play in browsers. Transcode if ffmpeg exists; keep the
    raw file either way so the record is never lost."""
    if not out_dir:
        return
    raw = out_dir / "annotated_raw.mp4"
    final = out_dir / "annotated.mp4"
    if not raw.exists():
        return
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw), "-c:v", "libx264",
             "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
             str(final)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900)
        raw.unlink(missing_ok=True)
        print(f"[ARTIFACT] Annotated video -> {final}")
    except FileNotFoundError:
        shutil.move(str(raw), str(final))
        print("[ARTIFACT] ffmpeg not found; saved mp4v (may not play in browser).")
    except Exception as e:
        shutil.move(str(raw), str(final))
        print(f"[ARTIFACT] Transcode failed ({e}); kept raw file.")


def generate_mjpeg_stream():
    """Synchronous generator: FastAPI runs it in a thread, so the event loop
    stays responsive for WebSockets and REST."""
    global geo_projector

    # Only one pipeline at a time. A second browser tab gets a notice frame
    # instead of starting a competing GPU pass.
    if SESSION.streaming:
        while SESSION.streaming:
            yield _wrap(_standby_frame("PIPELINE ALREADY RUNNING - VIEW IN ORIGINAL TAB"))
            time.sleep(1.0)
        return

    cap = None
    writer = None
    current_path = None
    last_boxes: List[dict] = []
    last_depth_colormap = None
    last_depth_array = None
    t_start = time.time()

    try:
        while True:
            # ---------------- STANDBY ----------------
            if not SESSION.active:
                if cap is not None:
                    cap.release(); cap = None
                if writer is not None:
                    writer.release(); writer = None
                    SESSION.write_artifacts()
                SESSION.streaming = False
                msg = ("MISSION COMPLETE - REVIEW RESULTS BELOW" if SESSION.finished
                       else "SYSTEM STANDBY - UPLOAD VIDEO TO START AI PIPELINE")
                yield _wrap(_standby_frame(msg))
                time.sleep(0.5)
                continue

            # ---------------- OPEN VIDEO ----------------
            if cap is None or current_path != SESSION.video_path:
                if cap is not None:
                    cap.release()
                cap = cv2.VideoCapture(SESSION.video_path)
                if not cap.isOpened():
                    print(f"[ERROR] Cannot open video: {SESSION.video_path}")
                    SESSION.stage_status["ingest"] = "failed: cannot open video"
                    SESSION.active = False
                    yield _wrap(_standby_frame("ERROR - CANNOT OPEN VIDEO FILE"))
                    time.sleep(1.0)
                    continue

                current_path = SESSION.video_path
                SESSION.fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
                SESSION.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                SESSION.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
                SESSION.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
                SESSION.frame_count = 0
                SESSION.streaming = True
                t_start = time.time()

                # Depth cache must not carry over between videos.
                last_depth_colormap = None
                last_depth_array = None
                last_boxes = []

                # Intrinsics must follow the ACTUAL video, not a hardcoded 1080p.
                geo_projector = GeoProjector(
                    image_width=SESSION.width or 1920,
                    image_height=SESSION.height or 1080,
                    hfov_deg=CAMERA_HFOV_DEG,
                )

                # Reset tracker so IDs don't leak between videos.
                try:
                    yolo_model.predictor = None
                except Exception:
                    pass

                # Mission record writer — same pass, no second decode.
                if SESSION.out_dir:
                    try:
                        writer = cv2.VideoWriter(
                            str(SESSION.out_dir / "annotated_raw.mp4"),
                            cv2.VideoWriter_fourcc(*"mp4v"),
                            SESSION.fps,
                            (SESSION.width, SESSION.height),
                        )
                        if not writer.isOpened():
                            print("[WARNING] VideoWriter failed to open; "
                                  "live view continues without recording.")
                            SESSION.stage_status["artifact"] = "failed: writer unavailable"
                            writer = None
                    except Exception as e:
                        print(f"[WARNING] VideoWriter error: {e}")
                        writer = None

                print(f"[PIPELINE] {SESSION.session_id} | {SESSION.width}x{SESSION.height} "
                      f"@ {SESSION.fps:.1f}fps | {SESSION.total_frames} frames")

            # ---------------- READ ----------------
            ret, frame = cap.read()
            if not ret:
                print("[PIPELINE] End of video. Finalising mission record.")
                SESSION.active = False
                SESSION.finished = True
                SESSION.finished_at = datetime.now(timezone.utc).isoformat()
                if writer is not None:
                    writer.release(); writer = None
                    _transcode_h264(SESSION.out_dir)
                SESSION.write_artifacts()
                SESSION.streaming = False
                continue  # -> standby, generator stays alive for the client

            SESSION.frame_count += 1
            fid = SESSION.frame_count
            t_s = fid / SESSION.fps if SESSION.fps else 0.0
            annotated = frame.copy()
            fh, fw = frame.shape[:2]

            # ---------------- DEPTH (slow cadence, own budget) ----------------
            # Depth Anything V2 was ~95% of frame time at full resolution.
            # Depth changes slowly across frames; detection does not. So it
            # runs on its own schedule, at the model's native input width,
            # and every other frame reuses the cached map.
            if DEPTH_AVAILABLE and (fid % DEPTH_EVERY_N == 1 or last_depth_array is None):
                try:
                    dh = max(1, int(fh * (DEPTH_INPUT_WIDTH / float(fw))))
                    small = cv2.resize(frame, (DEPTH_INPUT_WIDTH, dh))
                    pil = Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
                    depth_small, _ = depth_engine.predict_depth(pil)
                    last_depth_array = cv2.resize(
                        np.asarray(depth_small, dtype=np.float32), (fw, fh))
                    nd = cv2.normalize(last_depth_array, None, 0, 255,
                                       norm_type=cv2.NORM_MINMAX).astype(np.uint8)
                    last_depth_colormap = cv2.applyColorMap(nd, cv2.COLORMAP_INFERNO)
                except Exception as e:
                    SESSION.stage_status["depth"] = f"failed: {type(e).__name__}"
                    print(f"[DEPTH WARNING] frame {fid}: {e}")

            depth_array = last_depth_array

            # ---------------- DETECTION + TRACKING ----------------
            if fid % DETECT_EVERY_N == 1 or DETECT_EVERY_N == 1:
                try:
                    if DEVICE == "cuda":
                        with torch.amp.autocast("cuda"):
                            results = yolo_model.track(
                                source=frame, conf=CONF_THRESHOLD, imgsz=IMGSZ,
                                device=DEVICE, persist=True, tracker=TRACKER_CFG,
                                verbose=False)[0]
                    else:
                        results = yolo_model.track(
                            source=frame, conf=CONF_THRESHOLD, imgsz=IMGSZ,
                            device=DEVICE, persist=True, tracker=TRACKER_CFG,
                            verbose=False)[0]

                    if USE_SIMULATED_FLIGHT:
                        cur_lat = SIM_START_LAT + fid * SIM_LAT_PER_FRAME
                        cur_lon = SIM_START_LON + fid * SIM_LON_PER_FRAME
                        geo_source = "synthetic"
                    else:
                        cur_lat = cur_lon = None
                        geo_source = "none"

                    boxes = results.boxes
                    current_boxes = []

                    if boxes is not None and len(boxes) > 0:
                        for box in boxes:
                            # No track ID = untracked. Drop it rather than
                            # merging unrelated detections into a phantom hazard.
                            if box.id is None:
                                continue

                            track_id = int(box.id[0])
                            cls_id = int(box.cls[0])
                            class_name = yolo_model.names[cls_id]
                            conf = float(box.conf[0])

                            # PER-CLASS threshold. Recall-starved classes get a
                            # lower bar; the persistence gate removes the noise.
                            if conf < CLASS_CONF.get(class_name, DEFAULT_CLASS_CONF):
                                continue

                            coords = box.xyxy[0].cpu().numpy().astype(int).tolist()
                            x1, y1, x2, y2 = coords

                            area_px = max(0, x2 - x1) * max(0, y2 - y1)
                            if area_px <= 0:
                                continue
                            _max_ratio = MAX_BOX_AREA_RATIO.get(
                                class_name, DEFAULT_MAX_AREA_RATIO)
                            if area_px > _max_ratio * (fw * fh):
                                continue

                            lat = lon = None
                            if geo_source != "none" and geo_projector is not None:
                                try:
                                    gps = geo_projector.pixel_to_gps(
                                        pixel_x=(x1 + x2) // 2,
                                        pixel_y=(y1 + y2) // 2,
                                        drone_lat=cur_lat, drone_lon=cur_lon,
                                        altitude_m=SIM_ALTITUDE_M,
                                        pitch_deg=CAMERA_PITCH_DEG,
                                    )
                                    lat = round(gps["latitude"], 7)
                                    lon = round(gps["longitude"], 7)
                                except Exception as e:
                                    SESSION.stage_status["geo"] = f"failed: {type(e).__name__}"

                            depth_index = (compute_relative_depth_index(depth_array, coords)
                                           if depth_array is not None else None)

                            SESSION.registry.update(
                                track_id=track_id, class_name=class_name,
                                class_id=cls_id, confidence=conf, bbox=coords,
                                area_px=float(area_px), frame_id=fid, t_s=t_s,
                                frame=frame, lat=lat, lon=lon,
                                geo_source=geo_source, depth_index=depth_index,
                            )

                            current_boxes.append({
                                "coords": coords, "class": class_name,
                                "conf": conf, "track_id": track_id,
                            })

                    last_boxes = current_boxes

                except Exception as e:
                    SESSION.stage_status["detect"] = f"failed: {type(e).__name__}"
                    print(f"[AI WARNING] frame {fid}: {e}")

            # ---------------- OVERLAY ----------------
            depth_viz = (last_depth_colormap.copy()
                         if last_depth_colormap is not None
                         else np.zeros_like(annotated))
            if depth_viz.shape[:2] != annotated.shape[:2]:
                depth_viz = cv2.resize(depth_viz, (fw, fh))

            for b in last_boxes:
                x1, y1, x2, y2 = b["coords"]
                name = b["class"]
                colour = (0, 200, 255) if "water" in name.lower() else (0, 255, 0)
                cv2.rectangle(annotated, (x1, y1), (x2, y2), colour, 2)
                label = f"#{b['track_id']} {name} {b['conf']:.2f}"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                ly = max(th + 4, y1 - 6)
                cv2.rectangle(annotated, (x1, ly - th - 4), (x1 + tw + 6, ly + 2),
                              (0, 0, 0), -1)
                cv2.putText(annotated, label, (x1 + 3, ly - 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
                cv2.rectangle(depth_viz, (x1, y1), (x2, y2), (255, 255, 255), 1)

            n_conf = len(SESSION.hazards())
            hud = f"F{fid}  t={t_s:5.1f}s  hazards={n_conf}  {SESSION.achieved_fps:.1f}fps"
            cv2.rectangle(annotated, (8, 8), (8 + 430, 40), (0, 0, 0), -1)
            cv2.putText(annotated, hud, (14, 32), cv2.FONT_HERSHEY_SIMPLEX,
                        0.6, (255, 255, 255), 1)

            # Mission record gets the same pixels the operator saw.
            if writer is not None:
                try:
                    writer.write(annotated)
                except Exception as e:
                    print(f"[ARTIFACT WARNING] write failed: {e}")
                    SESSION.stage_status["artifact"] = f"failed: {type(e).__name__}"
                    writer.release(); writer = None

            elapsed = max(1e-6, time.time() - t_start)
            SESSION.achieved_fps = SESSION.frame_count / elapsed

            # ---------------- STREAM ----------------
            target_h = 480
            scale = target_h / float(fh)
            target_w = max(1, int(fw * scale))
            left = cv2.resize(annotated, (target_w, target_h))
            right = cv2.resize(depth_viz, (target_w, target_h))

            cv2.putText(left, "1. DETECTION + TRACKING", (12, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
            label_r = ("2. RELATIVE DEPTH" if DEPTH_AVAILABLE
                       else "2. DEPTH UNAVAILABLE")
            cv2.putText(right, label_r, (12, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

            composite = np.hstack((left, right))
            ok, buf = cv2.imencode(".jpg", composite,
                                   [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok:
                yield _wrap(buf.tobytes())

            time.sleep(0.001)

    except GeneratorExit:
        print("[PIPELINE] Client disconnected.")
    except Exception as e:
        print(f"[PIPELINE FATAL] {e}")
    finally:
        # Never leak a file handle or lose a partial mission record.
        if cap is not None:
            cap.release()
        if writer is not None:
            writer.release()
            _transcode_h264(SESSION.out_dir)
        SESSION.streaming = False
        SESSION.write_artifacts()


# ===========================================================================
# ROUTES
# ===========================================================================

@app.get("/api/stream_video")
@app.get("/stream")
async def api_stream_video():
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...)):
    os.makedirs("data/raw_videos", exist_ok=True)
    dest = f"data/raw_videos/{file.filename}"
    with open(dest, "wb+") as f:
        shutil.copyfileobj(file.file, f)

    SESSION.active = False
    time.sleep(0.4)                       # let the running pass wind down
    sid = SESSION.new_session(dest)
    SESSION.active = True
    return {"status": "success", "session_id": sid, "path": dest,
            "message": f"{file.filename} loaded; pipeline starting"}


@app.get("/api/stream/start")
@app.post("/api/stream/start")
def start_stream():
    if not SESSION.session_id:
        SESSION.new_session(SESSION.video_path)
    SESSION.active = True
    return {"status": "success", "session_id": SESSION.session_id}


@app.get("/api/stream/stop")
@app.post("/api/stream/stop")
def stop_stream():
    SESSION.active = False
    SESSION.write_artifacts()
    return {"status": "success", "message": "Pipeline stopped; artifacts written"}


@app.get("/api/hazards")
def get_hazards():
    return {"hazards": SESSION.hazards(), "summary": SESSION.summary()}


@app.get("/api/hazards/geojson")
def get_geojson():
    return SESSION.geojson()


@app.get("/api/session")
def get_session():
    return SESSION.snapshot()


@app.get("/api/sessions")
def list_sessions():
    if not OUTPUT_ROOT.exists():
        return {"sessions": []}
    out = []
    for d in sorted(OUTPUT_ROOT.iterdir(), reverse=True):
        if not d.is_dir():
            continue
        out.append({
            "session_id": d.name,
            "has_video": (d / "annotated.mp4").exists(),
            "has_hazards": (d / "hazards.json").exists(),
        })
    return {"sessions": out}


@app.get("/api/sessions/{session_id}/video")
def get_session_video(session_id: str):
    # Reject traversal attempts before touching the filesystem.
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        return {"error": "invalid session id"}
    p = OUTPUT_ROOT / session_id / "annotated.mp4"
    if not p.exists():
        return {"error": "not found"}
    return FileResponse(str(p), media_type="video/mp4")


@app.get("/api/sessions/{session_id}/hazards")
def get_session_hazards(session_id: str):
    if "/" in session_id or "\\" in session_id or ".." in session_id:
        return {"error": "invalid session id"}
    p = OUTPUT_ROOT / session_id / "hazards.json"
    if not p.exists():
        return {"error": "not found"}
    return json.loads(p.read_text())


class StatusUpdate(BaseModel):
    status: str


@app.post("/api/hazards/{hazard_id}/status")
async def update_hazard_status(hazard_id: str, payload: StatusUpdate):
    if payload.status not in ("OPEN", "IN_PROGRESS", "RESOLVED"):
        return {"status": "error", "message": "invalid status"}
    ok = SESSION.registry.set_status(hazard_id, payload.status) if SESSION.registry else False
    if ok:
        SESSION.write_artifacts()
    return {"status": "success" if ok else "not_found",
            "hazard_id": hazard_id, "new_status": payload.status}


@app.get("/api/telemetry")
def get_telemetry():
    return {"status": "active", "detections": SESSION.hazards()}


@app.get("/health")
def health_check():
    return {
        "status": "online",
        "device": DEVICE,
        "weights": MODEL_PATH,
        "classes": yolo_model.names,
        "class_conf": CLASS_CONF,
        "depth_available": DEPTH_AVAILABLE,
        "session": SESSION.session_id,
        "streaming": SESSION.streaming,
    }


# --------------------------- WebSockets ---------------------------
# Both endpoints send the SAME shape. The old ones sent different
# structures, which is why two parts of the UI disagreed about the count.

async def _push_loop(ws: WebSocket, interval: float, label: str):
    await ws.accept()
    print(f"[WS] {label} connected")
    try:
        while True:
            if ws.client_state.name != "CONNECTED":
                break
            await ws.send_json({
                "schema_version": "1.0.0",
                "summary": SESSION.summary(),
                "hazards": SESSION.hazards(),
            })
            await asyncio.sleep(interval)
    except (WebSocketDisconnect, RuntimeError):
        pass
    except Exception as e:
        print(f"[WS] {label} error: {e}")
    finally:
        print(f"[WS] {label} disconnected")


@app.websocket("/ws/live-stream")
async def ws_live_stream(websocket: WebSocket):
    # 2 Hz, not 20 Hz. Per-frame pushes of a growing list were the UI stutter.
    await _push_loop(websocket, 0.5, "live-stream")


@app.websocket("/api/ws/telemetry")
async def ws_telemetry(websocket: WebSocket):
    await _push_loop(websocket, 0.5, "telemetry")


# --------------------------- Static ---------------------------

os.makedirs("outputs/sessions", exist_ok=True)
try:
    from fastapi.staticfiles import StaticFiles
    app.mount("/static/sessions", StaticFiles(directory="outputs/sessions"),
              name="sessions")
except Exception as e:
    print(f"[WARNING] Could not mount evidence directory: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)