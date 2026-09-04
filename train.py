from pathlib import Path
import sys
import torch
from ultralytics import YOLO


# ============================================================
# HYDRO-VISION-3D
# Canonical YOLO Training Script — 5-class taxonomy
# ============================================================
#
# Changed from the 6-class run:
#   - dataset      : yolo_ready_dataset -> final_dataset_v2
#   - classes      : 6 -> 5 (cracks removed)
#   - run name     : yolov8s_baseline -> yolov8s_5class
#   - exist_ok     : True -> False (never silently overwrite a finished run)
#   - augmentation : heavy saturation/brightness jitter
#
# Why the augmentation change: the previous model scored mAP50 0.759 on
# open_manhole in validation but 0.014 on a real manhole in our own footage.
# That gap is domain shift — our training data is colour street-level
# photography, our deployment footage includes greyscale CCTV, aerial news
# video and compressed clips. High hsv_s forces the model to learn features
# that do not depend on colour.
# ============================================================


# ------------------------------------------------------------
# Paths
# ------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent

DATASET_YAML = (
    PROJECT_ROOT
    / "data"
    / "final_dataset_v2"
    / "data.yaml"
)

RUNS_DIR = PROJECT_ROOT / "runs"


# ------------------------------------------------------------
# Training configuration
# ------------------------------------------------------------

MODEL_WEIGHTS = "yolov8s.pt"

IMAGE_SIZE = 640
BATCH_SIZE = 16

MAX_EPOCHS = 150
PATIENCE = 25

SEED = 42

RUN_NAME = "yolov8s_5class"

EXPECTED_CLASSES = [
    "damaged_footpath",
    "drainage_overflow",
    "open_manhole",
    "potholes",
    "waterlogging_area",
]


# ============================================================
# DEVICE DETECTION
# ============================================================

def get_device():
    """CUDA -> NVIDIA GPU, MPS -> Apple Silicon, else CPU."""

    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"[INFO] CUDA available")
        print(f"[INFO] GPU: {gpu_name} ({vram:.1f} GB)")
        return "cuda"

    if hasattr(torch.backends, "mps"):
        if torch.backends.mps.is_available():
            print("[INFO] Apple MPS available")
            return "mps"

    print("[WARNING] No GPU acceleration detected.")
    print("[WARNING] Falling back to CPU. This will take many hours.")
    return "cpu"


# ============================================================
# DATASET VALIDATION
# ============================================================

def validate_dataset():
    """Fail before training, not four hours into it.

    A silent class-order mismatch is the worst failure mode here: nothing
    errors, and the model learns to call potholes 'drainage_overflow'.
    """

    if not DATASET_YAML.exists():
        raise FileNotFoundError(
            f"\nDataset config not found:\n  {DATASET_YAML}\n\n"
            f"Extract the Roboflow export to data/final_dataset_v2/"
        )

    try:
        import yaml
    except ImportError:
        print("[WARNING] pyyaml not installed; skipping config validation.")
        return

    cfg = yaml.safe_load(DATASET_YAML.read_text())

    names = cfg.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]

    nc = cfg.get("nc")

    if nc != len(EXPECTED_CLASSES):
        raise ValueError(
            f"\nnc mismatch: yaml says {nc}, expected {len(EXPECTED_CLASSES)}"
        )

    if names != EXPECTED_CLASSES:
        raise ValueError(
            f"\nClass names or order do not match.\n"
            f"  expected: {EXPECTED_CLASSES}\n"
            f"  found   : {names}\n\n"
            f"Fix data.yaml before training. A mismatch here silently\n"
            f"corrupts every prediction the model will ever make."
        )

    # Roboflow writes '../train/images', which resolves outside the dataset
    # folder and fails. Catch it here rather than as a confusing scan error.
    for key in ("train", "val", "test"):
        val = cfg.get(key)
        if val and str(val).startswith(".."):
            raise ValueError(
                f"\ndata.yaml '{key}' starts with '..' ({val}).\n"
                f"Change it to '{str(val).lstrip('./')}' — paths resolve\n"
                f"relative to the yaml file's own directory."
            )

    # Confirm the split folders actually exist and hold images.
    base = DATASET_YAML.parent
    for key in ("train", "val"):
        p = base / cfg[key]
        if not p.exists():
            raise FileNotFoundError(f"\nSplit folder missing: {p}")
        n = sum(1 for _ in p.glob("*.jpg")) + sum(1 for _ in p.glob("*.png"))
        if n == 0:
            raise ValueError(f"\nNo images found in {p}")
        print(f"[OK] {key:5s}: {n} images")

    print(f"[OK] {nc} classes, correct names and order.")


