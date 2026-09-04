"""
HYDRO-VISION-3D — Domain-adaptation fine-tune
=============================================

The problem this solves, measured:
    open_manhole  validation mAP50 = 0.759
    open_manhole  real frame from our video, conf = 0.014

That is not a weak model. That is a model trained on a different visual world
than the one we deploy in. Our training data is street-level colour photography;
our footage is a mix of greyscale CCTV, aerial news video, compressed social
clips and drone shots. The organisers' video on Sept 8 could be any of those.

The fix is training data that looks like deployment, plus augmentation that
explicitly attacks the failure modes we observed (greyscale, blown-out,
compressed, varied altitude and angle).

IMPORTANT: this starts from best.pt and writes to a NEW run directory.
Your current model is never overwritten.

Usage:
    python scripts/finetune.py
    python scripts/finetune.py --epochs 50 --base best.pt
"""

import argparse
import shutil
import sys
from pathlib import Path

import torch
from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent

CLASS_NAMES = ["cracks", "damaged_footpath", "drainage_overflow",
               "open_manhole", "potholes", "waterlogging_area"]


def device():
    if torch.cuda.is_available():
        print(f"[INFO] CUDA: {torch.cuda.get_device_name(0)}")
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        print("[INFO] Apple MPS")
        return "mps"
    print("[WARNING] No GPU. This will be slow.")
    return "cpu"


def check_dataset(yaml_path: Path) -> None:
    """Fail loudly on a class-order mismatch. A silent mismatch would train
    the model to call potholes 'cracks' and would be very hard to spot later."""
    import yaml
    if not yaml_path.exists():
        print(f"ERROR: dataset config not found: {yaml_path}")
        print("Export from Roboflow as YOLOv8 and unzip to data/finetune_dataset/")
        sys.exit(1)

    cfg = yaml.safe_load(yaml_path.read_text())
    names = cfg.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]

    if names != CLASS_NAMES:
        print("ERROR: class names/order do not match the deployed model.")
        print(f"  expected: {CLASS_NAMES}")
        print(f"  found   : {names}")
        print("\nFix the Roboflow class order before training. A mismatch here")
        print("silently corrupts every prediction the model makes.")
        sys.exit(1)

    print(f"[OK] 6 classes, correct order.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="best.pt",
                    help="model to fine-tune FROM (not overwritten)")
    ap.add_argument("--data", default="data/finetune_dataset/data.yaml")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--lr", type=float, default=0.0008,
                    help="low LR: adapt, don't destroy what already works")
    ap.add_argument("--name", default="domain_adapt_v1")
    args = ap.parse_args()

    base = ROOT / args.base
    if not base.exists():
        print(f"ERROR: base model not found: {base}")
        sys.exit(1)

    data_yaml = ROOT / args.data
    check_dataset(data_yaml)

    # Never lose the model that currently works.
    backup = ROOT / "models" / "best_PRE_FINETUNE.pt"
    backup.parent.mkdir(exist_ok=True)
    if not backup.exists():
        shutil.copy(base, backup)
        print(f"[SAFETY] Current model backed up -> {backup}")

    dev = device()

    print(f"\n{'='*66}")
    print("DOMAIN-ADAPTATION FINE-TUNE")
    print(f"{'='*66}")
    print(f"  base model : {base.name}")
    print(f"  dataset    : {data_yaml}")
    print(f"  epochs     : {args.epochs}")
    print(f"  lr0        : {args.lr}  (low — preserve existing capability)")
    print(f"  output     : runs/{args.name}/weights/best.pt")
    print(f"{'='*66}\n")

    model = YOLO(str(base))

    model.train(
        data=str(data_yaml),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=dev,
        patience=15,
        seed=42,
        amp=True,
        val=True,
        save=True,
        project=str(ROOT / "runs"),
        name=args.name,
        exist_ok=False,          # never silently overwrite a previous run

        # Low LR + warmup: we are adapting a working model, not training one
        # from scratch. A high LR here would wipe out the pothole performance
        # that already works.
        lr0=args.lr,
        lrf=0.01,
        warmup_epochs=3,

        # --- Augmentation aimed at the failures we measured ---
        # Saturation is the big one: our footage includes greyscale CCTV and
        # the model currently leans on colour cues it will not always have.
        hsv_h=0.020,
        hsv_s=0.90,      # heavy — forces colour-independent features
        hsv_v=0.60,      # dark and blown-out frames
        degrees=15.0,    # camera/gimbal angle variation
        translate=0.15,
        scale=0.60,      # altitude and zoom variation
        shear=3.0,
        perspective=0.0008,   # oblique vs nadir viewing angle
        flipud=0.10,
        fliplr=0.50,
        mosaic=1.00,
        mixup=0.10,
        copy_paste=0.10,
        erasing=0.20,    # occlusion and compression damage
        close_mosaic=10,

        workers=4,
        verbose=True,
    )

    out = ROOT / "runs" / args.name / "weights" / "best.pt"
    print(f"\n{'='*66}")
    print("FINE-TUNE COMPLETE")
    print(f"{'='*66}")
    print(f"New model : {out}")
    print(f"Fallback  : {backup}")
    print("""
DO NOT deploy this blindly. Compare both models first:

    python scripts/compare_models.py

Then probe the frames that previously failed:

    python scripts/probe_frames.py     (point it at the new weights)

Deploy the new model ONLY if it improves the failing classes WITHOUT
losing pothole performance. If potholes regressed, lower --lr and retry.
""")


if __name__ == "__main__":
    main()