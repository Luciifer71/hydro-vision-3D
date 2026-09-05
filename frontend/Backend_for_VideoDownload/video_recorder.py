import cv2
import threading
import time
from pathlib import Path
from datetime import datetime

class VideoRecorder:
    def __init__(self, output_dir="data/recordings"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.is_recording = False
        self.writer = None
        self.lock = threading.Lock()
        self.current_filename = None
        self.current_filepath = None
        self.start_time = 0

    def start_recording(self, fps=30.0, width=1920, height=1080):
        with self.lock:
            if self.is_recording:
                return {"status": "already recording", "file": self.current_filename}

            self.current_filename = f"recording_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
            self.current_filepath = self.output_dir / self.current_filename
            
            # Using MP4V codec which is widely supported without requiring heavy FFmpeg transcoding
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            self.writer = cv2.VideoWriter(str(self.current_filepath), fourcc, float(fps), (int(width), int(height)))
            
            if not self.writer.isOpened():
                self.writer = None
                return {"status": "error", "message": "Failed to open VideoWriter"}
                
            self.is_recording = True
            self.start_time = time.time()
            return {"status": "started", "file": self.current_filename}

    def write_frame(self, frame):
        with self.lock:
            if self.is_recording and self.writer is not None:
                try:
                    # Write the frame directly (it should already be annotated by main.py)
                    self.writer.write(frame)
                except Exception as e:
                    print(f"[VideoRecorder] Error writing frame: {e}")

    def stop_recording(self):
        with self.lock:
            if not self.is_recording:
                return {"status": "not recording"}

            if self.writer is not None:
                self.writer.release()
                self.writer = None
                
            self.is_recording = False
            duration = time.time() - self.start_time
            return {
                "status": "stopped", 
                "file": self.current_filename, 
                "path": str(self.current_filepath),
                "duration_seconds": round(duration, 1)
            }

# Global singleton instance to be imported by main.py
recorder = VideoRecorder()
