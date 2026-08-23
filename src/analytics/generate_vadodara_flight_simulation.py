import random
import json
from datetime import datetime, timedelta
from hazard_aggregator import ProductionHazardAggregator

def generate_simulated_flight():
    print("=" * 65)
    print("   HYDRO-VISION GCS: VADODARA FLIGHT SIMULATION DATA ENGINE   ")
    print("=" * 65)

    aggregator = ProductionHazardAggregator(proximity_threshold_meters=1.5)

    # Waypoints around Alkapuri / RC Dutt Road / Akota (Vadodara)
    # Master Classes:
    # 0: pothole_dry, 1: pothole_waterlogged, 2: crack,
    # 3: waterlogging_area, 4: drainage_overflow, 5: damaged_footpath, 6: open_manhole
    
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

    total_raw_detections = 0
    start_time = datetime.utcnow()

    # Simulate drone sweeping over each hotspot multiple times
    for hotspot in hazard_hotspots:
        num_frames = random.randint(25, 45)  # 25 to 45 detections per hazard
        for f in range(num_frames):
            total_raw_detections += 1
            # Add realistic GPS noise (~0.5m - 1.2m drift)
            lat_noise = hotspot["lat"] + random.uniform(-0.000008, 0.000008)
            lon_noise = hotspot["lon"] + random.uniform(-0.000008, 0.000008)
            conf = random.uniform(0.72, 0.96)
            vol_noise = max(0.001, hotspot["base_vol"] + random.uniform(-0.005, 0.005))
            
            timestamp = (start_time + timedelta(seconds=total_raw_detections * 0.2)).isoformat() + "Z"

            aggregator.ingest_detection(
                class_id=hotspot["class_id"],
                class_name=hotspot["name"],
                lat=lat_noise,
                lon=lon_noise,
                confidence=conf,
                depth_volume_m3=vol_noise,
                frame_timestamp=timestamp
            )

    # Export to GeoJSON
    output_filename = "hazards.geojson"
    aggregator.export_geojson(output_filename)

    print("\n" + "=" * 65)
    print("   SIMULATION COMPLETE: FLIGHT SUMMARY   ")
    print("=" * 65)
    print(f"Total Flight Frames Processed : {total_raw_detections}")
    print(f"Unique Hazards Deduplicated   : {len(aggregator.clusters)} (Target: 18)")
    print(f"GeoJSON Master Exported To    : {output_filename}")

if __name__ == "__main__":
    generate_simulated_flight()