from pathlib import Path
import torch
from ultralytics import YOLO


# ============================================================
# HYDRO-VISION-3D
# Canonical YOLO Training Script
# ============================================================

# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent

DATASET_YAML = (
    PROJECT_ROOT
    / "data"
    / "yolo_ready_dataset"
    / "data.yaml"
)

RUNS_DIR = PROJECT_ROOT / "runs"


# ------------------------------------------------------------
# Training configuration
# ------------------------------------------------------------

MODEL_WEIGHTS = "yolov8s.pt"

IMAGE_SIZE = 640
BATCH_SIZE = 8

MAX_EPOCHS = 1
PATIENCE = 40

SEED = 42

PROJECT_NAME = "hydro_vision_training"
RUN_NAME = "yolov8s_baseline"


# ============================================================
# DEVICE DETECTION
# ============================================================

def get_device():
    """
    Automatically select the best available device.

    CUDA → NVIDIA GPU
    MPS  → Apple Silicon
    CPU  → fallback
    """

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)

        print(f"[INFO] CUDA available")
        print(f"[INFO] GPU: {gpu_name}")

        return "cuda"

    if hasattr(torch.backends, "mps"):
        if torch.backends.mps.is_available():
            print("[INFO] Apple MPS available")
            return "mps"

    print("[WARNING] No GPU acceleration detected.")
    print("[WARNING] Falling back to CPU.")

    return "cpu"


# ============================================================
# MAIN TRAINING
# ============================================================

def main():

    print("=" * 70)
    print("HYDRO-VISION-3D")
    print("YOLOv8s Training")
    print("=" * 70)

    # --------------------------------------------------------
    # Validate dataset
    # --------------------------------------------------------

    if not DATASET_YAML.exists():
        raise FileNotFoundError(
            f"\nDataset configuration not found:\n"
            f"{DATASET_YAML}\n\n"
            f"Expected:\n"
            f"data/yolo_ready_dataset/data.yaml"
        )

    print(f"\n[INFO] Dataset:")
    print(f"       {DATASET_YAML}")

    # --------------------------------------------------------
    # Select device
    # --------------------------------------------------------

    device = get_device()

    # --------------------------------------------------------
    # Display configuration
    # --------------------------------------------------------

    print("\n[INFO] Training configuration")
    print(f"       Model       : {MODEL_WEIGHTS}")
    print(f"       Image size  : {IMAGE_SIZE}")
    print(f"       Batch size  : {BATCH_SIZE}")
    print(f"       Max epochs  : {MAX_EPOCHS}")
    print(f"       Patience    : {PATIENCE}")
    print(f"       Device      : {device}")
    print(f"       Seed        : {SEED}")

    # --------------------------------------------------------
    # Load model
    # --------------------------------------------------------

    print("\n[INFO] Loading YOLOv8s...")

    model = YOLO(MODEL_WEIGHTS)

    print("[INFO] Model loaded successfully.")

    # --------------------------------------------------------
    # Train
    # --------------------------------------------------------

    print("\n[INFO] Starting training...")
    print("[INFO] Early stopping patience:", PATIENCE)

    results = model.train(

        # Dataset
        data=str(DATASET_YAML),

        # Training duration
        epochs=MAX_EPOCHS,
        patience=PATIENCE,

        # Input
        imgsz=IMAGE_SIZE,

        # Hardware
        batch=BATCH_SIZE,
        device=device,

        # Mixed precision
        amp=True,

        # Reproducibility
        seed=SEED,

        # Validation
        val=True,

        # Checkpoints
        save=True,
        save_period=-1,

        # Output
        project=str(RUNS_DIR),
        name=RUN_NAME,
        exist_ok=True,

        # Workers
        workers=4,

        # Logging
        verbose=True,
    )

    # ========================================================
    # TRAINING COMPLETE
    # ========================================================

    run_directory = RUNS_DIR / RUN_NAME
    weights_directory = run_directory / "weights"

    best_model = weights_directory / "best.pt"
    last_model = weights_directory / "last.pt"

    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)

    print(f"\nRun directory:")
    print(f"  {run_directory}")

    print("\nBest model:")
    print(f"  {best_model}")

    print("\nLast model:")
    print(f"  {last_model}")

    if best_model.exists():
        print("\n[SUCCESS] best.pt created successfully.")

    else:
        print("\n[WARNING] best.pt was not found.")

    if last_model.exists():
        print("[SUCCESS] last.pt created successfully.")

    else:
        print("[WARNING] last.pt was not found.")


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == "__main__":
    main()