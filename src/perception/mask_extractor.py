import torch
import numpy as np
import cv2
from ultralytics import YOLO

class PerceptionEngine:
    def __init__(self, model_path: str = "yolov8s-seg.pt", device: str = "cuda:0"):
        self.device = device if torch.cuda.is_available() else "cpu"
        self.model = YOLO(model_path)
        self.model.to(self.device)

    def process_frame(self, frame: np.ndarray):
        """
        Runs segmentation and ByteTrack multi-object tracking.
        Returns persistent tracking IDs, classes, masks, and bounding boxes.
        """
        # Enable persistent multi-object tracking via ByteTrack
        results = self.model.track(
            source=frame, 
            device=self.device, 
            persist=True, 
            tracker="bytetrack.yaml", 
            quantize=16, 
            verbose=False
        )[0]
        
        detections = []
        if results.masks is not None and results.boxes is not None:
            raw_masks = results.masks.data.cpu().numpy()
            classes = results.boxes.cls.cpu().numpy()
            confidences = results.boxes.conf.cpu().numpy()
            boxes = results.boxes.xyxy.cpu().numpy()
            
            # Extract tracking IDs if assigned by ByteTrack
            track_ids = results.boxes.id.cpu().numpy().astype(int) if results.boxes.id is not None else range(len(classes))
            
            frame_h, frame_w = frame.shape[:2]
            
            for mask, cls_id, conf, box, tid in zip(raw_masks, classes, confidences, boxes, track_ids):
                resized_mask = cv2.resize(mask, (frame_w, frame_h), interpolation=cv2.INTER_NEAREST)
                binary_mask = (resized_mask > 0.5).astype(np.uint8)
                pixel_area = int(np.sum(binary_mask))
                
                detections.append({
                    "track_id": int(tid),
                    "class_id": int(cls_id),
                    "class_name": self.model.names[int(cls_id)],
                    "confidence": float(conf),
                    "bbox": [float(x) for x in box],
                    "binary_mask": binary_mask,
                    "pixel_area": pixel_area
                })
                
        return detections