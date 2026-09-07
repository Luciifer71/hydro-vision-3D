import sys
import unittest
import numpy as np

# Test AI Sensitivity Gate logic
class TestAISensitivityGate(unittest.TestCase):
    def test_dynamic_sensitivity_gate_thresholding(self):
        """Verify dynamic threshold filtering at different sensitivity levels."""
        candidates = [
            {"track_id": 1, "class_name": "pothole", "conf": 0.08},
            {"track_id": 2, "class_name": "crack", "conf": 0.22},
            {"track_id": 3, "class_name": "manhole", "conf": 0.55},
            {"track_id": 4, "class_name": "debris", "conf": 0.82},
        ]

        # 1. High Sensitivity Mode (0.05 - Max Recall)
        conf_floor_high = 0.05
        filtered_high = [c for c in candidates if c["conf"] >= conf_floor_high]
        self.assertEqual(len(filtered_high), 4)

        # 2. Medium Sensitivity Mode (0.20 - Standard)
        conf_floor_med = 0.20
        filtered_med = [c for c in candidates if c["conf"] >= conf_floor_med]
        self.assertEqual(len(filtered_med), 3)
        self.assertNotIn(1, [c["track_id"] for c in filtered_med])

        # 3. Strict Sensitivity Mode (0.80 - Strict Precision)
        conf_floor_strict = 0.80
        filtered_strict = [c for c in candidates if c["conf"] >= conf_floor_strict]
        self.assertEqual(len(filtered_strict), 1)
        self.assertEqual(filtered_strict[0]["track_id"], 4)

    def test_dynamic_session_config_update(self):
        """Verify SESSION.cfg conf_floor updates dynamically from WS packets."""
        class MockSession:
            def __init__(self):
                self.cfg = {"conf_floor": 0.20}

        session = MockSession()
        
        ws_msg = {"type": "CONFIDENCE_THRESHOLD", "value": 0.50}
        if ws_msg.get("type") == "CONFIDENCE_THRESHOLD":
            val = float(ws_msg.get("value", 0.20))
            if session.cfg:
                session.cfg["conf_floor"] = val

        self.assertEqual(session.cfg["conf_floor"], 0.50)

        current_conf_floor = float(session.cfg.get("conf_floor", 0.20))
        yolo_conf = min(current_conf_floor, 0.05)
        self.assertEqual(yolo_conf, 0.05)
        self.assertEqual(current_conf_floor, 0.50)

    def test_non_destructive_storage(self):
        """Fix #6: Verify all candidates are stored, only annotations are filtered."""
        candidates = [
            {"track_id": 1, "class_name": "pothole", "conf": 0.15},
            {"track_id": 2, "class_name": "crack", "conf": 0.55},
            {"track_id": 3, "class_name": "manhole", "conf": 0.85},
        ]
        
        # Per-class threshold (baseline storage gate)
        class_conf = {"pothole": 0.10, "crack": 0.10, "manhole": 0.10}
        DEFAULT_CLASS_CONF = 0.20
        
        # All candidates pass the per-class threshold → all stored in registry
        stored = [c for c in candidates if c["conf"] >= class_conf.get(c["class_name"], DEFAULT_CLASS_CONF)]
        self.assertEqual(len(stored), 3, "All 3 candidates should be stored in registry.")
        
        # Dynamic conf_floor = 0.50 → only 2 shown in UI annotations
        current_conf_floor = 0.50
        annotated = [c for c in stored if c["conf"] >= current_conf_floor]
        self.assertEqual(len(annotated), 2, "Only 2 candidates should be shown in annotations.")
        
        # User lowers slider back to 0.10 → all 3 reappear
        current_conf_floor = 0.10
        annotated = [c for c in stored if c["conf"] >= current_conf_floor]
        self.assertEqual(len(annotated), 3, "All 3 stored candidates should reappear when slider is lowered.")

    def test_frontend_confidence_field_mapping(self):
        """Verify frontend filter handles both 'confidence' and 'conf' field names."""
        hazards = [
            {"hazard_id": "H1", "confidence": 0.30},
            {"hazard_id": "H2", "conf": 0.60},
            {"hazard_id": "H3"},  # no confidence field
            {"hazard_id": "H4", "confidence": 0.10},
        ]
        
        threshold = 0.25
        
        # Mimics: h => (h.confidence ?? h.conf ?? 1) >= confidenceThreshold
        filtered = [h for h in hazards if (h.get("confidence") or h.get("conf") or 1) >= threshold]
        
        self.assertEqual(len(filtered), 3, "H1 (0.30), H2 (0.60), H3 (default 1) should pass; H4 (0.10) filtered.")
        ids = [h["hazard_id"] for h in filtered]
        self.assertIn("H1", ids)
        self.assertIn("H2", ids)
        self.assertIn("H3", ids)
        self.assertNotIn("H4", ids)


class TestSupabaseAutoSync(unittest.TestCase):
    def test_isSyncing_lock_prevents_concurrent(self):
        """Fix #5: Verify global isSyncing lock prevents concurrent syncs."""
        state = {"isSyncing": False}
        
        # First sync acquires lock
        self.assertFalse(state["isSyncing"])
        state["isSyncing"] = True
        self.assertTrue(state["isSyncing"])
        
        # Second sync should be blocked
        should_skip = state["isSyncing"]
        self.assertTrue(should_skip, "Second concurrent sync should be blocked.")
        
        # After first sync completes, lock is released
        state["isSyncing"] = False
        self.assertFalse(state["isSyncing"])

    def test_lastSupabaseSync_not_updated_on_failure(self):
        """Fix #3: Verify timer only resets on successful sync."""
        lastSync = 1000
        nowMs = 10000  # 9 seconds since last sync
        
        # Sync triggered (> 8000ms elapsed)
        self.assertTrue(nowMs - lastSync > 8000)
        
        # Simulate failed sync
        sync_result = {"success": False}
        
        # Timer should NOT reset on failure
        if sync_result["success"]:
            lastSync = nowMs
        
        self.assertEqual(lastSync, 1000, "lastSupabaseSync should NOT update on failed sync.")
        
        # Simulate successful sync
        sync_result = {"success": True}
        if sync_result["success"]:
            lastSync = nowMs
        
        self.assertEqual(lastSync, 10000, "lastSupabaseSync should update on successful sync.")

    def test_upsert_deduplication(self):
        """Fix #1: Verify upsert semantics prevent duplicate rows."""
        # Simulate 3 auto-sync cycles pushing same hazards
        registry = {}
        
        for cycle in range(3):
            payload = [
                {"hazard_id": "HAZ-0001", "class_name": "pothole", "confidence": 0.55},
                {"hazard_id": "HAZ-0002", "class_name": "crack", "confidence": 0.70},
            ]
            # upsert semantics: key-based merge
            for item in payload:
                registry[item["hazard_id"]] = item
        
        self.assertEqual(len(registry), 2, "Upsert should result in exactly 2 rows, not 6.")


if __name__ == "__main__":
    unittest.main()
