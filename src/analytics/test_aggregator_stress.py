import random
from datetime import datetime, timedelta
from hazard_aggregator import ProductionHazardAggregator

def run_stress_test():
    print("=" * 60)
    print("   RUNNING AGGREGATOR STRESS & EDGE-CASE SUITE   ")
    print("=" * 60)

    aggregator = ProductionHazardAggregator(proximity_threshold_meters=1.5)

    # Base GPS Center (e.g., Vadodara Test Ground)
    BASE_LAT = 22.3072
    BASE_LON = 73.1812

    # Hazard 1: Pothole Cluster receiving 50 noisy detections with GPS jitter
    print("[TEST 1] Simulating 50 noisy detections of a single pothole...")
    for i in range(50):
        # Add random jitter within ~0.8 meters
        lat_jitter = BASE_LAT + random.uniform(-0.000005, 0.000005)
        lon_jitter = BASE_LON + random.uniform(-0.000005, 0.000005)
        conf = random.uniform(0.65, 0.95)
        vol = random.uniform(0.02, 0.05)
        
        aggregator.ingest_detection(
            class_id=0, class_name="pothole_dry",
            lat=lat_jitter, lon=lon_jitter,
            confidence=conf, depth_volume_m3=vol
        )

    # Hazard 2: Nearby Waterlogged Pothole (2 meters away - Should form DISTINCT cluster)
    print("[TEST 2] Simulating nearby hazard 2.5m away (distinct cluster check)...")
    OFFSET_LAT = BASE_LAT + 0.000025  # ~2.7 meters away
    for i in range(30):
        aggregator.ingest_detection(
            class_id=1, class_name="pothole_waterlogged",
            lat=OFFSET_LAT + random.uniform(-0.000002, 0.000002),
            lon=BASE_LON + random.uniform(-0.000002, 0.000002),
            confidence=random.uniform(0.70, 0.92),
            depth_volume_m3=0.08
        )

    # Hazard 3: Edge Cases (Zero coordinates, negative confidence, invalid inputs)
    print("[TEST 3] Injecting malformed telemetry and noise...")
    aggregator.ingest_detection(0, "pothole_dry", 0.0, 0.0, 0.9, 0.05)  # Invalid lat/lon
    aggregator.ingest_detection(3, "waterlogging_area", BASE_LAT, BASE_LON, -0.5, 0.1)  # Invalid confidence

    # Export & Inspect Results
    geojson = aggregator.export_geojson("hazards.geojson")

    print("\n" + "=" * 60)
    print("   STRESS TEST RESULTS SUMMARY   ")
    print("=" * 60)
    print(f"Total Detections Ingested : 82")
    print(f"Clusters Formed           : {len(aggregator.clusters)} (Expected: 2)")
    
    for cluster in aggregator.clusters:
        print(f"\nID: {cluster['cluster_id']} | Class: {cluster['class_name']}")
        print(f"  Centroid Coordinates : [{cluster['lat']:.6f}, {cluster['lon']:.6f}]")
        print(f"  Total Detections     : {cluster['observation_count']}")
        print(f"  Max Volume Tracked   : {cluster['volume_m3']:.4f} m³")
        print(f"  Max Confidence       : {cluster['max_confidence']:.4f}")

if __name__ == "__main__":
    run_stress_test()