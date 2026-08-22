import cv2
import time
import torch
from ultralytics import YOLO

def get_device():
    """Detects available hardware acceleration automatically."""
    if torch.backends.mps.is_available():
        return 'mps'
    elif torch.cuda.is_available():
        return 'cuda'
    else:
        return 'cpu'

def main():
    device = get_device()
    # Weights generated locally on Mac Mini when training completes
    model_path = 'runs/hydro_vision_m4pro/weights/best.pt'
    video_path = 'data/raw_videos/master_video.mp4'

    print(f"[INFO] Using compute device: {device.upper()}")
    print(f"[INFO] Loading model weights from: {model_path}")
    
    model = YOLO(model_path)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"[ERROR] Could not open video file at '{video_path}'. Ensure the path and file exist.")
        return

    print(f"[INFO] Starting live inspection on: {video_path}")
    print("[INFO] Press 'q' on the preview window to exit.\n")
    
    print("=" * 80)
    print(f"{'FRAME':<8} | {'DETECTED HAZARD':<22} | {'CONF':<8} | {'BOUNDING BOX [x1, y1, x2, y2]':<30}")
    print("=" * 80)

    frame_count = 0
    start_time = time.time()

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("\n[INFO] Video playback complete.")
            break

        frame_count += 1

        # Run inference on M4 Pro GPU
        results = model.predict(source=frame, conf=0.25, device=device, verbose=False)[0]

        # Extract telemetry
        boxes = results.boxes
        if len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0])
                class_name = model.names[cls_id]
                confidence = float(box.conf[0])
                coords = box.xyxy[0].cpu().numpy().astype(int).tolist()

                print(f"{frame_count:<8} | {class_name:<22} | {confidence:.2f}     | {coords}")

        # Render bounding boxes onto the frame
        annotated_frame = results.plot()

        # Overlay live FPS
        elapsed_time = time.time() - start_time
        fps = frame_count / elapsed_time if elapsed_time > 0 else 0
        cv2.putText(
            annotated_frame, 
            f"M4 Pro Live FPS: {fps:.1f} ({device.upper()})", 
            (20, 40), 
            cv2.FONT_HERSHEY_SIMPLEX, 
            0.8, 
            (0, 255, 0), 
            2
        )

        cv2.imshow("Hydro Vision AI Pipeline - Live Inspection", annotated_frame)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("\n[INFO] Live preview stopped by user.")
            break

    cap.release()
    cv2.destroyAllWindows()
    print("=" * 80)
    print("[INFO] Preview session closed cleanly.")

if __name__ == '__main__':
    main()