"""
HYDRO-VISION-3D — Runtime configuration
========================================
Every value that might need changing on deployment day lives here, in one
JSON file, editable through the API without restarting the backend.

The problem this solves: on presentation day we receive footage with unknown
altitude, camera and hazard scale. Editing constants in main.py and
restarting under time pressure is how demos get broken. Instead the operator
sets the values, the pipeline picks them up on the next run, and every
derived number (GSD, area, severity) recomputes correctly.

Load order:
  1. DEFAULTS below
  2. config/runtime.json if present (overrides defaults)
  3. POST /api/config at runtime (overrides both, persists to the file)
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any, Dict

CONFIG_PATH = Path("config/runtime.json")


# ---------------------------------------------------------------------------
# DEFAULTS
#
# Each value carries the reasoning for its setting. Anything marked
# [DAY-OF] is expected to change when real footage arrives.
# ---------------------------------------------------------------------------

DEFAULTS: Dict[str, Any] = {

    # ---- CAMERA & PLATFORM -------------------------------------------
    # [DAY-OF] These drive every metric measurement. Wrong altitude means
    # wrong area, because area scales with altitude squared.
    "camera": {
        "altitude_m": 5.5,          # 15-20 ft as stated by organisers
        "altitude_known": True,     # False -> area_m2 is null, not guessed
        "hfov_deg": 84.0,           # typical consumer drone wide lens
        "sensor_width_mm": 6.4,
        "focal_length_mm": 4.0,
        "pitch_deg": -90.0,         # -90 = straight down (nadir)
        "nadir_tolerance_deg": 15.0,  # beyond this, single-GSD area is invalid
        "intrinsics_source": "hfov",  # "hfov" | "sensor" | "matrix"
    },

    # ---- DETECTION ---------------------------------------------------
    "detection": {
        "imgsz": 640,               # must match training resolution
        "detect_every_n": 1,        # 1 = every frame, best for tracking
        "model_conf_floor": 0.05,   # model runs wide; per-class filters below

        # [DAY-OF] Derived from the F1-confidence curves of the trained
        # model. Raise a class to cut false positives, lower it to catch
        # more. damaged_footpath is disabled: 0 training instances.
        "class_conf": {
            "open_manhole":      0.50,
            "drainage_overflow": 0.40,
            "potholes":          0.40,
            "waterlogging_area": 0.35,
            "damaged_footpath":  0.99,
        },

        # [DAY-OF] Fraction of the frame a detection may occupy before it
        # is rejected as implausible. At 5m altitude hazards fill much more
        # of the frame than at 25m, so these are set generously.
        "max_area_ratio": {
            "waterlogging_area": 0.95,
            "drainage_overflow": 0.90,
            "damaged_footpath":  0.80,
            "potholes":          0.55,
            "open_manhole":      0.45,
        },
        "default_max_area_ratio": 0.60,
    },

    # ---- TRACKING & CONSOLIDATION ------------------------------------
    "tracking": {
        "tracker_cfg": "bytetrack.yaml",

        # A genuine hazard stays in view; a false positive flickers.
        # Duration is used rather than a frame count because frame counts
        # scale with detect_every_n while real-world persistence does not.
        "min_duration_s": 1.5,
        "min_detections": 8,

        # [DAY-OF] At low altitude objects sweep through frame faster, so
        # a track may need to survive longer gaps.
        "track_buffer": 30,
        "max_area_samples": 500,    # caps per-track memory on long videos
    },

    # ---- DEPTH -------------------------------------------------------
    "depth": {
        "enabled": True,
        "every_n_frames": 15,       # depth changes slowly; detection doesn't
        "input_width": 518,         # Depth Anything's native size
    },

    # ---- GEOLOCATION -------------------------------------------------
    # [DAY-OF] If the organisers' video carries telemetry, set mode to
    # "telemetry". If not, "manual_anchor" or "none". "synthetic" produces
    # a simulated flight path and every hazard is badged as such.
    "geo": {
        "mode": "synthetic",        # telemetry | manual_anchor | synthetic | none
        "sim_start_lat": 22.30720,
        "sim_start_lon": 73.18200,
        "sim_lat_per_frame": 0.000005,
        "sim_lon_per_frame": 0.000006,
    },

    # ---- SEVERITY ----------------------------------------------------
    # Weights sum to 1.0. Published so the score is reproducible and
    # explainable rather than a black box.
    "severity": {
        "weights": {
            "class_base":  0.45,    # inherent danger of the hazard type
            "extent":      0.25,    # size relative to others in this session
            "persistence": 0.15,    # how long it stayed in view
            "confidence":  0.15,    # detector certainty
        },
        # Base risk per class, 0-1. open_manhole is 1.0 because it is an
        # immediate fall hazard to pedestrians and two-wheelers.
        "class_base_risk": {
            "open_manhole":      1.00,
            "waterlogging_area": 0.70,
            "drainage_overflow": 0.65,
            "potholes":          0.55,
            "damaged_footpath":  0.40,
        },
        # Band boundaries on the 0-1 score.
        "bands": [
            [0.00, "LOW"],
            [0.35, "MODERATE"],
            [0.60, "HIGH"],
            [0.82, "CRITICAL"],
        ],
    },

    # ---- LIMITS ------------------------------------------------------
    "limits": {
        "max_upload_mb": 500,
        "max_frames_to_process": 9000,
        "keep_sessions": 3,
        "keep_uploads": 3,
    },
}


# ---------------------------------------------------------------------------
# Loading and access
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_config: Dict[str, Any] = {}


def _deep_merge(base: dict, override: dict) -> dict:
    """Override wins, but a missing key falls back to the default rather
    than disappearing. Prevents a partial config file from breaking things."""
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load() -> Dict[str, Any]:
    """Read config/runtime.json over the defaults. Safe to call repeatedly."""
    global _config
    with _lock:
        cfg = json.loads(json.dumps(DEFAULTS))   # deep copy
        if CONFIG_PATH.exists():
            try:
                user = json.loads(CONFIG_PATH.read_text())
                cfg = _deep_merge(cfg, user)
                print(f"[CONFIG] Loaded overrides from {CONFIG_PATH}")
            except Exception as e:
                print(f"[CONFIG WARNING] {CONFIG_PATH} unreadable ({e}); "
                      f"using defaults.")
        _config = cfg
        return _config


def get() -> Dict[str, Any]:
    """Current config. Loads on first use."""
    if not _config:
        return load()
    return _config


def update(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Apply a partial update and persist it. Takes effect on the next run."""
    global _config
    with _lock:
        _config = _deep_merge(get(), patch)
        CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_PATH.write_text(json.dumps(_config, indent=2))
        print(f"[CONFIG] Updated and saved to {CONFIG_PATH}")
        return _config


