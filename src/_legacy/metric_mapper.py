import json
import numpy as np

class MetricMapper:
    def __init__(self, config_path: str = "config/camera_intrinsics.json"):
        with open(config_path, "r") as f:
            self.config = json.load(f)
            
        self.sensor_width_mm = self.config.get("sensor_width_mm", 6.4)
        self.focal_length_mm = self.config.get("focal_length_mm", 4.0)
        self.altitude_m = self.config.get("default_altitude_meters", 25.0)
        self.tilt_angle_deg = self.config.get("tilt_angle_degrees", 0.0)

    def compute_gsd(self, image_width_px: int) -> float:
        """Calculates Ground Sample Distance (GSD) in meters per pixel."""
        sensor_width_m = self.sensor_width_mm / 1000.0
        focal_length_m = self.focal_length_mm / 1000.0
        return (self.altitude_m * sensor_width_m) / (focal_length_m * image_width_px)

    def compute_surface_area(self, pixel_count: int, image_width_px: int) -> float:
        """
        Converts pixel area to ground surface area (m²), 
        applying cosine perspective correction for camera tilt angle.
        """
        gsd = self.compute_gsd(image_width_px)
        flat_area_m2 = pixel_count * (gsd ** 2)
        
        # Apply perspective compensation for camera tilt angle
        tilt_rad = np.radians(self.tilt_angle_deg)
        cos_tilt = max(np.cos(tilt_rad), 0.2)  # Clamp to prevent division by zero at steep angles
        
        ground_area_m2 = flat_area_m2 / cos_tilt
        return round(float(ground_area_m2), 2)