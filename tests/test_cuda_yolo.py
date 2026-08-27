import torch
from ultralytics import YOLO


def test_gpu_and_yolo():
    print("=" * 60)
    print("       HYDRO-VISION 3D: CUDA & YOLO HARDWARE TEST        ")
    print("=" * 60)

    # 1. Check PyTorch CUDA availability
    cuda_available = torch.cuda.is_available()
    print(f"[1/3] PyTorch CUDA Available: {cuda_available}")

    if cuda_available:
        gpu_name = torch.cuda.get_device_name(0)
        print(f"      Detected GPU: {gpu_name}")
    else:
        print("      [WARN] CUDA is not active. PyTorch is running on CPU!")
        return

    # 2. Load Lightweight YOLO Model
    print("\n[2/3] Loading YOLOv8n model...")
    model = YOLO("yolov8n.pt")

    # 3. Execute 1-Epoch Dry-Run Test on COCO8 micro-dataset
    print("\n[3/3] Running 1-Epoch CUDA Test Run on RTX 4060...")
    model.train(data="coco8.yaml", epochs=1, imgsz=640, device=0, verbose=True)

    print("\n[SUCCESS] RTX 4060 CUDA pipeline verified! Ready for training.")


if __name__ == "__main__":
    test_gpu_and_yolo()