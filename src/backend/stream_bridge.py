import sys
import os
import time
import asyncio
import httpx

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from ingestion.stream_loader import stream_video_frames
from perception.mask_extractor import PerceptionEngine
from geometry.metric_mapper import MetricMapper
from geometry.geo_utils import GeoTranslator
from analytics.severity_indexer import SeverityIndexer
from backend.app import manager, latest_system_state

async def process_and_broadcast(video_path: str):
    print("Initializing Stream Bridge Service...")
    perception = PerceptionEngine()
    mapper = MetricMapper()
    geo = GeoTranslator()
    indexer = SeverityIndexer()

    active_hazards = {}

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

        # Update in-memory API state
        latest_system_state["status"] = "STREAMING"
        latest_system_state["total_hazards"] = len(detections)
        latest_system_state["total_area_m2"] = round(frame_surface_area_m2, 2)
        latest_system_state["risk_level"] = severity["level"]
        latest_system_state["hazards"] = frame_payload

        # Broadcast payload via WebSockets
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
        await asyncio.sleep(0.03)  # Maintain real-time ~30 FPS stream cadence

    latest_system_state["status"] = "COMPLETED"