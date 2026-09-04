import json, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
latest = max((ROOT / "outputs/sessions").iterdir(), key=lambda p: p.stat().st_mtime)
d = json.load(open(latest / "hazards.json"))

print(f"Session: {latest.name}")
print(f"Frames processed: {d['summary']['frames_processed']}")
print(f"Confirmed hazards: {len(d['hazards'])}\n")

print("Class distribution:")
for cls, n in collections.Counter(h['class_name'] for h in d['hazards']).most_common():
    print(f"  {cls:22s} {n}")

print("\nTop hazards by priority:")
for h in d['hazards'][:10]:
    print(f"  {h['hazard_id']}  {h['class_name']:20s} "
          f"conf={h['confidence_max']:.2f}  seen={h['detections_count']}x  "
          f"{h['duration_s']}s  {h['severity_band']}")