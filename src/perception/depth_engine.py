import base64
import cv2
import numpy as np
from PIL import Image
import torch
from transformers import pipeline


class DepthEngine:

    def __init__(self, device: str = "cuda:0"):
        print("[INFO] Initializing Depth Anything V2 on RTX 4060...")
        # Fallback to CPU if CUDA isn't explicitly requested/available
        device_id = 0 if "cuda" in device and torch.cuda.is_available() else -1

        self.pipe = pipeline(
            task="depth-estimation",
            model="depth-anything/Depth-Anything-V2-Small-hf",
            device=device_id,
        )
        print("[SUCCESS] Depth Anything V2 loaded into VRAM.")

    def predict_depth(self, pil_image: Image.Image):
        """Generates raw depth array and Base64 inferno heatmaps."""
        result = self.pipe(pil_image)
        depth_pil = result["depth"]

        # Convert to numpy array for spatial calculation
        depth_array = np.array(depth_pil, dtype=np.float32)

        # Normalize depth for OpenCV colormapping (0 to 255)
        norm_depth = cv2.normalize(
            depth_array, None, 0, 255, norm_type=cv2.NORM_MINMAX
        ).astype(np.uint8)

        # Apply Inferno colormap (bright = near surface, dark = deep hazard)
        colormap = cv2.applyColorMap(norm_depth, cv2.COLORMAP_INFERNO)

        # Encode colormap image to Base64 for UI rendering
        _, buffer = cv2.imencode(".png", colormap)
        b64_depth_map = base64.b64encode(buffer).decode("utf-8")

        return depth_array, b64_depth_map

    @staticmethod
    def calculate_hazard_volume(
        depth_array: np.ndarray,
        bbox: list,
        altitude_m: float = 25.0,
        focal_length_mm: float = 4.0,
        sensor_width_mm: float = 6.4,
    ) -> float:
        """Calculates hazard volume in m^3 using GSD (Ground Sample Distance)."""
        img_h, img_w = depth_array.shape

        # Calculate Ground Sample Distance (meters per pixel)
        gsd_m = (altitude_m * sensor_width_mm) / (focal_length_mm * img_w)
        pixel_area_m2 = gsd_m**2

        # Extract hazard bounding box region [xmin, ymin, xmax, ymax]
        x1, y1, x2, y2 = [int(v) for v in bbox]
        crop_depth = depth_array[y1:y2, x1:x2]

        if crop_depth.size == 0:
            return 0.0

        # Baseline road level is approximated by boundary edge median depth
        road_surface_depth = np.median(
            np.concatenate(
                [crop_depth[0, :], crop_depth[-1, :], crop_depth[:, 0], crop_depth[:, -1]]
            )
        )

        # Calculate relative depth delta for pixels below road level
        depth_diff_m = np.maximum(0, (crop_depth - road_surface_depth) * 0.01)

        # Numerical integration across pixel grid
        estimated_volume_m3 = float(np.sum(depth_diff_m) * pixel_area_m2)
        return round(estimated_volume_m3, 3)