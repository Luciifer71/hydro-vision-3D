from pathlib import Path
import shutil

# ============================================================
# HYDRO-VISION-3D
# QUARANTINE IRRELEVANT EMPTY-LABEL IMAGES
# ============================================================

DATASET_DIR = Path(r"C:\Users\Krish\Downloads\Hydro-vision-merged.v2i.yolov8")

QUARANTINE_DIR = Path("data/quarantine/irrelevant_empty")

SUSPICIOUS_KEYWORDS = {
    "paper",
    "glass",
    "plastic",
    "cardboard",
    "furniture",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

SPLITS = ["train", "valid", "test"]


def is_empty_label(label_path):
    """Return True if label file exists and contains no annotations."""
    if not label_path.exists():
        return False

    return label_path.read_text(encoding="utf-8").strip() == ""


def main():

    print("=" * 70)
    print("HYDRO-VISION-3D EMPTY IMAGE QUARANTINE")
    print("=" * 70)

    print("\nIMPORTANT:")
    print("RAW DATASET WILL NOT BE MODIFIED.")
    print("Images will be COPIED to quarantine, not deleted.")
    print()

    total_quarantined = 0

    for split in SPLITS:

        image_dir = DATASET_DIR / split / "images"
        label_dir = DATASET_DIR / split / "labels"

        if not image_dir.exists():
            print(f"Skipping {split}: image directory not found.")
            continue

        split_count = 0

        for image_path in image_dir.iterdir():

            if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            # Only consider images whose labels are empty
            label_path = label_dir / f"{image_path.stem}.txt"

            if not is_empty_label(label_path):
                continue

            filename_lower = image_path.name.lower()

            matched_keyword = None

            for keyword in SUSPICIOUS_KEYWORDS:
                if keyword in filename_lower:
                    matched_keyword = keyword
                    break

            if matched_keyword is None:
                continue

            # Preserve original train/valid/test structure
            destination_dir = (
                QUARANTINE_DIR
                / split
                / matched_keyword
            )

            destination_dir.mkdir(parents=True, exist_ok=True)

            destination_path = destination_dir / image_path.name

            # Avoid accidental overwrite
            if destination_path.exists():
                counter = 1

                while True:
                    new_name = (
                        f"{image_path.stem}_{counter}"
                        f"{image_path.suffix}"
                    )

                    destination_path = destination_dir / new_name

                    if not destination_path.exists():
                        break

                    counter += 1

            # COPY only — raw dataset remains untouched
            shutil.copy2(image_path, destination_path)

            split_count += 1
            total_quarantined += 1

        print(f"{split:7s}: {split_count} images quarantined")

    print()
    print("=" * 70)
    print("QUARANTINE COMPLETE")
    print("=" * 70)

    print(f"\nTotal images quarantined: {total_quarantined}")

    print("\nQuarantine location:")
    print(QUARANTINE_DIR.resolve())

    print("\nRAW DATASET WAS NOT MODIFIED.")
    print("No images were deleted.")
    print("No labels were deleted.")
    print()


if __name__ == "__main__":
    main()