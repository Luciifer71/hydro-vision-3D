from pathlib import Path
import sys
import torch
import yaml
from ultralytics import YOLO


# ============================================================
# HYDRO-VISION-3D
# Canonical YOLOv8m Training Script — 5-class detection
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parent

DATASET_DIR = (
    PROJECT_ROOT
    / "data"
    / "5th_sept_final_dataset_combined"
    / "final_dataset"
)

DATASET_YAML = DATASET_DIR / "data.yaml"
RUNS_DIR = PROJECT_ROOT / "runs"


# ------------------------------------------------------------
# Training configuration
# ------------------------------------------------------------

MODEL_WEIGHTS = "yolov8m.pt"

IMAGE_SIZE = 640

MAX_EPOCHS = 150
PATIENCE = 25

SEED = 42

RUN_NAME = "yolov8m_final_dataset"

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

    # 1. NVIDIA CUDA
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)

        print("[INFO] CUDA available")
        print(f"[INFO] GPU: {gpu_name} ({vram:.1f} GB)")

        return "cuda", 8, 4, True

    # 2. Apple Silicon MPS
    if hasattr(torch.backends, "mps"):
        if torch.backends.mps.is_available():
            print("[INFO] Apple MPS available")
            print("[INFO] Using Apple Silicon GPU")

            return "mps", 12, 2, False

    # 3. CPU fallback
    print("[WARNING] No CUDA or MPS acceleration detected.")
    print("[WARNING] Falling back to CPU.")
    print("[WARNING] Training will be significantly slower.")

    return "cpu", 4, 2, False


# ============================================================
# DATASET VALIDATION
# ============================================================

def validate_dataset():

    if not DATASET_DIR.exists():
        raise FileNotFoundError(
            f"\nDataset directory not found:\n{DATASET_DIR}"
        )

    if not DATASET_YAML.exists():
        raise FileNotFoundError(
            f"\nDataset YAML not found:\n{DATASET_YAML}"
        )

    cfg = yaml.safe_load(DATASET_YAML.read_text())

    names = cfg.get("names")

    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]

    nc = cfg.get("nc")

    # ---- Class validation ----

    if nc != len(EXPECTED_CLASSES):
        raise ValueError(
            f"\nnc mismatch: YAML says {nc}, "
            f"expected {len(EXPECTED_CLASSES)}"
        )

    if names != EXPECTED_CLASSES:
        raise ValueError(
            "\nClass names/order mismatch.\n"
            f"Expected: {EXPECTED_CLASSES}\n"
            f"Found:    {names}"
        )

    # ---- Path validation ----

    yaml_path = str(cfg.get("path", "")).strip()

    if yaml_path not in ("", "."):
        print(f"[WARNING] data.yaml path = {yaml_path}")

        if Path(yaml_path).is_absolute():
            raise ValueError(
                "\ndata.yaml contains an absolute machine-specific path:\n"
                f"  {yaml_path}\n\n"
                "Change it to:\n"
                "  path: ."
            )

    # ---- Split validation ----

    split_counts = {}

    for split in ("train", "val", "test"):

        split_value = cfg.get(split)

        if not split_value:
            raise ValueError(f"\nMissing '{split}' path in data.yaml")

        image_dir = DATASET_DIR / split_value
        label_dir = DATASET_DIR / split / "labels"

        if not image_dir.exists():
            raise FileNotFoundError(
                f"\n{split} image directory missing:\n{image_dir}"
            )

        if not label_dir.exists():
            raise FileNotFoundError(
                f"\n{split} label directory missing:\n{label_dir}"
            )

        images = [
            p for p in image_dir.iterdir()
            if p.suffix.lower() in {
                ".jpg", ".jpeg", ".png", ".bmp", ".webp"
            }
        ]

        labels = list(label_dir.glob("*.txt"))

        if not images:
            raise ValueError(f"\nNo images found in {image_dir}")

        if not labels:
            raise ValueError(f"\nNo labels found in {label_dir}")

        split_counts[split] = {
            "images": len(images),
            "labels": len(labels),
        }

        print(
            f"[OK] {split:5s}: "
            f"{len(images)} images, "
            f"{len(labels)} label files"
        )

    # ---- Annotation validation ----

    class_counts = {i: 0 for i in range(len(EXPECTED_CLASSES))}

    total_boxes = 0

    for split in ("train", "val", "test"):

        label_dir = DATASET_DIR / split / "labels"

        for label_file in label_dir.glob("*.txt"):

            for line_number, line in enumerate(
                label_file.read_text().splitlines(),
                start=1
            ):

                line = line.strip()

                if not line:
                    continue

                parts = line.split()

                if len(parts) != 5:
                    raise ValueError(
                        f"\nInvalid detection annotation:\n"
                        f"{label_file}:{line_number}\n"
                        f"Expected 5 values, found {len(parts)}"
                    )

                try:
                    class_id = int(parts[0])
                    values = [float(v) for v in parts[1:]]
                except ValueError:
                    raise ValueError(
                        f"\nNon-numeric annotation:\n"
                        f"{label_file}:{line_number}"
                    )

                if not 0 <= class_id < len(EXPECTED_CLASSES):
                    raise ValueError(
                        f"\nInvalid class ID {class_id}:\n"
                        f"{label_file}:{line_number}"
                    )

                if not all(0.0 <= v <= 1.0 for v in values):
                    raise ValueError(
                        f"\nCoordinates outside [0,1]:\n"
                        f"{label_file}:{line_number}"
                    )

                if values[2] <= 0 or values[3] <= 0:
                    raise ValueError(
                        f"\nZero/negative box size:\n"
                        f"{label_file}:{line_number}"
                    )

                class_counts[class_id] += 1
                total_boxes += 1

    print("\n[OK] Annotation format:")
    print("     Detection boxes only")
    print("     Polygons: 0")
    print("     Mixed files: 0")

    print("\n[INFO] Class distribution:")

    for class_id, name in enumerate(EXPECTED_CLASSES):
        print(f"       {name:22s}: {class_counts[class_id]}")

    print(f"\n[OK] Total bounding boxes: {total_boxes}")
    print(f"[OK] {nc} classes, correct names and order.")


