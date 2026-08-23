import sys
import os
import random
from datetime import datetime, timedelta

# Ensure src/ modules are importable
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.analytics.hazard_aggregator import ProductionHazardAggregator
from src.analytics.supabase_sync import SupabaseHazardSync

# Paste your credentials from Supabase Dashboard -> Project Settings -> API
SUPABASE_URL = "https://lkfpdrskgfffwtzbtlnq.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrZnBkcnNrZ2ZmZnd0emJ0bG5xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDEyNzYsImV4cCI6MjEwMzA3NzI3Nn0.suk69wAZtVKR62BI5QpEFCGfUVKyy_mY6IslM9zoxHw"

def run_simulation():
    print("=" * 65)
    print("   HYDRO-VISION 3D: VADODARA FLIGHT SIMULATION & CLOUD SYNC   ")
    print("=" * 65)

    aggregator = ProductionHazardAggregator(proximity_threshold_meters=1.5)

    # 18 Hotspot Locations across Alkapuri / Akota, Vadodara
    hazard_hotspots = [
        {"lat": 22.3072, "lon": 73.1812, "class_id": 0, "name": "pothole_dry", "base_vol": 0.045},
        {"lat": 22.3078, "lon": 73.1819, "class_id": 1, "name": "pothole_waterlogged", "base_vol": 0.082},
        {"lat": 22.3085, "lon": 73.1825, "class_id": 3, "name": "waterlogging_area", "base_vol": 0.350},
        {"lat": 22.3091, "lon": 73.1831, "class_id": 6, "name": "open_manhole", "base_vol": 0.120},
        {"lat": 22.3065, "lon": 73.1805, "class_id": 2, "name": "crack", "base_vol": 0.012},
        {"lat": 22.3059, "lon": 73.1798, "class_id": 4, "name": "drainage_overflow", "base_vol": 0.210},
        {"lat": 22.3052, "lon": 73.1791, "class_id": 5, "name": "damaged_footpath", "base_vol": 0.150},
        {"lat": 22.3081, "lon": 73.1802, "class_id": 0, "name": "pothole_dry", "base_vol": 0.038},
        {"lat": 22.3098, "lon": 73.1840, "class_id": 1, "name": "pothole_waterlogged", "base_vol": 0.095},
        {"lat": 22.3105, "lon": 73.1848, "class_id": 3, "name": "waterlogging_area", "base_vol": 0.520},
        {"lat": 22.3045, "lon": 73.1782, "class_id": 6, "name": "open_manhole", "base_vol": 0.110},
        {"lat": 22.3038, "lon": 73.1775, "class_id": 2, "name": "crack", "base_vol": 0.018},
        {"lat": 22.3112, "lon": 73.1855, "class_id": 0, "name": "pothole_dry", "base_vol": 0.060},
        {"lat": 22.3119, "lon": 73.1862, "class_id": 4, "name": "drainage_overflow", "base_vol": 0.180},
        {"lat": 22.3068, "lon": 73.1835, "class_id": 1, "name": "pothole_waterlogged", "base_vol": 0.075},
        {"lat": 22.3074, "lon": 73.1842, "class_id": 5, "name": "damaged_footpath", "base_vol": 0.140},
        {"lat": 22.3088, "lon": 73.1790, "class_id": 0, "name": "pothole_dry", "base_vol": 0.052},
        {"lat": 22.3101, "lon": 73.1815, "class_id": 6, "name": "open_manhole", "base_vol": 0.130},
    ]

    total_detections = 0
    start_time = datetime.utcnow()

    # Simulate 30 frame detections per hotspot with random telemetry noise
    for hotspot in hazard_hotspots:
        for _ in range(30):
            total_detections += 1
            lat_jitter = hotspot["lat"] + random.uniform(-0.000006, 0.000006)
            lon_jitter = hotspot["lon"] + random.uniform(-0.000006, 0.000006)
            conf = random.uniform(0.75, 0.96)
            vol = max(0.001, hotspot["base_vol"] + random.uniform(-0.004, 0.004))
            ts = (start_time + timedelta(seconds=total_detections * 0.2)).isoformat() + "Z"

            aggregator.ingest_detection(
                class_id=hotspot["class_id"],
                class_name=hotspot["name"],
                lat=lat_jitter,
                lon=lon_jitter,
                confidence=conf,
                depth_volume_m3=vol,
                frame_timestamp=ts
            )

    # Export Local Backup
    aggregator.export_geojson("hazards.geojson")

    # Push to Supabase Cloud
    if SUPABASE_URL != "YOUR_SUPABASE_PROJECT_URL":
        syncer = SupabaseHazardSync(SUPABASE_URL, SUPABASE_KEY)
        syncer.sync_clusters(aggregator.clusters)
    else:
        print("[WARNING] Credentials not updated. Skipping cloud sync.")

if __name__ == "__main__":
    run_simulation()