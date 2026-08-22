import os
import time
import cv2
import numpy as np
from PIL import Image
import torch
from ultralytics import YOLO

# Import the perception & spatial engines we built tonight
from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector


def get_device() -> str:
    """Detects available hardware acceleration automatically."""
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    else:
        return "cpu"


def main():
    device = get_device()

    # Weight fallbacks: Check for local Mac weights, fall back to pretrained yolov8n if training
    model_path = "runs/hydro_vision_m4pro/weights/best.pt"
    if not os.path.exists(model_path):
        model_path = "yolov8n.pt"

    video_path = "data/raw_videos/master_video.mp4"

    print("=" * 85)
    print("   HYDRO-VISION 3D: END-TO-END VISUAL & DEPTH PIPELINE PREVIEW   ")
    print("=" * 85)
    print(f"[INFO] Using compute device: {device.upper()}")
    print(f"[INFO] Loading YOLO weights from: {model_path}")

    # Initialize Engines
    yolo_model = YOLO(model_path)
    depth_engine = DepthEngine(device=device)
    geo_projector = GeoProjector(
        image_width=1920, image_height=1080, hfov_deg=84.0
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(
            f"[ERROR] Could not open video at '{video_path}'. Ensure the path exists."
        )
        return

    print(f"[INFO] Starting live inspection on: {video_path}")
    print("[INFO] Press 'q' on the preview window to exit.\n")

    print("=" * 115)
    print(
        f"{'FRAME':<7} | {'HAZARD':<18} | {'CONF':<6} | {'VOLUME (m3)':<11} | {'WGS84 GPS (LAT, LON)':<25} | {'BBOX [x1, y1, x2, y2]':<20}"
    )
    print("=" * 115)

    frame_count = 0
    start_time = time.time()

    # Base telemetry starting point (Vadodara)
    drone_lat, drone_lon, altitude = 22.30720, 73.18200, 25.0

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            print("\n[INFO] Video playback complete.")
            break

        frame_count += 1
        current_lat = drone_lat + (frame_count * 0.000005)
        current_lon = drone_lon + (frame_count * 0.000006)

        # 1. Run YOLO Object Detection
        results = yolo_model.predict(
            source=frame, conf=0.25, device=device, verbose=False
        )[0]
        annotated_frame = frame.copy()

        # 2. Run Depth Anything V2 Inference
        pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        depth_array, _ = depth_engine.predict_depth(pil_img)

        norm_depth = cv2.normalize(
            depth_array, None, 0, 255, norm_type=cv2.NORM_MINMAX
        ).astype(np.uint8)
        depth_colormap = cv2.applyColorMap(norm_depth, cv2.COLORMAP_INFERNO)

        # 3. Process Detections, Photogrammetry & Depth Integration
        boxes = results.boxes
        if len(boxes) > 0:
            for box in boxes:
                cls_id = int(box.cls[0])
                class_name = yolo_model.names[cls_id]
                confidence = float(box.conf[0])
                coords = box.xyxy[0].cpu().numpy().astype(int).tolist()

                x1, y1, x2, y2 = coords
                center_x, center_y = (x1 + x2) // 2, (y1 + y2) // 2

                # Compute WGS84 GPS Ray-Casting
                gps = geo_projector.pixel_to_gps(
                    pixel_x=center_x,
                    pixel_y=center_y,
                    drone_lat=current_lat,
                    drone_lon=current_lon,
                    altitude_m=altitude,
                )

                # Compute Volumetric Integration in m^3
                volume_m3 = depth_engine.calculate_hazard_volume(
                    depth_array, coords, altitude_m=altitude
                )

                # Print clean, synchronized telemetry line to console
                gps_str = f"{gps['latitude']:.6f}, {gps['longitude']:.6f}"
                print(
                    f"{frame_count:<7} | {class_name:<18} | {confidence:<6.2f} | {volume_m3:<11} | {gps_str:<25} | {str(coords):<20}"
                )

                # Annotate Bounding Box + GPS + Volume on Video
                cv2.rectangle(
                    annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2
                )
                tag_label = (
                    f"{class_name.upper()} ({volume_m3}m3) | GPS: {gps_str}"
                )
                cv2.putText(
                    annotated_frame,
                    tag_label,
                    (x1, max(20, y1 - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    (0, 255, 255),
                    2,
                )

                # Draw Target Box on Depth Map
                cv2.rectangle(
                    depth_colormap, (x1, y1), (x2, y2), (255, 255, 255), 2
                )

        # 4. Calculate FPS & Overlay Telemetry Banner
        elapsed_time = time.time() - start_time
        fps = frame_count / elapsed_time if elapsed_time > 0 else 0

        hud_text = f"FPS: {fps:.1f} ({device.upper()}) | ALT: {altitude}m | LAT: {current_lat:.6f} | LON: {current_lon:.6f}"
        cv2.rectangle(annotated_frame, (0, 0), (frame.shape[1], 35), (0, 0, 0), -1)
        cv2.putText(
            annotated_frame,
            hud_text,
            (15, 24),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2,
        )

        # 5. Create Split-Screen View (Resized for Display)
        out_w, out_h = 960, 540
        left_view = cv2.resize(annotated_frame, (out_w, out_h))
        right_view = cv2.resize(depth_colormap, (out_w, out_h))

        cv2.putText(
            left_view,
            "1. 2D DETECTOR & GPS RAY-CASTING",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (255, 255, 255),
            2,
        )
        cv2.putText(
            right_view,
            f"2. DEPTH ANYTHING V2 3D ESTIMATION ({device.upper()})",
            (20, 30),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 255),
            2,
        )

        split_screen = np.hstack((left_view, right_view))

        cv2.imshow("Hydro Vision AI Pipeline - Live Inspection", split_screen)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            print("\n[INFO] Live preview stopped by user.")
            break

    cap.release()
    cv2.destroyAllWindows()
    print("=" * 115)
    print("[INFO] Preview session closed cleanly.")


if __name__ == "__main__":
    main()