import cv2, sys
from pathlib import Path

if len(sys.argv) < 3:
    print("Usage: python scripts/extract_frames.py <video> <sec> <sec> ...")
    sys.exit(1)

video = sys.argv[1]
if not Path(video).exists():
    print(f"ERROR: file not found: {video}")
    sys.exit(1)

seconds = [float(s) for s in sys.argv[2:]]

out = Path("test_frames"); out.mkdir(exist_ok=True)
cap = cv2.VideoCapture(video)
if not cap.isOpened():
    print(f"ERROR: OpenCV cannot open: {video}")
    sys.exit(1)

fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
dur = total / fps if fps else 0
print(f"Video: {fps:.1f} fps, {total} frames, {dur:.1f}s")

saved = 0
for s in seconds:
    if s > dur:
        print(f"  skip {s}s — beyond video length")
        continue
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(s * fps))
    ok, frame = cap.read()
    if ok:
        p = out / f"t{s:g}s.jpg"
        cv2.imwrite(str(p), frame)
        print(f"  saved {p}")
        saved += 1
    else:
        print(f"  failed to read at {s}s")

cap.release()
print(f"\n{saved} frames saved to {out.resolve()}")