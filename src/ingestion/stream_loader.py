import cv2
import time
from typing import Generator, Tuple

def stream_video_frames(video_path: str) -> Generator[Tuple[int, float, any], None, None]:
    """
    Streams frames from video file sequentially with timestamps and frame IDs.
    """
    cap = cv2.VideoCapture(video_path)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 2)
    
    if not cap.isOpened():
        raise FileNotFoundError(f"Unable to open video source at {video_path}")
        
    frame_id = 0
    start_time = time.time()
    
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break
            
        timestamp = time.time() - start_time
        yield frame_id, timestamp, frame
        frame_id += 1
        
    cap.release()

if __name__ == "__main__":
    import sys
    test_path = sys.argv[1] if len(sys.argv) > 1 else "data/raw_video/sample_drone.mp4"
    
    count = 0
    for fid, ts, frame in stream_video_frames(test_path):
        count += 1
    print(f"Successfully processed {count} frames via generator stream.")