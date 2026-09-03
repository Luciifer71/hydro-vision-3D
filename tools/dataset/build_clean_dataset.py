from pathlib import Path
import shutil
import csv

# ============================================================
# HYDRO-VISION-3D
# FAST CLEAN DATASET BUILDER
# ============================================================

RAW_DATASET = Path(
    r"C:\Users\Krish\Downloads\Hydro-vision-merged.v2i.yolov8"
)

OUTPUT_DATASET = Path("data/clean_dataset")

KEYWORD_CSV = Path(
    "data/empty_image_analysis/keyword_groups.csv"
)

SPLITS = {
    "train": "train",
    "valid": "valid",
    "test": "test",
}

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp",
}


def load_excluded_images():

    excluded = set()

    if not KEYWORD_CSV.exists():
        print("ERROR: keyword_groups.csv not found.")
        return excluded

    with open(
        KEYWORD_CSV,
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:

            image_path = row["image"].strip()

            if image_path:
                excluded.add(
                    str(Path(image_path)).lower()
                )

    return excluded


def main():

    print("=" * 70)
    print("HYDRO-VISION-3D FAST CLEAN DATASET BUILDER")
    print("=" * 70)

    print("\nRAW DATASET:")
    print(RAW_DATASET)

    print("\nOUTPUT DATASET:")
    print(OUTPUT_DATASET)

    print("\nLoading confirmed irrelevant image list...")

    excluded_images = load_excluded_images()

    print(
        f"Confirmed irrelevant images: "
        f"{len(excluded_images)}"
    )

    print()
    print("RAW DATASET WILL NOT BE MODIFIED.")
    print()

    # --------------------------------------------------------
    # Create output structure
    # --------------------------------------------------------

    for split in SPLITS:

        (
            OUTPUT_DATASET
            / split
            / "images"
        ).mkdir(
            parents=True,
            exist_ok=True
        )

        (
            OUTPUT_DATASET
            / split
            / "labels"
        ).mkdir(
            parents=True,
            exist_ok=True
        )

    total_scanned = 0
    total_copied = 0
    total_excluded = 0
    total_empty_kept = 0
    total_annotated_kept = 0

    # --------------------------------------------------------
    # Process dataset
    # --------------------------------------------------------

    for output_split, raw_split in SPLITS.items():

        image_dir = RAW_DATASET / raw_split / "images"
        label_dir = RAW_DATASET / raw_split / "labels"

        print("-" * 70)
        print(f"PROCESSING {raw_split.upper()}")
        print("-" * 70)

        scanned = 0
        copied = 0
        excluded = 0
        empty_kept = 0
        annotated_kept = 0

        if not image_dir.exists():

            print("Image directory not found.")
            continue

        for image_path in image_dir.iterdir():

            if not image_path.is_file():
                continue

            if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            scanned += 1
            total_scanned += 1

            # ------------------------------------------------
            # Check exact path against confirmed irrelevant list
            # ------------------------------------------------

            normalized_path = str(
                image_path.resolve()
            ).lower()

            if normalized_path in excluded_images:

                excluded += 1
                total_excluded += 1

                continue

            # ------------------------------------------------
            # Find corresponding label
            # ------------------------------------------------

            label_path = (
                label_dir
                / f"{image_path.stem}.txt"
            )

            if not label_path.exists():

                print(
                    f"WARNING: Missing label: "
                    f"{image_path.name}"
                )

                continue

            # ------------------------------------------------
            # Determine whether empty or annotated
            # ------------------------------------------------

            label_content = label_path.read_text(
                encoding="utf-8",
                errors="ignore"
            ).strip()

            if label_content == "":
                empty_kept += 1
                total_empty_kept += 1
            else:
                annotated_kept += 1
                total_annotated_kept += 1

            # ------------------------------------------------
            # Destination
            # ------------------------------------------------

            destination_image = (
                OUTPUT_DATASET
                / output_split
                / "images"
                / image_path.name
            )

            destination_label = (
                OUTPUT_DATASET
                / output_split
                / "labels"
                / label_path.name
            )

            shutil.copy2(
                image_path,
                destination_image
            )

            shutil.copy2(
                label_path,
                destination_label
            )

            copied += 1
            total_copied += 1

        print(f"Scanned          : {scanned}")
        print(f"Copied           : {copied}")
        print(f"Excluded         : {excluded}")
        print(f"Empty kept       : {empty_kept}")
        print(f"Annotated kept   : {annotated_kept}")
        print()

    # --------------------------------------------------------
    # Create corrected data.yaml
    # --------------------------------------------------------

    yaml_content = """train: train/images
val: valid/images
test: test/images

nc: 6
names:
  0: cracks
  1: damaged_footpath
  2: drainage_overflow
  3: open_manhole
  4: potholes
  5: waterlogging_area
"""

    yaml_path = OUTPUT_DATASET / "data.yaml"

    yaml_path.write_text(
        yaml_content,
        encoding="utf-8"
    )

    # --------------------------------------------------------
    # Final summary
    # --------------------------------------------------------

    print("=" * 70)
    print("CLEAN DATASET COMPLETE")
    print("=" * 70)

    print(f"\nImages scanned       : {total_scanned}")
    print(f"Images copied        : {total_copied}")
    print(f"Images excluded      : {total_excluded}")
    print(f"Empty images kept    : {total_empty_kept}")
    print(f"Annotated images kept: {total_annotated_kept}")

    print("\nDataset location:")
    print(OUTPUT_DATASET.resolve())

    print("\nCreated:")
    print("  train/images")
    print("  train/labels")
    print("  valid/images")
    print("  valid/labels")
    print("  test/images")
    print("  test/labels")
    print("  data.yaml")

    print("\nRAW DATASET WAS NOT MODIFIED.")
    print("=" * 70)


if __name__ == "__main__":
    main()