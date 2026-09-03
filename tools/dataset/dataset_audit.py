from pathlib import Path
from collections import Counter, defaultdict
import hashlib
import csv
import sys

try:
    import yaml
    from PIL import Image
except ImportError as e:
    print(f"\nMissing dependency: {e}")
    print("Install with:")
    print("pip install pyyaml pillow")
    sys.exit(1)


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_DIR = Path(r"data\yolo_ready_dataset")

OUTPUT_DIR = Path("data") / "dataset_audit"

SPLITS = {
    "train": "train",
    "val": "valid",
    "test": "test",
}

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".bmp", ".webp"
}


# ============================================================
# EXPECTED CLASSES
# ============================================================

EXPECTED_CLASSES = [
    "cracks",
    "damaged_footpath",
    "drainage_overflow",
    "open_manhole",
    "potholes",
    "waterlogging_area",
]


# ============================================================
# HELPERS
# ============================================================

def sha256_file(path, chunk_size=1024 * 1024):
    """Calculate exact SHA256 hash of a file."""

    h = hashlib.sha256()

    with open(path, "rb") as f:

        while True:

            chunk = f.read(chunk_size)

            if not chunk:
                break

            h.update(chunk)

    return h.hexdigest()


def get_images(folder):
    """Return all supported image files in a folder."""

    if not folder.exists():
        return []

    return [
        p for p in folder.iterdir()
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    ]


def parse_label_file(label_path, num_classes):
    """
    Validate YOLO detection + polygon/OBB-style annotations.

    Supported formats:

    Standard YOLO detection:
        class x_center y_center width height

    Polygon / OBB-style:
        class x1 y1 x2 y2 x3 y3 ...

    Returns:
        annotations
        problems
    """

    annotations = []
    problems = []

    try:

        text = label_path.read_text(
            encoding="utf-8",
            errors="replace"
        )

    except Exception as e:

        problems.append(f"read_error:{e}")

        return annotations, problems


    # --------------------------------------------------------
    # Empty label file
    # --------------------------------------------------------

    if not text.strip():

        problems.append("empty_label_file")

        return annotations, problems


    lines = text.splitlines()


    for line_number, line in enumerate(lines, start=1):

        line = line.strip()

        if not line:
            continue

        parts = line.split()


        # ----------------------------------------------------
        # Minimum possible annotation
        # ----------------------------------------------------

        if len(parts) < 5:

            problems.append(
                f"invalid_column_count_line_{line_number}"
            )

            continue


        # ----------------------------------------------------
        # Class ID
        # ----------------------------------------------------

        try:

            class_id = int(parts[0])

        except ValueError:

            problems.append(
                f"non_numeric_class_id_line_{line_number}"
            )

            continue


        if class_id < 0 or class_id >= num_classes:

            problems.append(
                f"invalid_class_id_{class_id}_line_{line_number}"
            )

            continue


        # ----------------------------------------------------
        # Coordinates
        # ----------------------------------------------------

        try:

            values = [
                float(v)
                for v in parts[1:]
            ]

        except ValueError:

            problems.append(
                f"non_numeric_coordinate_line_{line_number}"
            )

            continue


        # ====================================================
        # FORMAT 1: STANDARD YOLO BOUNDING BOX
        # ====================================================

        if len(values) == 4:

            x, y, w, h = values


            if w <= 0 or h <= 0:

                problems.append(
                    f"non_positive_box_line_{line_number}"
                )

                continue


            if not all(0 <= v <= 1 for v in values):

                problems.append(
                    f"box_coordinate_out_of_range_line_{line_number}"
                )

                continue


            # Boxes touching image boundaries are allowed.
            annotations.append(
                (class_id, "box", x, y, w, h)
            )


        # ====================================================
        # FORMAT 2: POLYGON / OBB
        # ====================================================

        elif len(values) >= 6 and len(values) % 2 == 0:

            coordinates = values


            if not all(0 <= v <= 1 for v in coordinates):

                problems.append(
                    f"polygon_coordinate_out_of_range_line_{line_number}"
                )

                continue


            annotations.append(
                (class_id, "polygon", coordinates)
            )


        # ====================================================
        # FORMAT 3: INVALID
        # ====================================================

        else:

            problems.append(
                f"invalid_column_count_line_{line_number}"
            )


    return annotations, problems


# ============================================================
# LOAD DATASET CONFIG
# ============================================================

print("\n" + "=" * 70)
print("HYDRO-VISION-3D DATASET AUDIT")
print("=" * 70)

print("\nDataset:")
print(DATASET_DIR)


if not DATASET_DIR.exists():

    print("\nERROR: Dataset folder was not found.")
    print("Check the DATASET_DIR path in this script.")

    sys.exit(1)


yaml_path = DATASET_DIR / "data.yaml"


if not yaml_path.exists():

    print("\nERROR: data.yaml not found.")

    sys.exit(1)


with open(
    yaml_path,
    "r",
    encoding="utf-8"
) as f:

    config = yaml.safe_load(f)


class_names = config.get("names", [])


if isinstance(class_names, dict):

    class_names = [
        class_names[i]
        for i in sorted(class_names.keys())
    ]


