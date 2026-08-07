import torch
import time
import sys
from ultralytics import YOLO
from ingestion.stream_loader import stream_video_frames

def run_baseline_test(video_path: str):
    # Verify GPU Availability
    device = "cuda:0" if torch.cuda.is_available() else "cpu"
    device_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    print(f"Executing inference on device: {device} ({device_name})")

    # Load baseline model
    model = YOLO("yolov8s-seg.pt")
    model.to(device)

    frame_times = []
    
    for fid, ts, frame in stream_video_frames(video_path):
        t0 = time.perf_counter()
        
        # Use quantize=16 for FP16 precision
        results = model.predict(source=frame, device=device, quantize=16, verbose=False)
        
        t1 = time.perf_counter()
        fps = 1.0 / (t1 - t0)
        frame_times.append(fps)
        
        # Log progress on frame 0 and every 10 frames
        if fid == 0 or fid % 10 == 0:
            avg_fps = sum(frame_times[-10:]) / len(frame_times[-10:])
            print(f"Frame {fid:04d} | Processing Speed: {avg_fps:.2f} FPS")

    if frame_times:
        avg_overall = sum(frame_times) / len(frame_times)
        print(f"\nPipeline Test Complete: Processed {len(frame_times)} total frames at ~{avg_overall:.2f} FPS.")
    else:
        print("\nNo frames were processed. Please check if the video file exists and is valid.")

if __name__ == "__main__":
    video_input = sys.argv[1] if len(sys.argv) > 1 else "data/raw_video/sample_drone.mp4"
    run_baseline_test(video_input)