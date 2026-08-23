import os
from typing import List, Dict, Any
from supabase import create_client, Client

class SupabaseHazardSync:
    """Handles cloud synchronization between the local Hazard Aggregator 
    and the Supabase PostGIS spatial database.
    """
    def __init__(self, supabase_url: str, supabase_key: str):
        if not supabase_url or not supabase_key:
            raise ValueError("[SUPABASE ERROR] Missing URL or API Key credentials.")
            
        # Clean and sanitize URL format
        clean_url = supabase_url.strip().rstrip('/')
        if not clean_url.startswith("http://") and not clean_url.startswith("https://"):
            clean_url = f"https://{clean_url}"
            
        self.url = clean_url
        self.key = supabase_key.strip()
        
        try:
            self.client: Client = create_client(self.url, self.key)
            print(f"[SUPABASE INFO] Connected to PostGIS at: {self.url}")
        except Exception as e:
            raise ValueError(f"[SUPABASE CONNECTION ERROR] Could not connect: {e}")

    def sync_clusters(self, clusters: List[Dict[str, Any]]) -> None:
        """Transforms aggregated cluster dictionaries into PostGIS-compatible records 
        and upserts them into the 'hazards' cloud table.
        """
        records = []
        for c in clusters:
            record = {
                "hazard_id": c['cluster_id'],
                "class_id": c['class_id'],
                "class_name": c['class_name'],
                "confidence": round(float(c['max_confidence']), 4),
                "estimated_volume_m3": round(float(c['volume_m3']), 4),
                "detections_count": int(c['observation_count']),
                "latitude": float(c['lat']),
                "longitude": float(c['lon']),
                # PostGIS spatial format: POINT(longitude latitude)
                "location": f"POINT({c['lon']} {c['lat']})",
                "last_detected": c['last_seen']
            }
            records.append(record)

        if not records:
            print("[SUPABASE INFO] No clusters provided to sync.")
            return

        try:
            response = self.client.table("hazards").upsert(records, on_conflict="hazard_id").execute()
            print(f"[SUPABASE SUCCESS] Synced {len(records)} hazard records to PostGIS Cloud!")
        except Exception as e:
            print(f"[SUPABASE ERROR] Failed to push data to Supabase: {e}")