num_classes = config.get(
    "nc",
    len(class_names)
)


print("\nClasses found in data.yaml:")

for i, name in enumerate(class_names):

    print(f"  {i}: {name}")


# ============================================================
# VERIFY CLASS TAXONOMY
# ============================================================

if class_names != EXPECTED_CLASSES:

    print(
        "\nWARNING: Class order differs from expected order."
    )

    print("\nExpected:")

    for i, name in enumerate(EXPECTED_CLASSES):

        print(f"  {i}: {name}")


    print("\nFound:")

    for i, name in enumerate(class_names):

        print(f"  {i}: {name}")

else:

    print("\nClass taxonomy: OK")


# ============================================================
# OUTPUT DIRECTORY
# ============================================================

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# GLOBAL STATISTICS
# ============================================================

global_instance_counts = Counter()

global_image_counts = Counter()

all_hashes = defaultdict(list)

all_problems = []

split_statistics = {}


# ============================================================
# AUDIT EACH SPLIT
# ============================================================

for split_name, folder_name in SPLITS.items():

    print("\n" + "-" * 70)
    print(f"AUDITING: {split_name.upper()}")
    print("-" * 70)


    images_dir = (
        DATASET_DIR
        / folder_name
        / "images"
    )

    labels_dir = (
        DATASET_DIR
        / folder_name
        / "labels"
    )


    if not images_dir.exists():

        print(
            f"WARNING: {images_dir} does not exist."
        )

        continue


    if not labels_dir.exists():

        print(
            f"WARNING: {labels_dir} does not exist."
        )

        continue


    images = get_images(images_dir)


    label_files = {
        p.stem: p
        for p in labels_dir.glob("*.txt")
    }


    image_stems = {
        p.stem: p
        for p in images
    }


    print(
        f"Images found: {len(images)}"
    )

    print(
        f"Labels found: {len(label_files)}"
    )


    stats = {

        "images": len(images),

        "labels": len(label_files),

        "missing_labels": 0,

        "empty_labels": 0,

        "invalid_labels": 0,

        "images_with_valid_annotations": 0,

        "images_with_no_valid_annotations": 0,

        "corrupt_images": 0,

    }


    split_instance_counts = Counter()

    split_image_counts = Counter()


    # --------------------------------------------------------
    # Image -> Label analysis
    # --------------------------------------------------------

    for image_path in images:

        stem = image_path.stem

        label_path = label_files.get(stem)


        # ----------------------------------------------------
        # Image integrity
        # ----------------------------------------------------

        try:

            with Image.open(image_path) as img:

                img.verify()

        except Exception as e:

            stats["corrupt_images"] += 1

            all_problems.append({

                "split": split_name,

                "file": str(image_path),

                "problem": f"corrupt_image:{e}"

            })

            continue


        # ----------------------------------------------------
        # Exact duplicate detection
        # ----------------------------------------------------

        try:

            image_hash = sha256_file(image_path)

            all_hashes[image_hash].append(
                str(image_path)
            )

        except Exception as e:

            all_problems.append({

                "split": split_name,

                "file": str(image_path),

                "problem": f"hash_error:{e}"

            })


        # ----------------------------------------------------
        # Missing label
        # ----------------------------------------------------

        if label_path is None:

            stats["missing_labels"] += 1

            all_problems.append({

                "split": split_name,

                "file": str(image_path),

                "problem": "missing_label"

            })

            continue


        # ----------------------------------------------------
        # Parse label
        # ----------------------------------------------------

        annotations, problems = parse_label_file(
            label_path,
            num_classes
        )


        if not annotations:

            stats[
                "images_with_no_valid_annotations"
            ] += 1

        else:

            stats[
                "images_with_valid_annotations"
            ] += 1


        if "empty_label_file" in problems:

            stats["empty_labels"] += 1


        if problems:

            stats["invalid_labels"] += 1

            for problem in problems:

                all_problems.append({

                    "split": split_name,

                    "file": str(label_path),

                    "problem": problem

                })


        # ----------------------------------------------------
        # Count annotations
        # ----------------------------------------------------

        valid_class_ids = set()


        for annotation in annotations:

            class_id = annotation[0]

            split_instance_counts[class_id] += 1

            global_instance_counts[class_id] += 1

            valid_class_ids.add(class_id)


        for class_id in valid_class_ids:

            split_image_counts[class_id] += 1

            global_image_counts[class_id] += 1


    # --------------------------------------------------------
    # Labels without corresponding images
    # --------------------------------------------------------

    for stem, label_path in label_files.items():

        if stem not in image_stems:

            all_problems.append({

                "split": split_name,

                "file": str(label_path),

                "problem": "label_without_image"

            })


    # --------------------------------------------------------
    # Print split statistics
    # --------------------------------------------------------

    print(
        f"\nMissing labels: "
        f"{stats['missing_labels']}"
    )

    print(
        f"Empty labels: "
        f"{stats['empty_labels']}"
    )

    print(
        f"Invalid labels: "
        f"{stats['invalid_labels']}"
    )

    print(
        f"Corrupt images: "
        f"{stats['corrupt_images']}"
    )

    print(
        f"Images with valid annotations: "
        f"{stats['images_with_valid_annotations']}"
    )

    print(
        f"Images with no valid annotations: "
        f"{stats['images_with_no_valid_annotations']}"
    )


    print("\nClass instances:")


    for class_id, name in enumerate(class_names):

        print(

            f"  {class_id}: "
            f"{name:<22} "
            f"{split_instance_counts[class_id]:>7} instances "
            f"({split_image_counts[class_id]:>6} images)"

        )


    split_statistics[split_name] = stats


