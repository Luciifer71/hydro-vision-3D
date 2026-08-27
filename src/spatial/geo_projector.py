import math
import numpy as np


class GeoProjector:
    """Production-grade Photogrammetric Engine for mapping image pixel coordinates

    (u, v) to real-world WGS84 Geodetic Coordinates (Latitude, Longitude).
    """

    EARTH_RADIUS_M = 6378137.0  # WGS84 Equatorial Radius in meters

    def __init__(
        self,
        image_width: int = 1920,
        image_height: int = 1080,
        hfov_deg: float = 84.0,
    ):
        self.img_w = image_width
        self.img_h = image_height
        self.hfov = math.radians(hfov_deg)

        # Compute intrinsic focal lengths in pixel space
        self.fx = (self.img_w / 2.0) / math.tan(self.hfov / 2.0)
        self.vfov = 2.0 * math.atan(
            math.tan(self.hfov / 2.0) * (self.img_h / self.img_w)
        )
        self.fy = (self.img_h / 2.0) / math.tan(self.vfov / 2.0)

        # Optical center
        self.cx = self.img_w / 2.0
        self.cy = self.img_h / 2.0

    def _rotation_matrix(
        self, pitch_deg: float, roll_deg: float, yaw_deg: float
    ) -> np.ndarray:
        """Computes 3D Euler rotation matrix (Z-Y-X Tait-Bryan angles)."""
        p = math.radians(pitch_deg)
        r = math.radians(roll_deg)
        y = math.radians(yaw_deg)

        # Rotation around X (Roll)
        Rx = np.array(
            [[1, 0, 0], [0, math.cos(r), -math.sin(r)], [0, math.sin(r), math.cos(r)]]
        )

        # Rotation around Y (Pitch - looking down is negative)
        Ry = np.array(
            [[math.cos(p), 0, math.sin(p)], [0, 1, 0], [-math.sin(p), 0, math.cos(p)]]
        )

        # Rotation around Z (Yaw / Heading)
        Rz = np.array(
            [[math.cos(y), -math.sin(y), 0], [math.sin(y), math.cos(y), 0], [0, 0, 1]]
        )

        # Combined Rotation Matrix
        return Rz @ Ry @ Rx

    def pixel_to_gps(
        self,
        pixel_x: float,
        pixel_y: float,
        drone_lat: float,
        drone_lon: float,
        altitude_m: float,
        pitch_deg: float,
        roll_deg: float = 0.0,
        yaw_deg: float = 0.0,
    ) -> dict:
        """Projects a 2D bounding box center pixel (x, y) onto Earth's surface (Z=0).

        Returns WGS84 Latitude, Longitude, and ground offset distance.
        """
        # Safety fallback if altitude is invalid or ground level is reached
        if altitude_m is None or altitude_m <= 0.5:
            return {
                "latitude": round(drone_lat, 7),
                "longitude": round(drone_lon, 7),
                "ground_distance_m": 0.0,
                "offsets_enu": {"east_m": 0.0, "north_m": 0.0}
            }

        # Guard against normalized pixels (e.g. YOLO outputs between 0.0 and 1.0)
        if 0.0 <= pixel_x <= 1.0 and 0.0 <= pixel_y <= 1.0:
            pixel_x = pixel_x * self.img_w
            pixel_y = pixel_y * self.img_h

        # 1. Clamp pixel coordinates safely BEFORE computing ray to prevent explosions
        safe_x = max(1.0, min(float(self.img_w - 1.0), float(pixel_x)))
        safe_y = max(1.0, min(float(self.img_h - 1.0), float(pixel_y)))

        # Normalize pixel offset relative to optical center
        x_norm = (safe_x - self.cx) / self.fx
        y_norm = (safe_y - self.cy) / self.fy

        # Ray vector in Camera Optical Coordinate Frame (X-Right, Y-Down, Z-Forward)
        ray_camera = np.array([x_norm, y_norm, 1.0])
        norm_val = np.linalg.norm(ray_camera)
        if norm_val > 0:
            ray_camera /= norm_val

        # 2. Convert Camera Frame to ENU (East-North-Up) Frame
        R = self._rotation_matrix(pitch_deg, roll_deg, yaw_deg)

        # Camera down (+Z) maps to ENU Down (-Z) for Nadir orientation
        optical_to_enu = np.array([[0, 1, 0], [1, 0, 0], [0, 0, -1]])
        ray_enu = R @ optical_to_enu @ ray_camera

        # Prevent division by zero or parallel-to-horizon ray instability
        if ray_enu[2] >= -1e-4:
            ray_enu[2] = -1e-4

        # 3. Ray-Ground Intersection (Ground Plane Z = 0)
        scale = -float(altitude_m) / ray_enu[2]
        east_offset_m = ray_enu[0] * scale
        north_offset_m = ray_enu[1] * scale

        ground_distance_m = math.sqrt(east_offset_m**2 + north_offset_m**2)

        # 4. WGS84 Geodetic Coordinate Conversion (Guarding longitude division by cos(lat))
        lat_rad = math.radians(float(drone_lat))
        cos_lat = math.cos(lat_rad)
        if abs(cos_lat) < 1e-6:
            cos_lat = 1e-6  # Prevent division by zero near poles

        delta_lat = (north_offset_m / self.EARTH_RADIUS_M) * (180.0 / math.pi)
        delta_lon = (east_offset_m / (self.EARTH_RADIUS_M * cos_lat)) * (180.0 / math.pi)

        hazard_lat = round(float(drone_lat) + delta_lat, 7)
        hazard_lon = round(float(drone_lon) + delta_lon, 7)

        return {
            "latitude": hazard_lat,
            "longitude": hazard_lon,
            "ground_distance_m": round(ground_distance_m, 2),
            "offsets_enu": {
                "east_m": round(east_offset_m, 2),
                "north_m": round(north_offset_m, 2),
            },
        }