"""Generates sample_session.json — the fixture Tatva builds against."""
import json, sys
sys.path.insert(0, "src")
from schema import (Hazard, SourceInfo, SessionContext, SessionSnapshot,
                    GeoSource, AreaReason, SeverityBand, SeverityBasis,
                    StageState, validate_snapshot)

ctx = SessionContext.new(mode="recorded")
ctx.session_id = "S-20260903-190000-a1b2"
ctx.source = SourceInfo(
    path="data/raw_videos/vadodara_flight_01.mp4",
    filename="vadodara_flight_01.mp4",
    sha256="3f7a2c9e1b4d8a6f0c5e2b9d7a1f4c8e6b3d0a5f2c9e7b1d4a8f6c3e0b5d2a9f",
    width=1920, height=1080, fps=30.0, frame_count=5400, duration_s=180.0,
    codec="h264", rotation=0, has_telemetry=False, telemetry_source=None,
)
ctx.model_path = "runs/yolov8s_baseline/weights/best.pt"
ctx.model_sha256 = "9c4e1a7b3f8d2c6a0e5b9d4f7a2c8e1b6d3f0a5c9e2b7d4f1a8c6e3b0d5f2a9c"
ctx.camera_profile = "unknown"
ctx.altitude_m = None          # not supplied -> areas are null
ctx.conf_threshold = 0.15
ctx.min_frames_to_confirm = 5
ctx.frames_processed = 5400
ctx.achieved_fps = 11.4
ctx.started_at = "2026-09-03T19:00:00+00:00"
ctx.finished_at = "2026-09-03T19:07:53+00:00"
for stage, st, detail in [
    ("ingest", StageState.OK, ""),
    ("detect", StageState.OK, ""),
    ("track", StageState.OK, ""),
    ("consolidate", StageState.OK, ""),
    ("area", StageState.SKIPPED, "no altitude supplied"),
    ("geo", StageState.SKIPPED, "no telemetry in source"),
    ("depth", StageState.OK, ""),
    ("severity", StageState.OK, ""),
    ("artifact", StageState.OK, ""),
]:
    ctx.mark(stage, st, detail)

# Deliberately mixed: shows the UI must handle nulls as the NORMAL case.
specs = [
    (3, "open_manhole",      0.91, 214,  38.2,  41.5,  9847.0, 0.62, 82, "CRITICAL"),
    (5, "waterlogging_area", 0.68, 96,  12.0,  15.2, 41250.0, None, 71, "HIGH"),
    (4, "potholes",          0.57, 41,   7.3,   8.7,  3120.0, 0.44, 48, "MODERATE"),
    (0, "cracks",            0.49, 18,  61.0,  61.6,  1880.0, None, 22, "LOW"),
    (1, "damaged_footpath",  0.46, 12, 103.4, 103.8,  5410.0, 0.18, 19, "LOW"),
]

hazards = []
for i, (cid, cname, conf, n, t0, t1, apx, depth, prio, band) in enumerate(specs):
    tid = 100 + i
    hid = Hazard.new_id(ctx.session_id, tid)
    hazards.append(Hazard(
        hazard_id=hid, track_id=tid, class_id=cid, class_name=cname,
        confidence_max=conf, detections_count=n,
        first_frame=int(t0 * 30), last_frame=int(t1 * 30),
        first_seen_s=t0, last_seen_s=t1, confirmed=True,
        bbox_px=[420.0, 300.0, 520.0, 398.0], area_px=apx,
        # No altitude in this session -> no metric area. This is normal.
        area_m2=None, gsd_m_per_px=None,
        area_reason=AreaReason.NO_ALTITUDE.value,
        # No telemetry -> no coordinates, no zone. Also normal.
        lat=None, lon=None, geo_source=GeoSource.NONE.value,
        geo_error_m=None, zone=None,
        relative_depth_index=depth,
        severity_score=float(prio), severity_band=band,
        severity_basis=SeverityBasis.RELATIVE.value,   # ranked on pixels
        priority_score=prio,
        status="OPEN",
        evidence_image=f"evidence/{hid}.jpg",
    ))

snap = SessionSnapshot(
    session=ctx, hazards=hazards,
    total_hazards=len(hazards),
    total_area_m2=None,                 # cannot compute without altitude
    session_risk_band="HIGH",
    session_risk_score=68,
    alert_count=3,
    action="Dispatch inspection crew to confirm open manhole.",
)

errs = validate_snapshot(snap)
if errs:
    print("VALIDATION FAILED:"); [print(" -", e) for e in errs]; sys.exit(1)

with open("sample_session.json", "w") as f:
    json.dump(snap.to_dict(), f, indent=2)
with open("sample_session.geojson", "w") as f:
    json.dump(snap.to_geojson(), f, indent=2)

print("validation passed")
print("hazards:", len(snap.hazards))
print("geojson features:", len(snap.to_geojson()["features"]), "(0 = correct, no telemetry)")