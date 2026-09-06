"""
HYDRO-VISION-3D — Hazard record schema.

THE SINGLE SOURCE OF TRUTH for what one hazard is.

Core rule: if we cannot compute a value, it is None. Never a placeholder,
never a fallback constant. None renders as an em-dash in the UI.

Any change here must be mirrored in frontend/src/lib/schema.js and must bump
SCHEMA_VERSION.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

SCHEMA_VERSION = "2.0.0"


# ---------------------------------------------------------------------------
# Taxonomy — must match data.yaml exactly. Order is fixed. Do not reorder.
# ---------------------------------------------------------------------------

CLASS_NAMES: dict[int, str] = {
    0: "damaged_footpath",
    1: "drainage_overflow",
    2: "open_manhole",
    3: "potholes",
    4: "waterlogging_area",
}

CLASS_IDS: dict[str, int] = {v: k for k, v in CLASS_NAMES.items()}


# ---------------------------------------------------------------------------
# Enums — every "why we couldn't compute this" is machine-readable
# ---------------------------------------------------------------------------

class GeoSource(str, Enum):
    TELEMETRY = "telemetry"          # real SRT/EXIF flight log
    MANUAL_ANCHOR = "manual_anchor"  # operator matched two map points
    SYNTHETIC = "synthetic"          # test fixture — MUST be badged in the UI
    NONE = "none"                    # no position available; lat/lon stay None


class AreaReason(str, Enum):
    OK = "ok"
    NO_ALTITUDE = "no_altitude"
    OBLIQUE_VIEW = "oblique_view"    # single GSD invalid for a tilted camera
    NO_INTRINSICS = "no_intrinsics"


class SeverityBand(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class SeverityBasis(str, Enum):
    METRIC = "metric"      # ranked on real m²
    RELATIVE = "relative"  # ranked on pixel-area percentile within this session


class HazardStatus(str, Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"


class StageState(str, Enum):
    OK = "ok"
    FAILED = "failed"
    SKIPPED = "skipped"
    NOT_RUN = "not_run"


# ---------------------------------------------------------------------------
# Hazard — one physical hazard, consolidated from N frames of one track
# ---------------------------------------------------------------------------

@dataclass
class Hazard:
    # --- identity ---
    hazard_id: str
    track_id: int
    class_id: int
    class_name: str
    derived: bool = False          # True only for backend-derived types
                                   # (e.g. pothole ∩ waterlogging). Never a
                                   # frontend guess.

    # --- detection evidence (USP-1) ---
    confidence_max: float = 0.0    # peak across the track, NOT per-frame
    detections_count: int = 0
    first_frame: int = 0
    last_frame: int = 0
    first_seen_s: float = 0.0
    last_seen_s: float = 0.0
    confirmed: bool = False        # passed the N-frame persistence gate

    # --- pixel geometry (always available) ---
    bbox_px: list[float] = field(default_factory=list)   # [x1,y1,x2,y2]
    area_px: float = 0.0                                  # median across track

    # --- metric geometry (USP-2) — None when we cannot compute it ---
    area_m2: Optional[float] = None
    gsd_m_per_px: Optional[float] = None
    area_reason: str = AreaReason.NO_INTRINSICS.value

    # --- geolocation (USP-3) — None when we cannot compute it ---
    lat: Optional[float] = None
    lon: Optional[float] = None
    geo_source: str = GeoSource.NONE.value
    geo_error_m: Optional[float] = None
    zone: Optional[str] = None

    # --- depth (unitless index, never centimetres) ---
    relative_depth_index: Optional[float] = None   # 0..1

    # --- risk ---
    severity_score: Optional[float] = None
    severity_band: Optional[str] = None
    severity_basis: Optional[str] = None
    priority_score: Optional[int] = None

    # --- workflow ---
    status: str = HazardStatus.OPEN.value
    evidence_image: Optional[str] = None   # relative path inside the session dir

    # ------------------------------------------------------------------
    @staticmethod
    def new_id(session_id: str, track_id: int) -> str:
        """Stable, readable, unique per (session, track)."""
        h = hashlib.sha1(f"{session_id}:{track_id}".encode()).hexdigest()[:6]
        return f"HAZ-{h.upper()}"

    @property
    def duration_s(self) -> float:
        return round(max(0.0, self.last_seen_s - self.first_seen_s), 2)

    @property
    def has_location(self) -> bool:
        return self.lat is not None and self.lon is not None

    @property
    def has_metric_area(self) -> bool:
        return self.area_m2 is not None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["duration_s"] = self.duration_s
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Hazard":
        d = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**d)

    def to_geojson_feature(self) -> Optional[dict[str, Any]]:
        """None when there is no position. We never invent coordinates."""
        if not self.has_location:
            return None
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [self.lon, self.lat]},
            "properties": {
                "hazard_id": self.hazard_id,
                "class_name": self.class_name,
                "confidence": round(self.confidence_max, 3),
                "area_m2": self.area_m2,
                "severity_band": self.severity_band,
                "priority_score": self.priority_score,
                "detections_count": self.detections_count,
                "duration_s": self.duration_s,
                "geo_source": self.geo_source,
                "status": self.status,
            },
        }


# ---------------------------------------------------------------------------
# Source metadata — what we detected about the input, before processing
# ---------------------------------------------------------------------------

@dataclass
class SourceInfo:
    path: str
    filename: str
    sha256: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    frame_count: Optional[int] = None
    duration_s: Optional[float] = None
    codec: Optional[str] = None
    rotation: Optional[int] = None
    has_telemetry: bool = False
    telemetry_source: Optional[str] = None

    @property
    def aspect_ratio(self) -> Optional[float]:
        if self.width and self.height:
            return round(self.width / self.height, 4)
        return None


# ---------------------------------------------------------------------------
# Session — one run of the pipeline over one source
# ---------------------------------------------------------------------------

@dataclass
class SessionContext:
    session_id: str
    schema_version: str = SCHEMA_VERSION
    created_at: str = ""
    mode: str = "recorded"                 # "recorded" | "live"

    source: Optional[SourceInfo] = None

    model_path: Optional[str] = None
    model_sha256: Optional[str] = None
    camera_profile: Optional[str] = None
    altitude_m: Optional[float] = None     # session parameter, NOT a constant
    conf_threshold: Optional[float] = None
    min_frames_to_confirm: Optional[int] = None

    # fail-soft reporting — drives the UI health strip (USP-5)
    stage_status: dict[str, str] = field(default_factory=dict)

    frames_processed: int = 0
    achieved_fps: Optional[float] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    @staticmethod
    def new(mode: str = "recorded") -> "SessionContext":
        now = datetime.now(timezone.utc).isoformat()
        return SessionContext(
            session_id=f"S-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4]}",
            created_at=now,
            started_at=now,
            mode=mode,
        )

    def mark(self, stage: str, state: StageState, detail: str = "") -> None:
        self.stage_status[stage] = state.value if not detail else f"{state.value}: {detail}"

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        if self.source:
            d["source"]["aspect_ratio"] = self.source.aspect_ratio
        return d


# ---------------------------------------------------------------------------
# What the API and the artifact writer both emit
# ---------------------------------------------------------------------------

@dataclass
class SessionSnapshot:
    """A complete picture of a session. Sent over WebSocket and written to disk."""
    session: SessionContext
    hazards: list[Hazard] = field(default_factory=list)

    # session-level rollup — computed ONCE, in the backend
    total_hazards: int = 0
    total_area_m2: Optional[float] = None
    session_risk_band: Optional[str] = None
    session_risk_score: Optional[int] = None      # 0..100
    alert_count: int = 0
    action: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": SCHEMA_VERSION,
            "session": self.session.to_dict(),
            "summary": {
                "total_hazards": self.total_hazards,
                "total_area_m2": self.total_area_m2,
                "session_risk_band": self.session_risk_band,
                "session_risk_score": self.session_risk_score,
                "alert_count": self.alert_count,
                "action": self.action,
                "frames_processed": self.session.frames_processed,
                "achieved_fps": self.session.achieved_fps,
                "stage_status": self.session.stage_status,
            },
            "hazards": [h.to_dict() for h in self.hazards],
        }

    def to_geojson(self) -> dict[str, Any]:
        feats = [f for f in (h.to_geojson_feature() for h in self.hazards) if f]
        return {
            "type": "FeatureCollection",
            "features": feats,
            "properties": {
                "session_id": self.session.session_id,
                "schema_version": SCHEMA_VERSION,
                "hazards_total": len(self.hazards),
                "hazards_located": len(feats),
            },
        }

    def write(self, out_dir: str) -> None:
        import os
        os.makedirs(out_dir, exist_ok=True)
        with open(os.path.join(out_dir, "hazards.json"), "w") as f:
            json.dump(self.to_dict(), f, indent=2)
        with open(os.path.join(out_dir, "hazards.geojson"), "w") as f:
            json.dump(self.to_geojson(), f, indent=2)
        with open(os.path.join(out_dir, "manifest.json"), "w") as f:
            json.dump(self.session.to_dict(), f, indent=2)


# ---------------------------------------------------------------------------
# Validation — call this in tests and before writing any artifact
# ---------------------------------------------------------------------------

def validate_hazard(h: Hazard) -> list[str]:
    """Returns a list of contract violations. Empty list means valid."""
    errs: list[str] = []

    if h.class_id not in CLASS_NAMES:
        errs.append(f"{h.hazard_id}: unknown class_id {h.class_id}")
    elif not h.derived and CLASS_NAMES[h.class_id] != h.class_name:
        errs.append(f"{h.hazard_id}: class_id/class_name mismatch")

    if not (0.0 <= h.confidence_max <= 1.0):
        errs.append(f"{h.hazard_id}: confidence out of range")

    # A coordinate without a source is an invented coordinate.
    if h.has_location and h.geo_source == GeoSource.NONE.value:
        errs.append(f"{h.hazard_id}: has lat/lon but geo_source is 'none'")
    if not h.has_location and h.geo_source != GeoSource.NONE.value:
        errs.append(f"{h.hazard_id}: geo_source set but no coordinates")

    # An area without a valid reason is an invented area.
    if h.area_m2 is not None and h.area_reason != AreaReason.OK.value:
        errs.append(f"{h.hazard_id}: area_m2 set but area_reason is {h.area_reason}")
    if h.area_m2 is None and h.area_reason == AreaReason.OK.value:
        errs.append(f"{h.hazard_id}: area_reason 'ok' but area_m2 is None")

    if h.zone is not None and not h.has_location:
        errs.append(f"{h.hazard_id}: zone assigned without coordinates")

    if h.relative_depth_index is not None and not (0.0 <= h.relative_depth_index <= 1.0):
        errs.append(f"{h.hazard_id}: relative_depth_index must be 0..1")

    if h.last_frame < h.first_frame:
        errs.append(f"{h.hazard_id}: last_frame before first_frame")

    if h.confirmed and h.detections_count < 1:
        errs.append(f"{h.hazard_id}: confirmed with no detections")

    return errs


def validate_snapshot(s: SessionSnapshot) -> list[str]:
    errs: list[str] = []
    for h in s.hazards:
        errs.extend(validate_hazard(h))
    if s.total_hazards != len(s.hazards):
        errs.append("summary.total_hazards does not match len(hazards)")
    return errs