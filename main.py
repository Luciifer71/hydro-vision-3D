"""
HYDRO-VISION-3D — AI Perception Engine
=======================================
Live processing + permanent mission record, from one pass over the frames.

Design principles:
  - One physical hazard = one track = one record (consolidation).
  - If a value cannot be computed, it is None. Never a fallback constant.
  - Every stage fails soft and reports why, rather than killing the pipeline.
  - Runtime-tunable values live in config, read once per session, so they can
    be changed on deployment day without editing code or restarting.
"""

import asyncio
import json
import re
import uuid as _uuid
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
from fastapi import (FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect,
                     Header, HTTPException)
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from pydantic import BaseModel
from ultralytics import YOLO

from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector
import src.runtime_config as CFG

torch.set_grad_enabled(False)

SCHEMA_VERSION = "2.0.0"


# ===========================================================================
# CONFIGURATION
#
# Runtime-tunable values live in src/runtime_config.py and config/runtime.json,
# and are read ONCE per session by _load_session_config() so a run stays
# internally consistent. A change via POST /api/config takes effect on the
# next run, not mid-video.
#
# Only genuinely fixed values remain as module constants here.
# ===========================================================================

DEFAULT_CLASS_CONF = 0.20      # used if a class is missing from class_conf
DEFAULT_MAX_AREA_RATIO = 0.60  # used if a class is missing from max_area_ratio

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
DOWNLOAD_NAME = "Hydro-Vision-3D_annotated.mp4"
MAX_DURATION_S = 600           # advisory only; longer videos are frame-sampled

OUTPUT_ROOT = Path("outputs/sessions")
LATEST_VIDEO = Path("outputs/latest_annotated.mp4")
LATEST_HAZARDS = Path("outputs/latest_hazards.json")
DEFAULT_VIDEO_PATH = "data/raw_videos/master_video.mp4"


# --- Config accessors ------------------------------------------------------
# Functions, not constants, so a POST /api/config is picked up without a
# restart. Called outside the per-frame loop only.

def cfg_limits() -> dict:
    return CFG.get()["limits"]


def max_upload_mb() -> int:
    return int(cfg_limits()["max_upload_mb"])


def keep_sessions() -> int:
    return int(cfg_limits()["keep_sessions"])


def keep_uploads() -> int:
    return int(cfg_limits()["keep_uploads"])


def _load_session_config() -> dict:
    """Snapshot the whole config for one pipeline run.

    Read once at session start so the run is internally consistent, and so the
    exact configuration can be written into the session bundle. A hazard score
    is only reproducible if the weights that produced it are recorded with it.
    """
    c = CFG.get()
    det, trk, dep = c["detection"], c["tracking"], c["depth"]
    cam, geo, sev = c["camera"], c["geo"], c["severity"]
    return {
        "imgsz": int(det["imgsz"]),
        "detect_every_n": max(1, int(det["detect_every_n"])),
        "conf_floor": float(det["model_conf_floor"]),
        "class_conf": dict(det["class_conf"]),
        "max_area_ratio": dict(det["max_area_ratio"]),
        "default_max_area_ratio": float(det["default_max_area_ratio"]),

        "min_duration_s": float(trk["min_duration_s"]),
        "min_detections": int(trk["min_detections"]),
        "tracker_cfg": trk["tracker_cfg"],
        "max_area_samples": int(trk["max_area_samples"]),

        "depth_enabled": bool(dep["enabled"]),
        "depth_every_n": max(1, int(dep["every_n_frames"])),
        "depth_input_width": int(dep["input_width"]),

        "altitude_m": float(cam["altitude_m"]),
        "altitude_known": bool(cam["altitude_known"]),
        "hfov_deg": float(cam["hfov_deg"]),
        "pitch_deg": float(cam["pitch_deg"]),

        "geo_mode": geo["mode"],
        "sim_start_lat": float(geo["sim_start_lat"]),
        "sim_start_lon": float(geo["sim_start_lon"]),
        "sim_lat_per_frame": float(geo["sim_lat_per_frame"]),
        "sim_lon_per_frame": float(geo["sim_lon_per_frame"]),

        "severity_weights": dict(sev["weights"]),
        "class_base_risk": dict(sev["class_base_risk"]),
        "severity_bands": [tuple(b) for b in sev["bands"]],

        "max_frames_to_process": int(c["limits"]["max_frames_to_process"]),
    }


# ===========================================================================
# APP
# ===========================================================================

