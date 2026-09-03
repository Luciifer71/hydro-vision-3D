from pathlib import Path
import shutil

# ============================================================
# CONFIGURATION
# ============================================================

SOURCE = Path("data/final_dataset")
OUTPUT = Path("data/yolo_ready_dataset")

CLASS_NAMES = {
    0: "cracks",
    1: "damaged_footpath",
    2: "drainage_overflow",
    3: "open_manhole",
    4: "potholes",
    5: "waterlogging_area",
}

# ============================================================
# CONVERT ONE LABEL FILE
# ============================================================

def convert_label(src_label, dst_label):
    """
    Converts:
      Standard YOLO box:
        class cx cy w h

      Polygon/OBB:
        class x1 y1 x2 y2 x3 y3 ...

    into standard YOLO:
        class cx cy w h

    Coordinates are assumed to be normalized [0, 1].
    """

    converted_lines = []
    polygon_count = 0
    box_count = 0

    if not src_label.exists():
        dst_label.touch()
        return 0, 0

    with open(src_label, "r", encoding="utf-8") as f:
        lines = f.readlines()

    for line_number, line in enumerate(lines, start=1):

        parts = line.strip().split()

        if not parts:
            continue

        try:
            class_id = int(float(parts[0]))
        except ValueError:
            raise ValueError(
                f"Invalid class ID in {src_label} line {line_number}"
            )

        coordinates = parts[1:]

        # ----------------------------------------------------
        # Standard YOLO bounding box
        # ----------------------------------------------------

        if len(coordinates) == 4:

            try:
                x = float(coordinates[0])
                y = float(coordinates[1])
                w = float(coordinates[2])
                h = float(coordinates[3])
            except ValueError:
                raise ValueError(
                    f"Invalid numeric coordinates in "
                    f"{src_label} line {line_number}"
                )

            converted_lines.append(
                f"{class_id} {x:.6f} {y:.6f} {w:.6f} {h:.6f}\n"
            )

            box_count += 1

        # ----------------------------------------------------
        # Polygon / OBB
        # ----------------------------------------------------

        elif len(coordinates) >= 6 and len(coordinates) % 2 == 0:

            try:
                coords = [float(v) for v in coordinates]
            except ValueError:
                raise ValueError(
                    f"Invalid polygon coordinates in "
                    f"{src_label} line {line_number}"
                )

            xs = coords[0::2]
            ys = coords[1::2]

            min_x = min(xs)
            max_x = max(xs)
            min_y = min(ys)
            max_y = max(ys)

            # Convert polygon bounds into YOLO box
            center_x = (min_x + max_x) / 2
            center_y = (min_y + max_y) / 2
            width = max_x - min_x
            height = max_y - min_y

            converted_lines.append(
                f"{class_id} "
                f"{center_x:.6f} "
                f"{center_y:.6f} "
                f"{width:.6f} "
                f"{height:.6f}\n"
            )

            polygon_count += 1

        else:

            raise ValueError(
                f"Unsupported annotation format in "
                f"{src_label} line {line_number}: "
                f"{len(parts)} values"
            )

    with open(dst_label, "w", encoding="utf-8") as f:
        f.writelines(converted_lines)

    return box_count, polygon_count


# ============================================================
# MAIN
# ============================================================

print("=" * 70)
print("HYDRO-VISION-3D → YOLO DATASET CONVERTER")
print("=" * 70)

print(f"\nSource : {SOURCE}")
print(f"Output : {OUTPUT}")

if not SOURCE.exists():
    raise FileNotFoundError(
        f"Source dataset not found: {SOURCE}"
    )

if not OUTPUT.exists():
    OUTPUT.mkdir(parents=True)

# ------------------------------------------------------------
# Prevent accidental overwrite
# ------------------------------------------------------------

existing_files = list(OUTPUT.rglob("*"))

if existing_files:
    raise RuntimeError(
        "\nOutput directory is not empty.\n"
        f"Please empty {OUTPUT} before running this script.\n"
        "Nothing was modified."
    )

