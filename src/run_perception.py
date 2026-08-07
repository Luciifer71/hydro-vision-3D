import sys
import os
import time
import json

sys.path.append(os.path.join(os.path.dirname(__file__)))

from ingestion.stream_loader import stream_video_frames
from perception.mask_extractor import PerceptionEngine
from geometry.metric_mapper import MetricMapper
from analytics.severity_indexer import SeverityIndexer

def run_pipeline(video_path: str):
    print("Initializing Enhanced Phase 2 Perception Engine (ByteTrack + Perspective Corrected)...")
    perception = PerceptionEngine()
    mapper = MetricMapper()
    indexer = SeverityIndexer()
    
    # Persistent hazard tracking registry
    active_hazards = {}
    
    total_frames = 0
    t_start = time.time()
    
    for fid, ts, frame in stream_video_frames(video_path):
        h, w, _ = frame.shape
        detections = perception.process_frame(frame)
        
        frame_surface_area_m2 = 0.0
        current_frame_payload = []
        
        for det in detections:
            tid = det["track_id"]
            area_m2 = mapper.compute_surface_area(det["pixel_area"], image_width_px=w)
            
            # Smooth persistent tracking area using exponential moving average
            if tid in active_hazards:
                active_hazards[tid]["area_m2"] = round(0.7 * active_hazards[tid]["area_m2"] + 0.3 * area_m2, 2)
                active_hazards[tid]["frame_count"] += 1
            else:
                active_hazards[tid] = {
                    "track_id": tid,
                    "class_name": det["class_name"],
                    "area_m2": area_m2,
                    "first_seen_ts": round(ts, 2),
                    "frame_count": 1
                }
            
            smoothed_area = active_hazards[tid]["area_m2"]
            frame_surface_area_m2 += smoothed_area
            
            hazard_event = {
                "track_id": tid,
                "type": det["class_name"],
                "confidence": round(det["confidence"], 2),
                "surface_area_m2": smoothed_area,
                "bbox": [round(c, 1) for c in det["bbox"]]
            }
            current_frame_payload.append(hazard_event)
            
        severity = indexer.evaluate_hazard(frame_surface_area_m2)
        total_frames += 1
        
        if fid == 0 or fid % 15 == 0:
            print(f"[Frame {fid:04d} | TS: {ts:5.2f}s] Active Hazards: {len(detections)} | Total Area: {frame_surface_area_m2:6.2f} m² | Risk: {severity['level']:<8}")
            if current_frame_payload:
                print(f"   └── Sample Event Payload: {json.dumps(current_frame_payload[0])}")

    elapsed = time.time() - t_start
    print(f"\nPipeline Execution Complete: Processed {total_frames} frames in {elapsed:.2f}s ({total_frames / elapsed:.2f} FPS).")

if __name__ == "__main__":
    target_video = sys.argv[1] if len(sys.argv) > 1 else "data/raw_video/sample_drone.mp4"
    run_pipeline(target_video)