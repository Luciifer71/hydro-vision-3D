from ultralytics import YOLO
from pathlib import Path
import cv2



ROOT = Path(__file__).resolve().parent.parent
m = YOLO(str(ROOT / "best.pt"))
out = ROOT / "test_frames" / "annotated"; out.mkdir(exist_ok=True)
imgs = sorted((ROOT / "test_frames").glob("*.jpg"))
if not imgs:
    print("ERROR: no frames in test_frames/. Run extract_frames.py first.")
    raise SystemExit(1)
for img in imgs:
    ...

for img in sorted((ROOT / "test_frames").glob("*.jpg")):
    # conf=0.01 — see EVERYTHING the model considered, not just what passes
    r = m.predict(source=str(img), conf=0.01, imgsz=640, verbose=False)[0]
    print(f"\n=== {img.name} ===")
    if r.boxes is None or len(r.boxes) == 0:
        print("  NOTHING detected, even at conf=0.01")
        continue
    rows = sorted(
        ((m.names[int(b.cls[0])], float(b.conf[0])) for b in r.boxes),
        key=lambda x: -x[1]
    )
    for name, c in rows[:15]:
        print(f"  {name:20s} {c:.3f}")
    cv2.imwrite(str(out / img.name), r.plot())

print(f"\nAnnotated frames -> {out}")