# ============================================================
# MAIN TRAINING
# ============================================================

def main():

    print("=" * 70)
    print("HYDRO-VISION-3D — YOLOv8s Training (5 classes)")
    print("=" * 70)

    validate_dataset()

    print(f"\n[INFO] Dataset : {DATASET_YAML}")

    device = get_device()

    print("\n[INFO] Training configuration")
    print(f"       Model       : {MODEL_WEIGHTS}")
    print(f"       Image size  : {IMAGE_SIZE}")
    print(f"       Batch size  : {BATCH_SIZE}")
    print(f"       Max epochs  : {MAX_EPOCHS}")
    print(f"       Patience    : {PATIENCE}")
    print(f"       Device      : {device}")
    print(f"       Seed        : {SEED}")
    print(f"       Run name    : {RUN_NAME}")

    run_directory = RUNS_DIR / RUN_NAME
    if run_directory.exists():
        print(f"\n[ERROR] Run directory already exists:\n  {run_directory}")
        print("Rename RUN_NAME or move the old run. Refusing to overwrite")
        print("weights that may be the only copy.")
        sys.exit(1)

    print("\n[INFO] Class balance note:")
    print("       waterlogging_area 13,219 | potholes 8,094 | damaged_footpath 624")
    print("       open_manhole 432 | drainage_overflow 202")
    print("       That is a 65:1 imbalance. Expect the three small classes to")
    print("       train weakly. Report per-class metrics, not just overall mAP.")

    print("\n[INFO] Loading YOLOv8s...")
    model = YOLO(MODEL_WEIGHTS)
    print("[INFO] Model loaded.")

    print("\n[INFO] Starting training...")

    model.train(

        # Dataset
        data=str(DATASET_YAML),

        # Duration
        epochs=MAX_EPOCHS,
        patience=PATIENCE,

        # Input
        imgsz=IMAGE_SIZE,

        # Hardware
        batch=BATCH_SIZE,
        device=device,
        amp=True,
        workers=4,

        # Reproducibility
        seed=SEED,

        # Validation and checkpoints
        val=True,
        save=True,
        save_period=-1,

        # Output — exist_ok False so a rerun cannot destroy a finished run
        project=str(RUNS_DIR),
        name=RUN_NAME,
        exist_ok=False,

        # ---- Augmentation: aimed at cross-domain robustness ----
        # Our footage spans colour drone video, greyscale CCTV and compressed
        # social clips. These force the model to generalise across all of it.
        hsv_h=0.015,
        hsv_s=0.90,        # heavy — breaks reliance on colour cues
        hsv_v=0.55,        # dark and blown-out frames
        degrees=12.0,      # gimbal / camera angle variation
        translate=0.12,
        scale=0.55,        # altitude and zoom variation
        shear=2.0,
        perspective=0.0006,  # oblique vs nadir viewpoint
        flipud=0.10,
        fliplr=0.50,
        mosaic=1.00,
        mixup=0.10,
        copy_paste=0.10,
        erasing=0.20,      # occlusion and compression artefacts
        close_mosaic=10,   # disable mosaic for the last 10 epochs

        verbose=True,
    )

    # ========================================================

    weights_directory = run_directory / "weights"
    best_model = weights_directory / "best.pt"
    last_model = weights_directory / "last.pt"

    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)
    print(f"\nRun directory : {run_directory}")
    print(f"Best model    : {best_model}")
    print(f"Last model    : {last_model}")

    print("\n[SUCCESS] best.pt created." if best_model.exists()
          else "\n[WARNING] best.pt not found.")
    print("[SUCCESS] last.pt created." if last_model.exists()
          else "[WARNING] last.pt not found.")

    print("""
SEND BACK
---------
  runs/yolov8s_5class/weights/best.pt
  runs/yolov8s_5class/weights/last.pt
  runs/yolov8s_5class/results.csv        <- proves which run produced it
  the final per-class validation table from this terminal

Do not rename best.pt. Do not send only best.pt without results.csv.
""")


if __name__ == "__main__":
    main()