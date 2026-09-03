from pathlib import Path
from collections import Counter


# ============================================================
# HYDRO-VISION-3D
# ANNOTATION FORMAT ANALYZER
# ============================================================
#
# IMPORTANT:
# This script ONLY analyzes annotation files.
#
# It does NOT:
#   - delete files
#   - move files
#   - rename files
#   - modify labels
#   - modify images
#
# It checks:
#   1. Standard YOLO bounding boxes
#   2. Polygon / OBB-style annotations
#   3. Invalid annotation formats
#
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_DIR = Path(
    r"data\clean_dataset"
)

SPLITS = {
    "train": "train",
    "valid": "valid",
    "test": "test",
}

EXPECTED_CLASSES = [
    "cracks",
    "damaged_footpath",
    "drainage_overflow",
    "open_manhole",
    "potholes",
    "waterlogging_area",
]


# ============================================================
# START
# ============================================================

print()
print("=" * 70)
print("HYDRO-VISION-3D ANNOTATION FORMAT ANALYZER")
print("=" * 70)

print()
print("Dataset:")
print(DATASET_DIR)

print()
print("IMPORTANT:")
print("No files will be deleted.")
print("No files will be moved.")
print("No files will be modified.")


# ============================================================
# CHECK DATASET
# ============================================================

if not DATASET_DIR.exists():

    print()
    print("ERROR: Dataset directory not found.")

    raise SystemExit(1)


# ============================================================
# STATISTICS
# ============================================================

format_counts = Counter()

class_format_counts = {
    class_name: Counter()
    for class_name in EXPECTED_CLASSES
}

split_format_counts = {
    split: Counter()
    for split in SPLITS
}

invalid_examples = []

total_label_files = 0
total_annotation_lines = 0


# ============================================================
# ANALYZE LABELS
# ============================================================

for split_name, folder_name in SPLITS.items():

    print()
    print("-" * 70)
    print(f"ANALYZING: {split_name.upper()}")
    print("-" * 70)

    labels_dir = (
        DATASET_DIR
        / folder_name
        / "labels"
    )

    if not labels_dir.exists():

        print("Labels directory not found.")
        continue


    split_labels = 0
    split_annotations = 0


    for label_path in labels_dir.glob("*.txt"):

        total_label_files += 1
        split_labels += 1

        try:

            text = label_path.read_text(
                encoding="utf-8",
                errors="replace"
            )

        except Exception as e:

            format_counts["read_error"] += 1
            split_format_counts[split_name]["read_error"] += 1

            invalid_examples.append(
                (
                    split_name,
                    str(label_path),
                    f"read_error: {e}"
                )
            )

            continue


        # ----------------------------------------------------
        # Empty label
        # ----------------------------------------------------

        if not text.strip():

            format_counts["empty"] += 1
            split_format_counts[split_name]["empty"] += 1

            continue


        # ----------------------------------------------------
        # Analyze each annotation line
        # ----------------------------------------------------

        for line_number, line in enumerate(
            text.splitlines(),
            start=1
        ):

            line = line.strip()

            if not line:
                continue

            total_annotation_lines += 1
            split_annotations += 1

            parts = line.split()


            # ------------------------------------------------
            # Determine class
            # ------------------------------------------------

            try:

                class_id = int(parts[0])

            except (ValueError, IndexError):

                format_name = "invalid_class"

                format_counts[format_name] += 1

                split_format_counts[
                    split_name
                ][format_name] += 1

                invalid_examples.append(
                    (
                        split_name,
                        str(label_path),
                        f"line {line_number}: invalid class"
                    )
                )

                continue


            if (
                class_id < 0
                or class_id >= len(EXPECTED_CLASSES)
            ):

                format_name = "invalid_class_id"

                format_counts[format_name] += 1

                split_format_counts[
                    split_name
                ][format_name] += 1

                invalid_examples.append(
                    (
                        split_name,
                        str(label_path),
                        (
                            f"line {line_number}: "
                            f"class {class_id}"
                        )
                    )
                )

                continue


            class_name = EXPECTED_CLASSES[class_id]


            # ------------------------------------------------
            # Coordinates
            # ------------------------------------------------

            try:

                values = [
                    float(value)
                    for value in parts[1:]
                ]

            except ValueError:

                format_name = "non_numeric"

                format_counts[format_name] += 1

                split_format_counts[
                    split_name
                ][format_name] += 1

                class_format_counts[
                    class_name
                ][format_name] += 1

                invalid_examples.append(
                    (
                        split_name,
                        str(label_path),
                        (
                            f"line {line_number}: "
                            f"non-numeric coordinate"
                        )
                    )
                )

                continue


            # =================================================
            # STANDARD YOLO BOX
            # =================================================

            if len(values) == 4:

                format_name = "standard_yolo_box"


            # =================================================
            # POLYGON / OBB
            # =================================================

            elif (
                len(values) >= 6
                and len(values) % 2 == 0
            ):

                format_name = "polygon_or_obb"


            # =================================================
            # INVALID
            # =================================================

            else:

                format_name = "invalid_coordinate_count"

                invalid_examples.append(
                    (
                        split_name,
                        str(label_path),
                        (
                            f"line {line_number}: "
                            f"{len(values)} coordinates"
                        )
                    )
                )


            # ------------------------------------------------
            # Store statistics
            # ------------------------------------------------

            format_counts[format_name] += 1

            split_format_counts[
                split_name
            ][format_name] += 1

            class_format_counts[
                class_name
            ][format_name] += 1


    print(
        f"Label files: {split_labels}"
    )

    print(
        f"Annotation lines: {split_annotations}"
    )


