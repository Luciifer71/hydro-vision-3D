from ultralytics import YOLO
from pathlib import Path
import sys, glob

weights = sys.argv[1]
folder  = sys.argv[2]
print(f"=== {weights} on {folder} ===")
m = YOLO(weights)
imgs = sorted(glob.glob(f"{folder}/*.jpg"))
if not imgs:
    print("no frames found"); sys.exit(1)
for p in imgs:
    r = m.predict(source=p, conf=0.01, imgsz=640, verbose=False)[0]
    name = Path(p).name
    if r.boxes is None or len(r.boxes) == 0:
        print(f"{name}: nothing"); continue
    rows = sorted(((m.names[int(b.cls[0])], float(b.conf[0])) for b in r.boxes), key=lambda x: -x[1])
    top = ", ".join(f"{n}={c:.3f}" for n, c in rows[:5])
    print(f"{name}: {top}")