app = FastAPI(
    title="Hydro-Vision 3D AI Perception Engine",
    description="Live hazard detection, consolidation, spatial analysis "
                "and mission recording",
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
        "runs/yolov8m_final_dataset/weights/best.pt",
        "runs/yolov8s_5class/weights/best.pt",
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
    print(f"[WARNING] Model has {len(yolo_model.names)} classes, expected 5. "
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
# what makes a moderate-precision detector usable: false positives appear in
# one or two frames and never pass the persistence gate.
# ===========================================================================

class HazardRegistry:
    def __init__(self, session_id: str, evidence_dir: Path, cfg: dict):
        self.session_id = session_id
        self.evidence_dir = evidence_dir
        self.cfg = cfg
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
            # Cap the sample list: a long video with persistent tracks would
            # otherwise grow memory without bound.
            if len(h["area_px_samples"]) < self.cfg["max_area_samples"]:
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
            # Upscale tiny crops so they're legible in the UI.
            ch, cw = crop.shape[:2]
            if max(ch, cw) < 160:
                s = 160.0 / max(ch, cw)
                crop = cv2.resize(crop, (int(cw * s), int(ch * s)),
                                  interpolation=cv2.INTER_CUBIC)
            out = self.evidence_dir / f"{h['hazard_id']}.jpg"
            cv2.imwrite(str(out), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
            h["evidence_image"] = (f"/static/sessions/{self.session_id}"
                                   f"/evidence/{h['hazard_id']}.jpg")
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
        """Total tracks seen, including unconfirmed. Shows the consolidation
        ratio — the number behind our central claim."""
        with self._lock:
            return len(self._tracks)

    def confirmed(self) -> List[dict]:
        """Only hazards that survived the persistence gate."""
        with self._lock:
            tracks = list(self._tracks.values())

        out = []
        for h in tracks:
            # Duration, not frame count, is the primary gate: frame counts
            # scale with detect_every_n while real-world persistence does not.
            # A genuine hazard stays in view for over a second; a false
            # positive flickers for a few frames.
            duration = h["last_seen_s"] - h["first_seen_s"]
            if duration < self.cfg["min_duration_s"]:
                continue
            if h["detections_count"] < self.cfg["min_detections"]:
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
                "confidence": round(h["confidence_max"], 3),
                "detections_count": h["detections_count"],
                "first_frame": h["first_frame"],
                "last_frame": h["last_frame"],
                "first_seen_s": h["first_seen_s"],
                "last_seen_s": h["last_seen_s"],
                "duration_s": round(duration, 2),
                "bbox_px": h["bbox_px"],
                "area_px": round(area_px, 1),

                # Metric area needs verified intrinsics and altitude. Until
                # then this is honestly null and ranking uses pixels.
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
        """Severity from class risk, relative extent, persistence and
        confidence. Weights come from config so the score is reproducible
        and explainable — see docs/SEVERITY.md.

        Ranked on PIXEL area percentile because metric area isn't available
        yet, and flagged severity_basis 'relative' so nothing overstates
        itself.
        """
        if not records:
            return records

        areas = sorted(r["area_px"] for r in records)

        def pct(v: float) -> float:
            """Percentile within this session. Altitude-independent: raw size
            would rank the same hazard differently at different flight
            heights."""
            if len(areas) < 2:
                return 0.5
            below = sum(1 for a in areas if a < v)
            return below / (len(areas) - 1)

        max_dur = max((r["duration_s"] for r in records), default=0.0) or 1.0

        w = self.cfg["severity_weights"]
        risk = self.cfg["class_base_risk"]
        bands = self.cfg["severity_bands"]

        for r in records:
            base = risk.get(r["class_name"], 0.4)
            extent = pct(r["area_px"])
            persistence = min(1.0, r["duration_s"] / max_dur)
            conf = r["confidence_max"]

            score = (w["class_base"] * base
                     + w["extent"] * extent
                     + w["persistence"] * persistence
                     + w["confidence"] * conf)
            score = max(0.0, min(1.0, score))

            band = "LOW"
            for threshold, name in bands:
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
        self.cfg: dict = _load_session_config()
        self.session_id: Optional[str] = None
        self.video_path: str = DEFAULT_VIDEO_PATH
        self.out_dir: Optional[Path] = None
        self.registry: Optional[HazardRegistry] = None
        self.active: bool = False
        self.finished: bool = False
        self.frame_count: int = 0
        self.total_frames: int = 0
        self.frame_stride: int = 1
        self.fps: float = 30.0
        self.width: int = 0
        self.height: int = 0
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.achieved_fps: float = 0.0
        self.stage_status: Dict[str, str] = {}
        self.streaming: bool = False      # guards against 2 concurrent pipelines
        self.latest_frame_bytes: Optional[bytes] = None
        self.latest_frame_id: int = 0

    def new_session(self, video_path: str) -> str:
        with self.lock:
            sid = f"S-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            # Config is snapshotted here, once, so the whole run is consistent
            # and the bundle records exactly what produced its numbers.
            self.cfg = _load_session_config()
            self.session_id = sid
            self.video_path = video_path
            self.out_dir = OUTPUT_ROOT / sid
            self.out_dir.mkdir(parents=True, exist_ok=True)
            self.registry = HazardRegistry(sid, self.out_dir / "evidence",
                                           self.cfg)
            self.frame_count = 0
            self.finished = False
            self.started_at = datetime.now(timezone.utc).isoformat()
            self.finished_at = None
            self.achieved_fps = 0.0

            depth_on = self.cfg["depth_enabled"] and DEPTH_AVAILABLE
            geo_mode = self.cfg["geo_mode"]
            self.stage_status = {
                "ingest": "ok",
                "detect": "ok",
                "track": "ok",
                "consolidate": "ok",
                "depth": "ok" if depth_on else "skipped: disabled or unavailable",
                "area": ("ok" if self.cfg["altitude_known"]
                         else "skipped: altitude not set"),
                "geo": (f"ok: {geo_mode}" if geo_mode != "none"
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
            "frame_id": self.frame_count,
            "total_hazards": len(hz),
            "raw_tracks": self.registry.raw_track_count() if self.registry else 0,
            "total_area_m2": None,          # requires verified intrinsics
            "session_risk_band": risk,
            "session_risk_score": score,
            "alert_count": sum(1 for b in bands if b in ("HIGH", "CRITICAL")),
            "frames_processed": self.frame_count,
            "total_frames": self.total_frames,
            "frame_stride": self.frame_stride,
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
            "schema_version": SCHEMA_VERSION,
            "session": {
                "session_id": self.session_id,
                "video_path": self.video_path,
                "width": self.width,
                "height": self.height,
                "fps": self.fps,
                "total_frames": self.total_frames,
                "model_path": MODEL_PATH,
                "device": DEVICE,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "stage_status": self.stage_status,
            },
            # The full configuration that produced these numbers. Without it
            # a severity score cannot be independently reproduced.
            "config": self.cfg,
            "summary": self.summary(),
            "hazards": self.hazards(),
        }

    def geojson(self) -> dict:
        feats = []
        hz = self.hazards()
        for h in hz:
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
                "hazards_total": len(hz),
                "hazards_located": len(feats),
            },
        }

    def write_artifacts(self) -> None:
        """Mission record — USP-6. Survives a crash as a partial but valid
        bundle."""
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


def _publish_latest(out_dir: Optional[Path]) -> None:
    """Copy this session's outputs to a fixed 'latest' path.

    The per-session bundle is the permanent record; this is the convenience
    copy, replaced on every run, that the download button serves.
    """
    if not out_dir:
        return
    try:
        LATEST_VIDEO.parent.mkdir(parents=True, exist_ok=True)

        src_video = out_dir / "annotated.mp4"
        if src_video.exists():
            if LATEST_VIDEO.exists():
                LATEST_VIDEO.unlink()
            shutil.copy2(src_video, LATEST_VIDEO)
            size_mb = LATEST_VIDEO.stat().st_size / (1024 * 1024)
            print(f"[ARTIFACT] Latest annotated video -> {LATEST_VIDEO} "
                  f"({size_mb:.1f} MB)")

        src_json = out_dir / "hazards.json"
        if src_json.exists():
            if LATEST_HAZARDS.exists():
                LATEST_HAZARDS.unlink()
            shutil.copy2(src_json, LATEST_HAZARDS)
    except Exception as e:
        print(f"[ARTIFACT WARNING] Could not publish latest: {e}")


def _prune_old_sessions(keep: Optional[int] = None) -> None:
    """Keep only the N most recent session folders. Annotated video is large
    and this fills a disk quickly otherwise."""
    keep = keep_sessions() if keep is None else keep
    try:
        if not OUTPUT_ROOT.exists():
            return
        dirs = sorted(
            [d for d in OUTPUT_ROOT.iterdir() if d.is_dir()],
            key=lambda d: d.stat().st_mtime,
            reverse=True,
        )
        for old in dirs[keep:]:
            shutil.rmtree(old, ignore_errors=True)
            print(f"[CLEANUP] Removed old session: {old.name}")
    except Exception as e:
        print(f"[CLEANUP WARNING] {e}")


def _cleanup_old_uploads(keep: Optional[int] = None) -> None:
    """Uploads accumulate silently. Keep the most recent few."""
    keep = keep_uploads() if keep is None else keep
    try:
        p = Path("data/raw_videos")
        if not p.exists():
            return
        vids = sorted([f for f in p.glob("*")
                       if f.suffix.lower() in ALLOWED_EXTENSIONS],
                      key=lambda f: f.stat().st_mtime, reverse=True)
        for old in vids[keep:]:
            old.unlink(missing_ok=True)
            print(f"[CLEANUP] Removed old upload: {old.name}")
    except Exception as e:
        print(f"[CLEANUP WARNING] {e}")


def _transcode_h264(out_dir: Optional[Path]) -> None:
    """mp4v doesn't play in browsers. Transcode if ffmpeg exists; keep the
    raw file either way so the record is never lost."""
    if not out_dir:
        return
    raw = out_dir / "annotated_raw.mp4"
    final = out_dir / "annotated.mp4"

    if not raw.exists():
        if final.exists():
            _publish_latest(out_dir)
        return

    # Scale the timeout with video length: a fixed 30 minutes would abort on
    # a long recording and leave an unplayable file.
    timeout_s = max(600, int(SESSION.total_frames / 20) or 600)

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(raw), "-c:v", "libx264",
             "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
             str(final)],
            check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=timeout_s)
        raw.unlink(missing_ok=True)
        print(f"[ARTIFACT] Annotated video -> {final}")
    except FileNotFoundError:
        shutil.move(str(raw), str(final))
        print("[ARTIFACT] ffmpeg not found; saved mp4v (may not play in browser).")
    except Exception as e:
        shutil.move(str(raw), str(final))
        print(f"[ARTIFACT] Transcode failed ({e}); kept raw file.")

    _publish_latest(out_dir)