# ============================================================
# DUPLICATE REPORT
# ============================================================

duplicate_groups = {

    hash_value: paths

    for hash_value, paths in all_hashes.items()

    if len(paths) > 1

}


print("\n" + "=" * 70)
print("EXACT DUPLICATE SUMMARY")
print("=" * 70)


print(
    f"Duplicate groups: "
    f"{len(duplicate_groups)}"
)


duplicate_file_count = sum(

    len(paths)

    for paths in duplicate_groups.values()

)


print(
    f"Images involved in duplicate groups: "
    f"{duplicate_file_count}"
)


# ============================================================
# FINAL CLASS SUMMARY
# ============================================================

print("\n" + "=" * 70)
print("GLOBAL CLASS DISTRIBUTION")
print("=" * 70)


for class_id, name in enumerate(class_names):

    print(

        f"{class_id}: "
        f"{name:<22} "
        f"{global_instance_counts[class_id]:>7} instances "
        f"across {global_image_counts[class_id]:>6} images"

    )


# ============================================================
# WRITE PROBLEM REPORT
# ============================================================

problem_csv = OUTPUT_DIR / "problems.csv"


with open(

    problem_csv,

    "w",

    newline="",

    encoding="utf-8"

) as f:

    writer = csv.DictWriter(

        f,

        fieldnames=[
            "split",
            "file",
            "problem"
        ]

    )

    writer.writeheader()

    writer.writerows(all_problems)


# ============================================================
# WRITE CLASS DISTRIBUTION
# ============================================================

class_csv = OUTPUT_DIR / "class_distribution.csv"


with open(

    class_csv,

    "w",

    newline="",

    encoding="utf-8"

) as f:

    writer = csv.writer(f)


    writer.writerow([

        "class_id",

        "class_name",

        "instances",

        "images"

    ])


    for class_id, name in enumerate(class_names):

        writer.writerow([

            class_id,

            name,

            global_instance_counts[class_id],

            global_image_counts[class_id]

        ])


# ============================================================
# WRITE DUPLICATE REPORT
# ============================================================

duplicate_csv = OUTPUT_DIR / "duplicates.csv"


with open(

    duplicate_csv,

    "w",

    newline="",

    encoding="utf-8"

) as f:

    writer = csv.writer(f)


    writer.writerow([

        "sha256",

        "image_path"

    ])


    for hash_value, paths in duplicate_groups.items():

        for path in paths:

            writer.writerow([

                hash_value,

                path

            ])


# ============================================================
# WRITE SUMMARY
# ============================================================

summary_file = OUTPUT_DIR / "audit_summary.txt"


with open(

    summary_file,

    "w",

    encoding="utf-8"

) as f:

    f.write(
        "HYDRO-VISION-3D DATASET AUDIT\n"
    )

    f.write(
        "=" * 60 + "\n\n"
    )


    f.write(
        f"Dataset: {DATASET_DIR}\n\n"
    )


    f.write(
        "CLASSES\n"
    )

    f.write(
        "-" * 60 + "\n"
    )


    for class_id, name in enumerate(class_names):

        f.write(

            f"{class_id}: {name} | "
            f"{global_instance_counts[class_id]} instances | "
            f"{global_image_counts[class_id]} images\n"

        )


    f.write(
        "\nSPLITS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )


    for split, stats in split_statistics.items():

        f.write(

            f"{split}: "
            f"{stats['images']} images, "
            f"{stats['labels']} labels, "
            f"{stats['missing_labels']} missing labels, "
            f"{stats['empty_labels']} empty labels, "
            f"{stats['invalid_labels']} invalid labels, "
            f"{stats['corrupt_images']} corrupt images\n"

        )


    f.write(
        "\nPROBLEMS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )


    f.write(

        f"Total reported problems: "
        f"{len(all_problems)}\n"

    )


    f.write(

        f"Exact duplicate groups: "
        f"{len(duplicate_groups)}\n"

    )


# ============================================================
# FINISHED
# ============================================================

print("\n" + "=" * 70)
print("AUDIT COMPLETE")
print("=" * 70)

print("\nIMPORTANT:")

print("No files were deleted.")
print("No files were moved.")
print("No files were modified.")

print("\nReports created in:")

print(OUTPUT_DIR)

print("\nFiles:")

print("  audit_summary.txt")
print("  class_distribution.csv")
print("  problems.csv")
print("  duplicates.csv")

print("\nNext step:")

print(
    "Send me the contents of audit_summary.txt."
)

print("=" * 70)