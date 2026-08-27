from transformers import pipeline
from PIL import Image
import requests

def test_depth_estimation():
    print("=" * 60)
    print("     HYDRO-VISION 3D: DEPTH ANYTHING V2 INITIALIZATION    ")
    print("=" * 60)
    
    # 1. Load the official Depth Anything V2 pipeline on the RTX 4060 (device=0)
    print("[1/3] Loading Depth Anything V2 Small model into VRAM...")
    depth_pipe = pipeline(
        task="depth-estimation", 
        model="depth-anything/Depth-Anything-V2-Small-hf", 
        device=0
    )
    
    # 2. Fetch a test image (or replace this URL with a local path to a road image)
    print("[2/3] Fetching test street image...")
    url = 'http://images.cocodataset.org/val2017/000000039769.jpg'
    image = Image.open(requests.get(url, stream=True).raw)
    
    # 3. Run Inference
    print("[3/3] Running CUDA Depth Inference...")
    result = depth_pipe(image)
    
    # The pipeline returns a dictionary; extract the visual depth map
    depth_image = result["depth"]
    
    # Save the output
    depth_image.save("test_depth_map.png")
    print("\n[SUCCESS] AI executed! Depth map saved as test_depth_map.png. Check your VS Code file explorer!")

if __name__ == "__main__":
    test_depth_estimation()