def generate_mjpeg_stream():
    """Synchronous generator: FastAPI runs it in a thread, so the event loop
    stays responsive for WebSockets and REST."""
    global geo_projector

    # If another thread is actively running the perception pipeline,
    # stream the active frame buffer so multiple tabs/refreshes don't get locked out.
    if SESSION.streaming:
        last_sent_id = -1
        try:
            while SESSION.streaming:
                if SESSION.latest_frame_bytes is not None and SESSION.latest_frame_id != last_sent_id:
                    last_sent_id = SESSION.latest_frame_id
                    yield SESSION.latest_frame_bytes
                time.sleep(0.02)
        except (GeneratorExit, Exception):
            pass
        # If pipeline finished while we were waiting, fall through or return
        if not SESSION.active:
            msg = ("MISSION COMPLETE - REVIEW RESULTS BELOW"
                   if SESSION.finished
                   else "SYSTEM STANDBY - UPLOAD VIDEO TO START AI PIPELINE")
            yield _wrap(_standby_frame(msg))
            return

    cap = None
    writer = None
    current_path = None
    last_boxes: List[dict] = []
    last_depth_colormap = None
    last_depth_array = None
    t_start = time.time()

    # Config is pulled into locals when a video opens. Initialised here so the
    # standby path never touches an undefined name.
    C = SESSION.cfg or _load_session_config()
    depth_every_n = C["depth_every_n"]
    detect_every_n = C["detect_every_n"]
    imgsz = C["imgsz"]
    conf_floor = C["conf_floor"]
    tracker_cfg = C["tracker_cfg"]
    class_conf = C["class_conf"]
    max_area_ratio = C["max_area_ratio"]
    default_max_ratio = C["default_max_area_ratio"]
    geo_mode = C["geo_mode"]
    sim_lat, sim_lon = C["sim_start_lat"], C["sim_start_lon"]
    sim_dlat, sim_dlon = C["sim_lat_per_frame"], C["sim_lon_per_frame"]
    altitude_m = C["altitude_m"]
    pitch_deg = C["pitch_deg"]
    depth_enabled = C["depth_enabled"] and DEPTH_AVAILABLE
    depth_input_width = C["depth_input_width"]

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
                msg = ("MISSION COMPLETE - REVIEW RESULTS BELOW"
                       if SESSION.finished
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

                # Pull config into locals for this run. Dict lookups in the
                # per-frame loop are wasteful, and this guarantees the run
                # uses one consistent set of values throughout.
                C = SESSION.cfg
                depth_every_n = C["depth_every_n"]
                detect_every_n = C["detect_every_n"]
                imgsz = C["imgsz"]
                conf_floor = C["conf_floor"]
                tracker_cfg = C["tracker_cfg"]
                class_conf = C["class_conf"]
                max_area_ratio = C["max_area_ratio"]
                default_max_ratio = C["default_max_area_ratio"]
                geo_mode = C["geo_mode"]
                sim_lat, sim_lon = C["sim_start_lat"], C["sim_start_lon"]
                sim_dlat, sim_dlon = C["sim_lat_per_frame"], C["sim_lon_per_frame"]
                altitude_m = C["altitude_m"]
                pitch_deg = C["pitch_deg"]
                depth_enabled = C["depth_enabled"] and DEPTH_AVAILABLE
                depth_input_width = C["depth_input_width"]

                # Long videos: sample frames so a 1-hour upload doesn't take
                # 3 hours. The annotated output still covers the whole video,
                # just at a lower effective frame rate.
                SESSION.frame_stride = max(
                    1, int(np.ceil(SESSION.total_frames /
                                   C["max_frames_to_process"])))
                if SESSION.frame_stride > 1:
                    print(f"[PIPELINE] Long video ({SESSION.total_frames} frames): "
                          f"processing every {SESSION.frame_stride}th frame")

                # Depth cache must not carry over between videos.
                last_depth_colormap = None
                last_depth_array = None
                last_boxes = []

                # Intrinsics must follow the ACTUAL video, not a hardcoded 1080p.
                geo_projector = GeoProjector(
                    image_width=SESSION.width or 1920,
                    image_height=SESSION.height or 1080,
                    hfov_deg=C["hfov_deg"],
                )

                # Reset tracker so IDs don't leak between videos.
                try:
                    yolo_model.predictor = None
                except Exception:
                    pass

                # Mission record writer — same pass, no second decode.
                # Output fps is divided by the stride so the saved video plays
                # at real-time speed rather than fast-forward.
                if SESSION.out_dir:
                    try:
                        out_fps = max(1.0, SESSION.fps /
                                      max(1, SESSION.frame_stride))
                        writer = cv2.VideoWriter(
                            str(SESSION.out_dir / "annotated_raw.mp4"),
                            cv2.VideoWriter_fourcc(*"mp4v"),
                            out_fps,
                            (SESSION.width, SESSION.height),
                        )
                        if not writer.isOpened():
                            print("[WARNING] VideoWriter failed to open; "
                                  "live view continues without recording.")
                            SESSION.stage_status["artifact"] = \
                                "failed: writer unavailable"
                            writer = None
                    except Exception as e:
                        print(f"[WARNING] VideoWriter error: {e}")
                        writer = None

                print(f"[PIPELINE] {SESSION.session_id} | "
                      f"{SESSION.width}x{SESSION.height} @ {SESSION.fps:.1f}fps "
                      f"| {SESSION.total_frames} frames")

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

            # Skip frames on long videos. Counted but not processed, so the
            # progress percentage still reflects real position in the file.
            if (SESSION.frame_stride > 1 and
                    (SESSION.frame_count % SESSION.frame_stride) != 0):
                SESSION.frame_count += 1
                continue

            SESSION.frame_count += 1
            fid = SESSION.frame_count
            t_s = fid / SESSION.fps if SESSION.fps else 0.0
            annotated = frame.copy()
            fh, fw = frame.shape[:2]

            # A frame whose size differs from what the writer was opened with
            # is silently discarded by OpenCV. Catch it rather than producing
            # an empty video file.
            if writer is not None and (fw != SESSION.width or fh != SESSION.height):
                print(f"[ARTIFACT WARNING] Frame size {fw}x{fh} != writer "
                      f"{SESSION.width}x{SESSION.height}; recording disabled.")
                SESSION.stage_status["artifact"] = "failed: frame size mismatch"
                writer.release(); writer = None

            # ---------------- DEPTH (slow cadence, own budget) ----------------
            # Depth Anything V2 was ~95% of frame time at full resolution.
            # Depth changes slowly across frames; detection does not. So it
            # runs on its own schedule, at the model's native input width,
            # and other frames reuse the cached map.
            if depth_enabled and (fid % depth_every_n == 1
                                  or last_depth_array is None):
                try:
                    dh = max(1, int(fh * (depth_input_width / float(fw))))
                    small = cv2.resize(frame, (depth_input_width, dh))
                    pil = Image.fromarray(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
                    depth_small, _ = depth_engine.predict_depth(pil)
                    if depth_small is None:
                        raise RuntimeError("depth inference returned nothing")
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
            if fid % detect_every_n == 1 or detect_every_n == 1:
                try:
                    if DEVICE == "cuda":
                        with torch.amp.autocast("cuda"):
                            results = yolo_model.track(
                                source=frame, conf=conf_floor, imgsz=imgsz,
                                device=DEVICE, persist=True, tracker=tracker_cfg,
                                verbose=False)[0]
                    else:
                        results = yolo_model.track(
                            source=frame, conf=conf_floor, imgsz=imgsz,
                            device=DEVICE, persist=True, tracker=tracker_cfg,
                            verbose=False)[0]

                    # Geolocation. A synthetic path is generated only when
                    # explicitly configured, and every hazard from it carries
                    # geo_source "synthetic" so the UI can badge it.
                    if geo_mode == "synthetic":
                        cur_lat = sim_lat + fid * sim_dlat
                        cur_lon = sim_lon + fid * sim_dlon
                        geo_source = "synthetic"
                    else:
                        cur_lat = cur_lon = None
                        geo_source = "none"

                    boxes = results.boxes
                    current_boxes = []

                    if boxes is not None and len(boxes) > 0:
                        for box in boxes:
                            # No track ID = untracked. Drop it rather than
                            # merging unrelated detections into a phantom
                            # hazard.
                            if box.id is None:
                                continue

                            track_id = int(box.id[0])
                            cls_id = int(box.cls[0])
                            class_name = yolo_model.names[cls_id]
                            conf = float(box.conf[0])

                            # PER-CLASS threshold. Recall-starved classes get
                            # a lower bar; the persistence gate removes the
                            # extra noise that admits.
                            if conf < class_conf.get(class_name,
                                                     DEFAULT_CLASS_CONF):
                                continue

                            coords = box.xyxy[0].cpu().numpy().astype(int).tolist()
                            x1, y1, x2, y2 = coords

                            area_px = max(0, x2 - x1) * max(0, y2 - y1)
                            if area_px <= 0:
                                continue

                            # Per-class area ceiling. A flooded street can
                            # legitimately fill an aerial frame; an open
                            # manhole never does.
                            _max_ratio = max_area_ratio.get(class_name,
                                                            default_max_ratio)
                            if area_px > _max_ratio * (fw * fh):
                                continue

                            lat = lon = None
                            if geo_source != "none" and geo_projector is not None:
                                try:
                                    gps = geo_projector.pixel_to_gps(
                                        pixel_x=(x1 + x2) // 2,
                                        pixel_y=(y1 + y2) // 2,
                                        drone_lat=cur_lat, drone_lon=cur_lon,
                                        altitude_m=altitude_m,
                                        pitch_deg=pitch_deg,
                                    )
                                    lat = round(gps["latitude"], 7)
                                    lon = round(gps["longitude"], 7)
                                except Exception as e:
                                    SESSION.stage_status["geo"] = \
                                        f"failed: {type(e).__name__}"

                            depth_index = (
                                compute_relative_depth_index(depth_array, coords)
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
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX,
                                              0.5, 1)
                ly = max(th + 4, y1 - 6)
                cv2.rectangle(annotated, (x1, ly - th - 4), (x1 + tw + 6, ly + 2),
                              (0, 0, 0), -1)
                cv2.putText(annotated, label, (x1 + 3, ly - 2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, colour, 1)
                cv2.rectangle(depth_viz, (x1, y1), (x2, y2), (255, 255, 255), 1)

            n_conf = len(SESSION.hazards())
            hud = (f"F{fid}  t={t_s:5.1f}s  hazards={n_conf}  "
                   f"{SESSION.achieved_fps:.1f}fps")
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
            label_r = ("2. RELATIVE DEPTH" if depth_enabled
                       else "2. DEPTH UNAVAILABLE")
            cv2.putText(right, label_r, (12, 24),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 2)

            composite = np.hstack((left, right))
            ok, buf = cv2.imencode(".jpg", composite,
                                   [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if ok:
                wrapped = _wrap(buf.tobytes())
                SESSION.latest_frame_bytes = wrapped
                SESSION.latest_frame_id = SESSION.frame_count
                yield wrapped

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
# MUNICIPAL ACCESS CONTROL & USER ROLES (RBAC)
# ===========================================================================

MUNICIPAL_USERS = {
    "admin": {
        "id": "USR-ADM-01",
        "name": "Dr. Rajesh Rao",
        "email": "chief.engineer@elcia.gov.in",
        "role": "admin",
        "designation": "Chief Municipal Engineer",
        "department": "Smart Infrastructure & Drone Operations",
        "ward": "All Wards",
        "permissions": [
            "drone:stream_control",
            "drone:upload_video",
            "config:modify",
            "hazard:assign_contractor",
            "hazard:audit_signoff",
            "budget:approve",
            "reports:export",
        ],
    },
    "employee": {
        "id": "USR-EMP-04",
        "name": "Suresh Kumar",
        "email": "suresh.inspector@elcia.gov.in",
        "role": "employee",
        "designation": "Ward 1 Field Operations Inspector",
        "department": "Civic Remediation Division",
        "ward": "Ward 1 (North Sector)",
        "permissions": [
            "hazard:view",
            "hazard:upload_proof",
            "hazard:mark_progress",
            "reports:view",
        ],
    },
}


def require_admin_role(x_user_role: Optional[str] = None):
    if x_user_role and x_user_role.strip().lower() == "employee":
        raise HTTPException(
            status_code=403,
            detail="Access Denied: Municipal Commissioner / Administrator "
                   "authorization required."
        )


# ===========================================================================
# ROUTES
# ===========================================================================

@app.get("/api/auth/roles")
def get_municipal_roles():
    """Available municipal deployment profiles and permissions."""
    return {"status": "ok", "users": MUNICIPAL_USERS}


@app.get("/api/config")
def get_config():
    return CFG.get()


@app.post("/api/config")
async def set_config(patch: dict, x_user_role: Optional[str] = Header(None)):
    require_admin_role(x_user_role)
    return {"status": "updated", "config": CFG.update(patch),
            "note": "Applies to the next processing run."}


@app.post("/api/config/reset")
def reset_config(x_user_role: Optional[str] = Header(None)):
    require_admin_role(x_user_role)
    return {"status": "reset", "config": CFG.reset()}


@app.get("/api/stream_video")
@app.get("/stream")
async def api_stream_video():
    return StreamingResponse(
        generate_mjpeg_stream(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


def _safe_name(filename: str) -> str:
    """Never trust a client filename. Strip path components and unsafe chars —
    a name like ../../etc/x.mp4 would otherwise write outside the folder."""
    base = os.path.basename(filename or "upload")
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:80]
    stem, ext = os.path.splitext(base)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        ext = ".mp4"
    return f"{stem or 'video'}_{_uuid.uuid4().hex[:8]}{ext}"


@app.post("/api/upload-video")
async def upload_video(file: UploadFile = File(...),
                       x_user_role: Optional[str] = Header(None)):
    require_admin_role(x_user_role)

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return {"status": "error",
                "message": f"Unsupported format '{ext}'. Allowed: "
                           + ", ".join(sorted(ALLOWED_EXTENSIONS))}

    os.makedirs("data/raw_videos", exist_ok=True)
    dest = os.path.join("data/raw_videos", _safe_name(file.filename))

    # Stream to disk with a hard size cap so a huge upload cannot fill the disk.
    limit_mb = max_upload_mb()
    limit = limit_mb * 1024 * 1024
    written = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > limit:
                    out.close()
                    os.remove(dest)
                    return {"status": "error",
                            "message": f"File exceeds {limit_mb} MB limit."}
                out.write(chunk)
    except Exception as e:
        if os.path.exists(dest):
            os.remove(dest)
        return {"status": "error", "message": f"Upload failed: {e}"}

    # Validate it actually decodes before accepting it. An extension check
    # alone would let a renamed or corrupt file fail deep in the pipeline.
    probe = cv2.VideoCapture(dest)
    if not probe.isOpened():
        probe.release(); os.remove(dest)
        return {"status": "error",
                "message": "File could not be decoded. It may be corrupt or "
                           "use an unsupported codec."}
    w = int(probe.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    h = int(probe.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    fps = probe.get(cv2.CAP_PROP_FPS) or 30.0
    nframes = int(probe.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    probe.release()

    if w <= 0 or h <= 0:
        os.remove(dest)
        return {"status": "error", "message": "Video has no readable dimensions."}

    duration = nframes / fps if fps else 0

    SESSION.active = False
    time.sleep(0.4)                       # let a running pass wind down
    _cleanup_old_uploads()
    _prune_old_sessions()
    sid = SESSION.new_session(dest)
    SESSION.active = True

    return {
        "status": "success", "session_id": sid, "path": dest,
        "resolution": f"{w}x{h}", "fps": round(fps, 1),
        "frames": nframes, "duration_s": round(duration, 1),
        "size_mb": round(written / (1024 * 1024), 1),
        "note": ("Long video — frames will be sampled to keep processing "
                 "within time limits." if duration > MAX_DURATION_S else None),
    }


@app.get("/api/stream/start")
@app.post("/api/stream/start")
def start_stream():
    # Always a fresh session: replaying without resetting the registry made
    # detection counts accumulate across runs while frame_count restarted.
    if SESSION.streaming:
        return {"status": "already_running", "session_id": SESSION.session_id}
    _prune_old_sessions()
    SESSION.new_session(SESSION.video_path)
    SESSION.active = True
    return {"status": "success", "session_id": SESSION.session_id}


@app.get("/api/stream/stop")
@app.post("/api/stream/stop")
def stop_stream():
    SESSION.active = False
    SESSION.write_artifacts()
    return {"status": "success", "message": "Pipeline stopped; artifacts written"}


@app.get("/api/latest-video")
def get_latest_video():
    """The most recent annotated video, replaced on every run."""
    if not LATEST_VIDEO.exists():
        return {"error": "no annotated video yet — run the pipeline first"}
    return FileResponse(str(LATEST_VIDEO), media_type="video/mp4",
                        filename=DOWNLOAD_NAME)


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
    hazard_id: Optional[str] = None
    proof_image: Optional[str] = None
    inspector: Optional[str] = None


@app.post("/api/hazards/{hazard_id}/status")
@app.post("/api/hazards/status")
async def update_hazard_status(
    payload: StatusUpdate,
    hazard_id: Optional[str] = None,
    x_user_role: Optional[str] = Header(None),
):
    hid = hazard_id or payload.hazard_id
    if not hid:
        return {"status": "error", "message": "hazard_id required"}

    valid = ("OPEN", "IN_PROGRESS", "PENDING_AUDIT", "RESOLVED",
             "VERIFIED_CLOSED")
    if payload.status not in valid:
        return {"status": "error",
                "message": f"invalid status: {payload.status}. "
                           f"Must be one of {valid}"}

    # Field workers submit proof for PENDING_AUDIT; final closure requires
    # administrator sign-off.
    if (payload.status == "VERIFIED_CLOSED" and x_user_role
            and x_user_role.strip().lower() == "employee"):
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Field employees cannot unilaterally mark work "
                   "orders as VERIFIED_CLOSED. Submit proof for PENDING_AUDIT "
                   "for Commissioner sign-off."
        )

    ok = SESSION.registry.set_status(hid, payload.status) if SESSION.registry else False
    if ok:
        SESSION.write_artifacts()
    return {"status": "success" if ok else "not_found",
            "hazard_id": hid, "new_status": payload.status}


@app.get("/api/telemetry")
def get_telemetry():
    return {"status": "active", "detections": SESSION.hazards()}


# --------------------------- RECORDING ---------------------------
# Recording is AUTOMATIC: the pipeline writes the annotated video during its
# single pass over the frames, and publishes it to
# outputs/latest_annotated.mp4 when the run completes.
#
# start/stop are kept as no-ops so the existing UI keeps working rather than
# receiving a 404.

@app.get("/api/record/start")
@app.post("/api/record/start")
def start_on_demand_recording():
    return {
        "status": "started",
        "automatic": True,
        "message": "Recording is automatic — the annotated video is written "
                   "while the pipeline runs.",
        "session_id": SESSION.session_id,
    }


@app.get("/api/record/stop")
@app.post("/api/record/stop")
def stop_on_demand_recording():
    ready = LATEST_VIDEO.exists()
    return {
        "status": "stopped",
        "automatic": True,
        "file_ready": ready,
        "message": ("Annotated video ready for download." if ready else
                    "No completed run yet — the video is written when "
                    "processing finishes."),
    }


@app.get("/api/record/status")
def recording_status():
    """Lets the UI show whether a download is available."""
    ready = LATEST_VIDEO.exists()
    return {
        "automatic": True,
        "recording": SESSION.streaming,
        "file_ready": ready,
        "size_mb": (round(LATEST_VIDEO.stat().st_size / (1024 * 1024), 1)
                    if ready else None),
        "session_id": SESSION.session_id,
    }


@app.get("/api/record/download")
def download_on_demand_recording():
    """Serves the most recent annotated video. Replaced on every run."""
    if not LATEST_VIDEO.exists():
        return {"error": "No annotated video yet. Upload a video and let "
                         "the pipeline finish."}
    return FileResponse(str(LATEST_VIDEO), media_type="video/mp4",
                        filename=DOWNLOAD_NAME)


# --------------------------- WebSockets ---------------------------
# Both endpoints send the SAME shape. Sending different structures is why two
# parts of the UI once disagreed about the hazard count.

async def _push_loop(ws: WebSocket, interval: float, label: str):
    await ws.accept()
    print(f"[WS] {label} connected")
    try:
        while True:
            if ws.client_state.name != "CONNECTED":
                break

            # Listen for client-sent control packets (e.g. AI Sensitivity Gate slider)
            try:
                raw_msg = await asyncio.wait_for(ws.receive_text(), timeout=0.01)
                data = json.loads(raw_msg)
                if data.get("type") == "CONFIDENCE_THRESHOLD":
                    val = float(data.get("value", 0.20))
                    if SESSION.cfg:
                        SESSION.cfg["conf_floor"] = val
                    print(f"[WS] Dynamic AI Sensitivity Gate set to {val}")
            except (asyncio.TimeoutError, json.JSONDecodeError, ValueError, AttributeError):
                pass

            await ws.send_json({
                "schema_version": SCHEMA_VERSION,
                "frame_id": SESSION.frame_count,
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