import torch
import numpy as np
import cv2
from ultralytics import YOLO

class PerceptionEngine:
    def __init__(self, model_path="models/checkpoints/road_hazards_yolov8.pt"):
        # Make sure this path points to models/checkpoints/road_hazards_yolov8.pt
        self.model = YOLO(model_path)

    def process_frame(self, frame):
        # Lower conf to 0.25 to capture all potential defects
        results = self.model.track(frame, persist=True, conf=0.25, verbose=False)[0]
        detections = []
        
        if results.boxes is not None and len(results.boxes) > 0:
            for box in results.boxes:
                track_id = int(box.id[0]) if box.id is not None else 0
                cls_id = int(box.cls[0])
                class_name = self.model.names[cls_id]
                conf = float(box.conf[0])
                bbox = box.xyxy[0].tolist()
                
                x1, y1, x2, y2 = bbox
                pixel_area = (x2 - x1) * (y2 - y1)

                detections.append({
                    "track_id": track_id,
                    "class_name": class_name,
                    "confidence": conf,
                    "bbox": bbox,
                    "pixel_area": pixel_area
                })
                
        return detections