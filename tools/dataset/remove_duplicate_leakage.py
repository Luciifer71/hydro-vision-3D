from pathlib import Path

# ============================================================
# HYDRO-VISION-3D
# REMOVE CROSS-SPLIT DUPLICATE LEAKAGE
# ============================================================

DATASET_DIR = Path("data/clean_dataset")

TRAIN_IMAGES = DATASET_DIR / "train" / "images"
TRAIN_LABELS = DATASET_DIR / "train" / "labels"

FILES_TO_REMOVE = [
    "annotate_0688_jpg.rf.fc6d23ce6325a0180f0b3c5c7f943f5e.jpg",
    "annotate_0690_jpg.rf.06b4d4509c8a37d9602e034b33dda8e9.jpg",
    "annotate_0692_jpg.rf.097e381240bc29fa5a9ede43aa308d00.jpg",
]


print("=" * 70)
print("HYDRO-VISION-3D DUPLICATE LEAKAGE REMOVAL")
print("=" * 70)

print("\nThese 3 TRAIN images are exact duplicates of")
print("images already present in VALIDATION.")

print("\nVALIDATION COPIES WILL BE KEPT.")
print("TRAIN COPIES WILL BE REMOVED.")

print("\nFiles:")

for filename in FILES_TO_REMOVE:
    print(f"  {filename}")


# ============================================================
# SAFETY CHECK
# ============================================================

if not TRAIN_IMAGES.exists():
    print("\nERROR: Train images directory not found.")
    raise SystemExit(1)

if not TRAIN_LABELS.exists():
    print("\nERROR: Train labels directory not found.")
    raise SystemExit(1)


# ============================================================
# REMOVE TRAIN COPIES
# ============================================================

removed_images = 0
removed_labels = 0

for filename in FILES_TO_REMOVE:

    image_path = TRAIN_IMAGES / filename

    label_path = TRAIN_LABELS / (
        Path(filename).stem + ".txt"
    )

    if image_path.exists():

        image_path.unlink()

        removed_images += 1

        print(f"\nRemoved image: {filename}")

    else:

        print(
            f"\nWARNING: Image not found: {filename}"
        )


    if label_path.exists():

        label_path.unlink()

        removed_labels += 1

        print(
            f"Removed label: "
            f"{label_path.name}"
        )

    else:

        print(
            f"WARNING: Label not found: "
            f"{label_path.name}"
        )


# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("REMOVAL COMPLETE")
print("=" * 70)

print(
    f"\nImages removed: {removed_images}"
)

print(
    f"Labels removed: {removed_labels}"
)

print("\nValidation copies were NOT modified.")

print("\nNo other dataset files were modified.")

print("=" * 70)