# ============================================================
# OVERALL FORMAT SUMMARY
# ============================================================

print()
print("=" * 70)
print("OVERALL ANNOTATION FORMAT SUMMARY")
print("=" * 70)

print()

print(
    f"Total label files      : "
    f"{total_label_files}"
)

print(
    f"Total annotation lines : "
    f"{total_annotation_lines}"
)

print()

print(
    f"Standard YOLO boxes    : "
    f"{format_counts['standard_yolo_box']}"
)

print(
    f"Polygon / OBB          : "
    f"{format_counts['polygon_or_obb']}"
)

print(
    f"Empty labels           : "
    f"{format_counts['empty']}"
)

print(
    f"Invalid coordinate count: "
    f"{format_counts['invalid_coordinate_count']}"
)

print(
    f"Non-numeric annotations: "
    f"{format_counts['non_numeric']}"
)

print(
    f"Invalid class IDs      : "
    f"{format_counts['invalid_class_id']}"
)

print(
    f"Invalid class format   : "
    f"{format_counts['invalid_class']}"
)

print(
    f"Read errors            : "
    f"{format_counts['read_error']}"
)


# ============================================================
# FORMAT BY SPLIT
# ============================================================

print()
print("=" * 70)
print("FORMAT BY SPLIT")
print("=" * 70)


for split_name in SPLITS:

    counts = split_format_counts[split_name]

    print()
    print(split_name.upper())

    print(
        f"  Standard YOLO boxes : "
        f"{counts['standard_yolo_box']}"
    )

    print(
        f"  Polygon / OBB       : "
        f"{counts['polygon_or_obb']}"
    )

    print(
        f"  Empty labels        : "
        f"{counts['empty']}"
    )

    print(
        f"  Invalid formats     : "
        f"{counts['invalid_coordinate_count']}"
    )


# ============================================================
# FORMAT BY CLASS
# ============================================================

print()
print("=" * 70)
print("FORMAT BY CLASS")
print("=" * 70)


for class_name in EXPECTED_CLASSES:

    counts = class_format_counts[class_name]

    total = (
        counts["standard_yolo_box"]
        + counts["polygon_or_obb"]
        + counts["invalid_coordinate_count"]
        + counts["non_numeric"]
    )

    print()
    print(class_name)

    print(
        f"  Total annotations : "
        f"{total}"
    )

    print(
        f"  YOLO boxes        : "
        f"{counts['standard_yolo_box']}"
    )

    print(
        f"  Polygon / OBB     : "
        f"{counts['polygon_or_obb']}"
    )

    print(
        f"  Invalid           : "
        f"{counts['invalid_coordinate_count'] + counts['non_numeric']}"
    )


# ============================================================
# INVALID EXAMPLES
# ============================================================

print()
print("=" * 70)
print("INVALID ANNOTATION EXAMPLES")
print("=" * 70)


if not invalid_examples:

    print()
    print("No invalid annotation examples found.")

else:

    for split, path, reason in invalid_examples[:20]:

        print()
        print(f"Split : {split}")
        print(f"File  : {path}")
        print(f"Reason: {reason}")


    if len(invalid_examples) > 20:

        print()
        print(
            f"... and "
            f"{len(invalid_examples) - 20} more."
        )


# ============================================================
# SAVE SUMMARY
# ============================================================

OUTPUT_DIR = Path(
    "data/annotation_format_analysis"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


summary_file = (
    OUTPUT_DIR
    / "annotation_format_summary.txt"
)


with open(
    summary_file,
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "HYDRO-VISION-3D ANNOTATION FORMAT ANALYSIS\n"
    )

    f.write(
        "=" * 60 + "\n\n"
    )

    f.write(
        f"Dataset: {DATASET_DIR}\n\n"
    )

    f.write(
        f"Total label files: "
        f"{total_label_files}\n"
    )

    f.write(
        f"Total annotation lines: "
        f"{total_annotation_lines}\n\n"
    )

    f.write(
        "OVERALL FORMATS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    f.write(
        f"Standard YOLO boxes: "
        f"{format_counts['standard_yolo_box']}\n"
    )

    f.write(
        f"Polygon / OBB: "
        f"{format_counts['polygon_or_obb']}\n"
    )

    f.write(
        f"Empty labels: "
        f"{format_counts['empty']}\n"
    )

    f.write(
        f"Invalid coordinate count: "
        f"{format_counts['invalid_coordinate_count']}\n"
    )

    f.write(
        f"Non-numeric: "
        f"{format_counts['non_numeric']}\n"
    )

    f.write(
        f"Invalid class IDs: "
        f"{format_counts['invalid_class_id']}\n"
    )

    f.write(
        f"Read errors: "
        f"{format_counts['read_error']}\n\n"
    )


    f.write(
        "FORMAT BY CLASS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )


    for class_name in EXPECTED_CLASSES:

        counts = class_format_counts[class_name]

        f.write(
            f"\n{class_name}\n"
        )

        f.write(
            f"  YOLO boxes: "
            f"{counts['standard_yolo_box']}\n"
        )

        f.write(
            f"  Polygon/OBB: "
            f"{counts['polygon_or_obb']}\n"
        )

        f.write(
            f"  Invalid: "
            f"{counts['invalid_coordinate_count'] + counts['non_numeric']}\n"
        )


# ============================================================
# FINISHED
# ============================================================

print()
print("=" * 70)
print("ANNOTATION FORMAT ANALYSIS COMPLETE")
print("=" * 70)

print()
print("Report created:")

print(
    summary_file.resolve()
)

print()
print("NO DATASET FILES WERE MODIFIED.")

print()
print("Next step:")
print(
    "Send me the terminal output."
)

print("=" * 70)