# ============================================================
# CREATE SPLITS
# ============================================================

total_images = 0
total_labels = 0
total_boxes = 0
total_polygons = 0
total_empty = 0

for split in ["train", "valid", "test"]:

    print("\n" + "-" * 70)
    print(f"PROCESSING: {split.upper()}")
    print("-" * 70)

    source_images = SOURCE / split / "images"
    source_labels = SOURCE / split / "labels"

    output_images = OUTPUT / split / "images"
    output_labels = OUTPUT / split / "labels"

    output_images.mkdir(parents=True, exist_ok=True)
    output_labels.mkdir(parents=True, exist_ok=True)

    images = [
        p for p in source_images.iterdir()
        if p.is_file()
        and p.suffix.lower() in {
            ".jpg",
            ".jpeg",
            ".png",
            ".bmp",
            ".webp",
        }
    ]

    split_boxes = 0
    split_polygons = 0
    split_empty = 0

    for image_path in images:

        label_path = source_labels / f"{image_path.stem}.txt"

        # Copy image unchanged
        shutil.copy2(
            image_path,
            output_images / image_path.name
        )

        total_images += 1

        if not label_path.exists():
            # Should not happen, but keep dataset structurally valid
            destination_label = (
                output_labels / f"{image_path.stem}.txt"
            )
            destination_label.touch()

            split_empty += 1
            total_empty += 1
            total_labels += 1

            continue

        # Check whether label is empty
        if label_path.stat().st_size == 0:

            destination_label = (
                output_labels / label_path.name
            )

            destination_label.touch()

            split_empty += 1
            total_empty += 1
            total_labels += 1

            continue

        destination_label = (
            output_labels / label_path.name
        )

        boxes, polygons = convert_label(
            label_path,
            destination_label
        )

        split_boxes += boxes
        split_polygons += polygons

        total_boxes += boxes
        total_polygons += polygons
        total_labels += 1

    print(f"Images copied      : {len(images):,}")
    print(f"Labels processed   : {len(images):,}")
    print(f"Standard boxes     : {split_boxes:,}")
    print(f"Polygons converted : {split_polygons:,}")
    print(f"Empty labels       : {split_empty:,}")

# ============================================================
# WRITE DATA.YAML
# ============================================================

yaml_path = OUTPUT / "data.yaml"

yaml_text = """train: train/images
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

with open(yaml_path, "w", encoding="utf-8") as f:
    f.write(yaml_text)

# ============================================================
# WRITE CONVERSION REPORT
# ============================================================

report_path = OUTPUT / "conversion_report.txt"

with open(report_path, "w", encoding="utf-8") as f:

    f.write("Hydro-Vision-3D YOLO Conversion Report\n")
    f.write("=" * 50 + "\n\n")

    f.write(f"Source dataset: {SOURCE}\n")
    f.write(f"Output dataset: {OUTPUT}\n\n")

    f.write(f"Total images: {total_images:,}\n")
    f.write(f"Total labels: {total_labels:,}\n")
    f.write(f"Standard boxes preserved: {total_boxes:,}\n")
    f.write(f"Polygons converted: {total_polygons:,}\n")
    f.write(f"Empty labels: {total_empty:,}\n")

# ============================================================
# FINAL SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("CONVERSION COMPLETE")
print("=" * 70)

print(f"\nTotal images           : {total_images:,}")
print(f"Total labels           : {total_labels:,}")
print(f"Standard boxes kept    : {total_boxes:,}")
print(f"Polygons converted     : {total_polygons:,}")
print(f"Empty labels           : {total_empty:,}")

print(f"\nYOLO-ready dataset:")
print(f"  {OUTPUT}")

print("\nCreated:")
print(f"  {OUTPUT / 'data.yaml'}")
print(f"  {OUTPUT / 'conversion_report.txt'}")

print("\nOriginal datasets were NOT modified.")