def reset() -> Dict[str, Any]:
    """Back to defaults. Useful if day-of tuning goes wrong."""
    global _config
    with _lock:
        _config = json.loads(json.dumps(DEFAULTS))
        if CONFIG_PATH.exists():
            CONFIG_PATH.unlink()
        print("[CONFIG] Reset to defaults")
        return _config


# ---------------------------------------------------------------------------
# Derived values — the maths, in one place, so it can be explained
# ---------------------------------------------------------------------------

def compute_gsd(image_width_px: int) -> tuple[float | None, str]:
    """Ground Sample Distance in metres per pixel.

        GSD = (altitude * sensor_width) / (focal_length * image_width)

    Returns (gsd, reason). gsd is None when it cannot be computed honestly,
    and reason says why — that string is surfaced in the UI rather than a
    fabricated number.
    """
    cam = get()["camera"]

    if not cam.get("altitude_known", False):
        return None, "no_altitude"

    alt = float(cam["altitude_m"])
    if alt <= 0:
        return None, "invalid_altitude"

    # Single-GSD area is only valid near nadir. At an oblique angle the
    # ground scale varies across the frame and one number is meaningless.
    pitch = float(cam.get("pitch_deg", -90.0))
    off_nadir = abs(abs(pitch) - 90.0)
    if off_nadir > float(cam.get("nadir_tolerance_deg", 15.0)):
        return None, "oblique_view"

    if image_width_px <= 0:
        return None, "no_image_width"

    sensor_mm = float(cam["sensor_width_mm"])
    focal_mm = float(cam["focal_length_mm"])
    if focal_mm <= 0:
        return None, "invalid_focal_length"

    gsd = (alt * (sensor_mm / 1000.0)) / ((focal_mm / 1000.0) * image_width_px)
    return gsd, "ok"


def pixel_area_to_m2(area_px: float, image_width_px: int) -> tuple[float | None, float | None, str]:
    """Convert pixel area to ground area.

        area_m2 = area_px * GSD^2

    Returns (area_m2, gsd, reason). None means we could not compute it, and
    the caller must render a dash rather than a zero.
    """
    gsd, reason = compute_gsd(image_width_px)
    if gsd is None:
        return None, None, reason
    return area_px * (gsd ** 2), gsd, "ok"


# Load once at import so the first request is already configured.
load()