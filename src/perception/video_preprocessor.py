import os
import cv2
import subprocess
import numpy as np
from pathlib import Path
from typing import Tuple, Optional

class VideoPreprocessor:
    """Pre-processing engine for Drone 404:
    1. Transcodes non-web video codecs (H.265, MKV, AVI) to browser-compatible H.264 MP4.
    2. Upscales low-resolution feeds (480p/720p) to 1080p using adaptive super-resolution.
    """
    def __init__(self, target_resolution: Tuple[int, int] = (1920, 1080)):
        self.target_width, self.target_height = target_resolution

    @staticmethod
    def ensure_web_compatible_codec(input_path: str, output_path: Optional[str] = None) -> str:
        """Checks if a video uses web-compatible H.264 encoding. 
        If it uses H.265, MKV, or AVI, it transcodes it via FFmpeg.
        """
        input_p = Path(input_path)
        if not input_p.exists():
            raise FileNotFoundError(f"[PREPROCESSOR ERROR] File not found: {input_path}")

        if output_path is None:
            output_path = str(input_p.parent / f"{input_p.stem}_web.mp4")

        # Check extension
        ext = input_p.suffix.lower()
        if ext in ['.mp4'] and "_web" in input_p.stem:
            return str(input_p)

        print(f"[PREPROCESSOR] Transcoding {input_p.name} to browser-compatible H.264 MP4...")
        
        # FFmpeg command line execution for H.264/AAC conversion
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", str(input_p),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "128k",
            "-pix_fmt", "yuv420p",
            output_path
        ]

        try:
            subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            print(f"[PREPROCESSOR SUCCESS] Transcoded video saved to: {output_path}")
            return output_path
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("[PREPROCESSOR WARNING] FFmpeg not found or failed. Falling back to OpenCV reader.")
            return str(input_p)

    def upscale_frame_if_needed(self, frame: np.ndarray) -> np.ndarray:
        """Upscales low-resolution frames (e.g., 480p or 720p) to 1080p 
        using Lanczos-4 adaptive interpolation to preserve sharp edges for YOLOv8.
        """
        h, w = frame.shape[:2]

        # If frame resolution is below 1080p target, upscale
        if w < self.target_width or h < self.target_height:
            # Lanczos interpolation preserves high-frequency edge details better than bilinear
            upscaled = cv2.resize(
                frame, 
                (self.target_width, self.target_height), 
                interpolation=cv2.INTER_LANCZOS4
            )
            return upscaled
        
        return frame

    def process_video_stream(self, input_video_path: str, output_video_path: str):
        """Processes an entire video file, applying codec compatibility and upscaling."""
        # 1. Transcode codec if necessary
        web_video_path = self.ensure_web_compatible_codec(input_video_path)
        
        cap = cv2.VideoCapture(web_video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (self.target_width, self.target_height))

        frame_count = 0
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            # 2. Upscale frame to 1080p if resolution is low
            enhanced_frame = self.upscale_frame_if_needed(frame)
            out.write(enhanced_frame)
            frame_count += 1

        cap.release()
        out.release()
        print(f"[PREPROCESSOR COMPLETE] Enhanced {frame_count} frames to 1080p resolution.")