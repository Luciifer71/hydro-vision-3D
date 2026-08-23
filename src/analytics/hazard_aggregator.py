import math
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

class ProductionHazardAggregator:
    def __init__(self, proximity_threshold_meters: float = 1.5):
        self.threshold = proximity_threshold_meters
        self.clusters: List[Dict[str, Any]] = []

    @staticmethod
    def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculates exact surface distance between two WGS84 points in meters."""
        R = 6371000.0  # Earth radius in meters
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)

        a = math.sin(dphi / 2.0)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0)**2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return R * c

    def ingest_detection(
        self,
        class_id: int,
        class_name: str,
        lat: float,
        lon: float,
        confidence: float,
        depth_volume_m3: float,
        frame_timestamp: Optional[str] = None
    ) -> None:
        """Ingests a raw frame detection, merges with existing spatial clusters, or creates a new cluster."""
        if lat == 0.0 or lon == 0.0 or confidence <= 0.0:
            return  # Reject malformed telemetry

        timestamp = frame_timestamp or datetime.utcnow().isoformat() + "Z"
        matched_cluster = None

        for cluster in self.clusters:
            # Check spatial proximity against cluster weighted centroid
            dist = self.haversine_distance(cluster['lat'], cluster['lon'], lat, lon)
            if dist <= self.threshold:
                # Require class match OR handle related class merging
                if cluster['class_id'] == class_id or self._is_compatible_class(cluster['class_id'], class_id):
                    matched_cluster = cluster
                    break

        if matched_cluster:
            # Update Confidence-Weighted Spatial Centroid
            total_conf = matched_cluster['total_confidence'] + confidence
            matched_cluster['lat'] = (matched_cluster['lat'] * matched_cluster['total_confidence'] + lat * confidence) / total_conf
            matched_cluster['lon'] = (matched_cluster['lon'] * matched_cluster['total_confidence'] + lon * confidence) / total_conf
            matched_cluster['total_confidence'] = total_conf
            matched_cluster['observation_count'] += 1
            matched_cluster['max_confidence'] = max(matched_cluster['max_confidence'], confidence)
            matched_cluster['volume_m3'] = max(matched_cluster['volume_m3'], depth_volume_m3)
            matched_cluster['last_seen'] = timestamp
            
            # Upgrade class if higher confidence observation provides a more specific class
            if confidence > matched_cluster['max_confidence_class_override']:
                matched_cluster['class_id'] = class_id
                matched_cluster['class_name'] = class_name
                matched_cluster['max_confidence_class_override'] = confidence
        else:
            # Initialize New Cluster
            self.clusters.append({
                'cluster_id': f"HAZ-{len(self.clusters) + 1:04d}",
                'class_id': class_id,
                'class_name': class_name,
                'lat': lat,
                'lon': lon,
                'total_confidence': confidence,
                'max_confidence': confidence,
                'max_confidence_class_override': confidence,
                'volume_m3': depth_volume_m3,
                'observation_count': 1,
                'first_seen': timestamp,
                'last_seen': timestamp
            })

    @staticmethod
    def _is_compatible_class(id1: int, id2: int) -> bool:
        """Allow spatial clustering across closely related hazard types (e.g., dry vs waterlogged potholes)."""
        compatible_pairs = [{0, 1}, {3, 4}]  # {pothole_dry, pothole_waterlogged}, {waterlogging, drainage_overflow}
        return set([id1, id2]) in compatible_pairs

    def export_geojson(self, output_path: str = "hazards.geojson") -> Dict[str, Any]:
        """Exports all aggregated hazard clusters as a standard GeoJSON FeatureCollection."""
        features = []
        for c in self.clusters:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [c['lon'], c['lat']]  # GeoJSON standard: [longitude, latitude]
                },
                "properties": {
                    "hazard_id": c['cluster_id'],
                    "class_id": c['class_id'],
                    "class_name": c['class_name'],
                    "confidence": round(c['max_confidence'], 4),
                    "estimated_volume_m3": round(c['volume_m3'], 4),
                    "detections_count": c['observation_count'],
                    "first_detected": c['first_seen'],
                    "last_detected": c['last_seen']
                }
            }
            features.append(feature)

        geojson_data = {
            "type": "FeatureCollection",
            "features": features
        }

        with open(output_path, "w") as f:
            json.dump(geojson_data, f, indent=2)

        print(f"[SUCCESS] Exported {len(features)} unique hazard clusters to {output_path}")
        return geojson_data