# ============================================================
# MAIN TRAINING
# ============================================================

def main():

    print("=" * 70)
    print("HYDRO-VISION-3D — YOLOv8m Training")
    print("=" * 70)

    validate_dataset()

    device, batch_size, workers, amp = get_device()

    print("\n[INFO] Training configuration")
    print(f"       Dataset      : {DATASET_DIR}")
    print(f"       Model        : {MODEL_WEIGHTS}")
    print(f"       Image size   : {IMAGE_SIZE}")
    print(f"       Batch size   : {batch_size}")
    print(f"       Max epochs   : {MAX_EPOCHS}")
    print(f"       Patience     : {PATIENCE}")
    print(f"       Device       : {device}")
    print(f"       Workers      : {workers}")
    print(f"       AMP          : {amp}")
    print(f"       Seed         : {SEED}")
    print(f"       Run name     : {RUN_NAME}")

    run_directory = RUNS_DIR / RUN_NAME

    if run_directory.exists():
        print(
            f"\n[ERROR] Run directory already exists:\n"
            f"  {run_directory}"
        )
        print("\nRefusing to overwrite an existing run.")
        sys.exit(1)

    print("\n[INFO] Loading YOLOv8m...")
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
        batch=batch_size,
        device=device,
        workers=workers,
        amp=amp,

        # Reproducibility
        seed=SEED,

        # Validation/checkpoints
        val=True,
        save=True,
        save_period=-1,

        # Output
        project=str(RUNS_DIR),
        name=RUN_NAME,
        exist_ok=False,

        # ----------------------------------------------------
        # Augmentation
        # ----------------------------------------------------

        hsv_h=0.015,
        hsv_s=0.90,
        hsv_v=0.55,

        degrees=12.0,
        translate=0.12,
        scale=0.55,
        shear=2.0,
        perspective=0.0006,

        flipud=0.10,
        fliplr=0.50,

        mosaic=1.00,
        mixup=0.10,
        copy_paste=0.10,
        erasing=0.20,

        close_mosaic=10,

        verbose=True,
    )

    # ========================================================
    # TRAINING RESULT
    # ========================================================

    weights_directory = run_directory / "weights"

    best_model = weights_directory / "best.pt"
    last_model = weights_directory / "last.pt"
    results_csv = run_directory / "results.csv"

    print("\n" + "=" * 70)
    print("TRAINING COMPLETE")
    print("=" * 70)

    print(f"\nRun directory : {run_directory}")
    print(f"Best model    : {best_model}")
    print(f"Last model    : {last_model}")
    print(f"Results CSV   : {results_csv}")

    print(
        "\n[SUCCESS] best.pt created."
        if best_model.exists()
        else "\n[WARNING] best.pt not found."
    )

    print(
        "[SUCCESS] last.pt created."
        if last_model.exists()
        else "[WARNING] last.pt not found."
    )


if __name__ == "__main__":
    main()