import math

class GeoTranslator:
    def __init__(self, home_lat: float = 12.8390, home_lon: float = 77.6519):
        """
        Initializes base GPS coordinates (default: ELCIA / Electronic City, Bengaluru).
        """
        self.home_lat = home_lat
        self.home_lon = home_lon

    def pixel_to_latlon(self, bbox: list, frame_size: tuple, altitude_m: float = 25.0):
        """
        Estimates approximate GPS lat/lon for a detected object relative to drone position.
        """
        img_w, img_h = frame_size
        center_x = (bbox[0] + bbox[2]) / 2.0
        center_y = (bbox[1] + bbox[3]) / 2.0

        # Calculate pixel offset from frame center
        dx_px = center_x - (img_w / 2.0)
        dy_px = (img_h / 2.0) - center_y  # Invert Y for geographic north

        # Scale offsets using GSD (~0.025m/px at 25m altitude)
        meters_per_px = 0.025 * (altitude_m / 25.0)
        dx_m = dx_px * meters_per_px
        dy_m = dy_px * meters_per_px

        # Approximate 1 degree latitude ~ 111,000 meters
        delta_lat = dy_m / 111000.0
        delta_lon = dx_m / (111000.0 * math.cos(math.radians(self.home_lat)))

        return {
            "latitude": round(self.home_lat + delta_lat, 6),
            "longitude": round(self.home_lon + delta_lon, 6)
        }