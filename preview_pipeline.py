import os
import sys
import time
import cv2
import numpy as np
from PIL import Image
import torch
from ultralytics import YOLO

# Import perception & spatial engines
from src.perception.depth_engine import DepthEngine
from src.spatial.geo_projector import GeoProjector


def get_device() -> str:
    """Detects available hardware acceleration automatically."""
    if torch.cuda.is_available():
        return "cuda"
    elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    else:
        return "cpu"


def find_custom_weights() -> str:
    """Searches common training output directories for custom hazard weights."""
    candidate_paths = [
        "best.pt",
        "runs/detect/hydro_vision_7class/weights/best.pt",
        "runs/hydro_vision_m4pro/weights/best.pt",
        "weights/best.pt",
    ]

    for path in candidate_paths:
        if os.path.exists(path):
            return path

    return "yolov8n.pt"


def apply_unsharp_mask(image: np.ndarray) -> np.ndarray:
    """
    Ultra-fast GPU/CPU sharpening filter (<0.5ms latency).
    This replaces the slow ESPCN model to keep FPS above 25 while keeping
    edges sharp.
    """
    gaussian_blur = cv2.GaussianBlur(image, (0, 0), 2.0)
    return cv2.addWeighted(image, 1.5, gaussian_blur, -0.5, 0)


def enhance_hazard_classification(
    frame, coords, base_class_name, confidence
):
    """
    Analyzes HSV color space inside the bounding box and prints live metrics.
    Overrides dry pothole predictions to 'pothole_waterlogged' when
    reflection/mud signatures match.
    """
    x1, y1, x2, y2 = coords

    # Prevent out-of-bounds slicing
    h_f, w_f = frame.shape[:2]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w_f, x2), min(h_f, y2)

    if y2 <= y1 or x2 <= x1:
        return base_class_name, confidence

    crop = frame[y1:y2, x1:x2]

    # Convert crop to HSV color space
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    avg_saturation = np.mean(hsv[:, :, 1])
    avg_brightness = np.mean(hsv[:, :, 2])

    # Print live HSV values to terminal for quick calibration
    if "pothole" in base_class_name.lower():
        print(
            f"[HSV METRICS] Class: {base_class_name:<12} | "
            f"Saturation (S): {avg_saturation:<6.1f} | "
            f"Brightness (V): {avg_brightness:<6.1f}"
        )

    # Broader threshold for wet/muddy road surfaces:
    # Muddy water typically has low-to-medium saturation (< 85)
    # and medium-to-high brightness (> 75).
    if "pothole" in base_class_name.lower():
        if avg_brightness > 75 and avg_saturation < 85:
            return "pothole_waterlogged", confidence

    return base_class_name, confidence


def main():
    device = get_device()
    model_path = find_custom_weights()
    video_path = "data/raw_videos/master_video.mp4"

    print("=" * 85)
    print("   HYDRO-VISION 3D: HIGH-FPS ZERO-FLICKER PIPELINE PREVIEW   ")
    print("=" * 85)
    print(f"[INFO] Using compute device: {device.upper()}")
    print(f"[INFO] Selected YOLO weights: {model_path}")

    if model_path == "yolov8n.pt":
        print(
            "[WARNING] Custom 'best.pt' not found locally. "
            "Using base COCO weights."
        )
    else:
        print("[SUCCESS] Loaded custom 7-class hazard model weights.")

    # Initialize YOLO Model & Print Verification Classes
    yolo_model = YOLO(model_path)
    print("\n[VERIFICATION] Model classes loaded in VRAM memory:")
    print(yolo_model.names)
    print("\n")

    # Initialize Depth & Photogrammetry Engines
    depth_engine = DepthEngine(device=device)
    geo_projector = GeoProjector(
        image_width=1920,
        image_height=1080,
        hfov_deg=84.0,
    )

    cap = cv2.VideoCapture(video_path)

    if not cap.isOpened():
        print(
            f"[ERROR] Could not open video at '{video_path}'. "
            "Ensure file exists."
        )
        return

    print(f"[INFO] Starting live inspection on: {video_path}")
    print(
        "[INFO] Press 'q' on the preview window or "
        "Ctrl+C in terminal to exit.\n"
    )

    print("=" * 115)
    print(
        f"{'FRAME':<7} | {'HAZARD':<18} | {'CONF':<6} | "
        f"{'VOLUME (m3)':<11} | {'WGS84 GPS (LAT, LON)':<25} | "
        f"{'BBOX [x1, y1, x2, y2]':<20}"
    )
    print("=" * 115)

    frame_count = 0
    start_time = time.time()

    # Telemetry baseline (Vadodara)
    drone_lat, drone_lon, altitude = 22.30720, 73.18200, 25.0

    # Cache structures for depth optimization (Frame Skipping)
    cached_depth_array = None
    cached_depth_colormap = None

    # Globally disable PyTorch Gradient tracking for max speed
    torch.set_grad_enabled(False)

    try:
        while cap.isOpened():
            ret, frame = cap.read()

            if not ret:
                print("\n[INFO] Video playback complete.")
                break

            frame_count += 1
            current_lat = drone_lat + (frame_count * 0.000005)
            current_lon = drone_lon + (frame_count * 0.000006)
            h_orig, w_orig = frame.shape[:2]

            # ------------------------------------------------------------------
            # 1. OPTIMIZED YOLO OBJECT DETECTION
            # Low confidence (0.08) helps catch low-contrast waterlogging.
            # ------------------------------------------------------------------
            if device == "cuda":
                with torch.cuda.amp.autocast():
                    results = yolo_model.predict(
                        source=frame,
                        conf=0.08,
                        imgsz=960,
                        device=device,
                        verbose=False,
                    )[0]
            else:
                results = yolo_model.predict(
                    source=frame,
                    conf=0.08,
                    imgsz=640,
                    device=device,
                    verbose=False,
                )[0]

            annotated_frame = frame.copy()

            # ------------------------------------------------------------------
            # 2. DEPTH ANYTHING V2
            # Downscales to 392x392 and skips every 4 frames to save
            # VRAM/time.
            # ------------------------------------------------------------------
            if frame_count % 4 == 1 or cached_depth_colormap is None:
                small_frame = cv2.resize(
                    frame,
                    (392, 392),
                    interpolation=cv2.INTER_LINEAR,
                )

                pil_img = Image.fromarray(
                    cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)
                )

                if device == "cuda":
                    with torch.cuda.amp.autocast():
                        raw_depth, _ = depth_engine.predict_depth(pil_img)
                else:
                    raw_depth, _ = depth_engine.predict_depth(pil_img)

                # Rescale depth array back to full frame size using
                # INTER_NEAREST to prevent blurring.
                cached_depth_array = cv2.resize(
                    raw_depth,
                    (w_orig, h_orig),
                    interpolation=cv2.INTER_NEAREST,
                )

                norm_depth = cv2.normalize(
                    cached_depth_array,
                    None,
                    0,
                    255,
                    norm_type=cv2.NORM_MINMAX,
                ).astype(np.uint8)

                cached_depth_colormap = cv2.applyColorMap(
                    norm_depth,
                    cv2.COLORMAP_INFERNO,
                )

            depth_array = cached_depth_array
            depth_colormap = cached_depth_colormap.copy()

            # ------------------------------------------------------------------
            # 3. PROCESS DETECTIONS, FILTERING, PHOTOGRAMMETRY & TELEMETRY
            # ------------------------------------------------------------------
            boxes = results.boxes

            if len(boxes) > 0:
                for box in boxes:
                    cls_id = int(box.cls[0])
                    raw_class_name = yolo_model.names[cls_id]
                    confidence = float(box.conf[0])

                    coords = (
                        box.xyxy[0]
                        .cpu()
                        .numpy()
                        .astype(int)
                        .tolist()
                    )

                    x1, y1, x2, y2 = coords
                    box_area = (x2 - x1) * (y2 - y1)
                    total_image_area = w_orig * h_orig

                    # 1. GEOMETRIC FILTER:
                    # Drop boxes taking up > 25% of the frame
                    # (e.g., trucks or other large objects).
                    if box_area > (0.25 * total_image_area):
                        continue

                    # 2. CONFIDENCE FLOOR:
                    # Ignore noisy detections below 0.20.
                    if confidence < 0.20:
                        continue

                    # 3. SMART HSV OVERRIDE:
                    # Correct likely waterlogged potholes.
                    class_name, confidence = enhance_hazard_classification(
                        frame,
                        coords,
                        raw_class_name,
                        confidence,
                    )

                    center_x = (x1 + x2) // 2
                    center_y = (y1 + y2) // 2

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
                        depth_array,
                        coords,
                        altitude_m=altitude,
                    )

                    # Print synchronized console row
                    gps_str = (
                        f"{gps['latitude']:.6f}, "
                        f"{gps['longitude']:.6f}"
                    )

                    print(
                        f"{frame_count:<7} | {class_name:<18} | "
                        f"{confidence:<6.2f} | {volume_m3:<11} | "
                        f"{gps_str:<25} | {str(coords):<20}"
                    )

                    # Overlay Bounding Box & Label on 2D view
                    # Orange for water/waterlogged, Green for dry.
                    box_color = (
                        (0, 165, 255)
                        if "water" in class_name.lower()
                        else (0, 255, 0)
                    )

                    cv2.rectangle(
                        annotated_frame,
                        (x1, y1),
                        (x2, y2),
                        box_color,
                        2,
                    )

                    tag_label = (
                        f"{class_name.upper()} "
                        f"{confidence:.2f} ({volume_m3}m3)"
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

                    # Overlay Bounding Box on Depth Map
                    cv2.rectangle(
                        depth_colormap,
                        (x1, y1),
                        (x2, y2),
                        (255, 255, 255),
                        2,
                    )

            else:
                # Active scanner heartbeat line in terminal
                gps_center = f"{current_lat:.6f}, {current_lon:.6f}"

                print(
                    f"{frame_count:<7} | {'SCANNING REGION...':<18} | "
                    f"{'N/A':<6} | {'0.000':<11} | "
                    f"{gps_center:<25} | {'[]':<20}"
                )

            # ------------------------------------------------------------------
            # 4. HUD BANNER & MONITOR-SAFE DUAL DISPLAY
            # ------------------------------------------------------------------
            elapsed_time = time.time() - start_time
            fps = (
                frame_count / elapsed_time
                if elapsed_time > 0
                else 0
            )

            # Lock individual views to 480p so the COMBINED width is 1708
            # (fits on a 1920 monitor).
            target_w = 854
            target_h = 480

            # High-Quality Resizing
            left_view = cv2.resize(
                annotated_frame,
                (target_w, target_h),
                interpolation=cv2.INTER_CUBIC,
            )

            right_view = cv2.resize(
                depth_colormap,
                (target_w, target_h),
                interpolation=cv2.INTER_CUBIC,
            )

            # Combine views into a single 1708x480 window
            composite = np.hstack((left_view, right_view))

            # Apply Unsharp Mask
            # Much faster on a 1708x480 image, restores FPS.
            final_display = apply_unsharp_mask(composite)

            # HUD Display with accurate telemetry
            out_h, out_w = final_display.shape[:2]

            hud_text = (
                f"FPS: {fps:.1f} ({device.upper()}) | "
                f"VIEW: {out_w}x{out_h} (Monitor Safe) | "
                f"LAT: {current_lat:.6f}"
            )

            cv2.rectangle(
                final_display,
                (0, 0),
                (out_w, 35),
                (0, 0, 0),
                -1,
            )

            cv2.putText(
                final_display,
                hud_text,
                (15, 24),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 0),
                2,
            )

            # Add Panel Titles
            cv2.putText(
                final_display,
                "1. 2D DETECTOR",
                (15, 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                2,
            )

            cv2.putText(
                final_display,
                "2. 3D DEPTH MAP",
                (target_w + 15, 65),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 255, 255),
                2,
            )

            cv2.imshow(
                "Hydro Vision AI Pipeline - Live Inspection",
                final_display,
            )

            if cv2.waitKey(1) & 0xFF == ord("q"):
                print("\n[INFO] Live preview window closed by user.")
                break

    except KeyboardInterrupt:
        print(
            "\n[INFO] Interrupted by user (Ctrl+C). "
            "Shutting down pipeline..."
        )

    finally:
        cap.release()
        cv2.destroyAllWindows()
        print("=" * 115)
        print("[INFO] Pipeline session closed cleanly.")


if __name__ == "__main__":
    main()
