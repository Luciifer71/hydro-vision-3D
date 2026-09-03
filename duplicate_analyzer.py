from pathlib import Path
from collections import Counter
import csv


# ============================================================
# HYDRO-VISION-3D
# DUPLICATE ANALYZER
# ============================================================
#
# IMPORTANT:
# This script ONLY analyzes duplicates.
#
# It does NOT:
#   - delete files
#   - move files
#   - rename files
#   - modify annotations
#   - modify the dataset
#
# ============================================================


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_DIR = Path(
    r"data\clean_dataset"
)

DUPLICATE_CSV = Path(
    r"data\dataset_audit\duplicates.csv"
)

OUTPUT_DIR = Path(
    r"data\duplicate_analysis"
)


# ============================================================
# SPLIT DETECTION
# ============================================================

SPLIT_NAMES = {
    "\\train\\": "train",
    "\\valid\\": "valid",
    "\\test\\": "test",
}


# ============================================================
# HELPERS
# ============================================================

def get_split(path_string):
    """
    Determine whether a file belongs to train, valid, or test.
    """

    normalized = path_string.replace("/", "\\").lower()

    for marker, split in SPLIT_NAMES.items():

        if marker in normalized:
            return split

    return "unknown"


def classify_group(paths):
    """
    Determine which dataset splits are represented
    inside one duplicate group.
    """

    splits = []

    for path in paths:

        split = get_split(path)

        if split not in splits:
            splits.append(split)

    return sorted(splits)


def group_type(splits):
    """
    Classify duplicate group based on which splits
    contain the duplicates.
    """

    known = set(splits)

    if "unknown" in known:
        return "unknown"

    if len(known) == 1:

        split = next(iter(known))

        return f"within_{split}"

    if known == {"train", "valid"}:
        return "cross_train_valid"

    if known == {"train", "test"}:
        return "cross_train_test"

    if known == {"valid", "test"}:
        return "cross_valid_test"

    if known == {"train", "valid", "test"}:
        return "cross_all_three"

    return "other_cross_split"


# ============================================================
# START
# ============================================================

print()
print("=" * 70)
print("HYDRO-VISION-3D DUPLICATE ANALYZER")
print("=" * 70)

print()
print("Dataset:")
print(DATASET_DIR)

print()
print("Duplicate report:")
print(DUPLICATE_CSV)

print()
print("IMPORTANT:")
print("This script ONLY analyzes duplicates.")
print("No files will be deleted.")
print("No files will be moved.")
print("No files will be modified.")


# ============================================================
# CHECK INPUT
# ============================================================

if not DATASET_DIR.exists():

    print()
    print("ERROR: Clean dataset was not found.")

    raise SystemExit(1)


if not DUPLICATE_CSV.exists():

    print()
    print("ERROR: duplicates.csv was not found.")

    print(
        "Expected location:"
    )

    print(
        DUPLICATE_CSV
    )

    raise SystemExit(1)


# ============================================================
# OUTPUT DIRECTORY
# ============================================================

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# READ DUPLICATE CSV
# ============================================================

duplicate_groups = {}


print()
print("Reading duplicate report...")


with open(
    DUPLICATE_CSV,
    "r",
    encoding="utf-8-sig",
    newline=""
) as f:

    reader = csv.DictReader(f)

    for row in reader:

        sha256 = row["sha256"].strip()
        image_path = row["image_path"].strip()

        if not sha256 or not image_path:
            continue

        if sha256 not in duplicate_groups:

            duplicate_groups[sha256] = []

        duplicate_groups[sha256].append(
            image_path
        )


# ============================================================
# BASIC COUNTS
# ============================================================

total_groups = len(
    duplicate_groups
)

total_images_in_groups = sum(
    len(paths)
    for paths in duplicate_groups.values()
)


print()
print(
    f"Duplicate groups found: "
    f"{total_groups}"
)

print(
    f"Images involved: "
    f"{total_images_in_groups}"
)


# ============================================================
# ANALYZE GROUPS
# ============================================================

group_counts = Counter()

split_pair_counts = Counter()

cross_split_groups = []

within_split_groups = []


for sha256, paths in duplicate_groups.items():

    splits = classify_group(paths)

    classification = group_type(splits)

    group_counts[classification] += 1

    # --------------------------------------------------------
    # Cross-split analysis
    # --------------------------------------------------------

    if len(set(splits)) > 1:

        cross_split_groups.append({

            "sha256": sha256,

            "group_type": classification,

            "splits": ",".join(splits),

            "number_of_images": len(paths),

            "paths": paths,

        })


        # Record every split combination

        known_splits = sorted(
            set(splits)
        )

        for i in range(
            len(known_splits)
        ):

            for j in range(
                i + 1,
                len(known_splits)
            ):

                pair = (
                    known_splits[i],
                    known_splits[j]
                )

                split_pair_counts[pair] += 1

    else:

        within_split_groups.append({

            "sha256": sha256,

            "group_type": classification,

            "splits": ",".join(splits),

            "number_of_images": len(paths),

            "paths": paths,

        })


# ============================================================
# PRINT SUMMARY
# ============================================================

print()
print("=" * 70)
print("DUPLICATE GROUP SUMMARY")
print("=" * 70)

print()

print(
    f"Total duplicate groups       : "
    f"{total_groups}"
)

print(
    f"Total images involved        : "
    f"{total_images_in_groups}"
)

print()

print("Groups within individual splits:")

print(
    f"  Train only                 : "
    f"{group_counts['within_train']}"
)

print(
    f"  Valid only                 : "
    f"{group_counts['within_valid']}"
)

print(
    f"  Test only                  : "
    f"{group_counts['within_test']}"
)

print()

print("Groups crossing splits:")

print(
    f"  Train <-> Valid            : "
    f"{group_counts['cross_train_valid']}"
)

print(
    f"  Train <-> Test             : "
    f"{group_counts['cross_train_test']}"
)

print(
    f"  Valid <-> Test             : "
    f"{group_counts['cross_valid_test']}"
)

print(
    f"  Train <-> Valid <-> Test   : "
    f"{group_counts['cross_all_three']}"
)

print(
    f"  Other cross-split          : "
    f"{group_counts['other_cross_split']}"
)

print()

print(
    f"TOTAL CROSS-SPLIT GROUPS     : "
    f"{len(cross_split_groups)}"
)


# ============================================================
# SPLIT PAIR SUMMARY
# ============================================================

print()
print("=" * 70)
print("CROSS-SPLIT PAIR SUMMARY")
print("=" * 70)

if split_pair_counts:

    for pair, count in sorted(
        split_pair_counts.items()
    ):

        print(
            f"{pair[0]:>8} <-> "
            f"{pair[1]:<8}: "
            f"{count} groups"
        )

else:

    print("No cross-split duplicate groups found.")


# ============================================================
# WRITE CROSS-SPLIT REPORT
# ============================================================

cross_csv = (
    OUTPUT_DIR
    / "cross_split_duplicates.csv"
)


with open(
    cross_csv,
    "w",
    encoding="utf-8",
    newline=""
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "sha256",
        "group_type",
        "splits",
        "number_of_images",
        "image_path",
    ])


    for group in cross_split_groups:

        for path in group["paths"]:

            writer.writerow([

                group["sha256"],

                group["group_type"],

                group["splits"],

                group["number_of_images"],

                path,

            ])


# ============================================================
# WRITE COMPLETE GROUP REPORT
# ============================================================

groups_csv = (
    OUTPUT_DIR
    / "duplicate_groups.csv"
)


with open(
    groups_csv,
    "w",
    encoding="utf-8",
    newline=""
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "sha256",
        "group_type",
        "splits",
        "number_of_images",
        "image_path",
    ])


    for sha256, paths in duplicate_groups.items():

        splits = classify_group(paths)

        classification = group_type(
            splits
        )

        for path in paths:

            writer.writerow([

                sha256,

                classification,

                ",".join(splits),

                len(paths),

                path,

            ])


# ============================================================
# WRITE SUMMARY TXT
# ============================================================

summary_file = (
    OUTPUT_DIR
    / "duplicate_summary.txt"
)


with open(
    summary_file,
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "HYDRO-VISION-3D DUPLICATE ANALYSIS\n"
    )

    f.write(
        "=" * 60 + "\n\n"
    )

    f.write(
        f"Dataset: {DATASET_DIR}\n\n"
    )

    f.write(
        f"Total duplicate groups: "
        f"{total_groups}\n"
    )

    f.write(
        f"Total images involved: "
        f"{total_images_in_groups}\n\n"
    )


    f.write(
        "WITHIN-SPLIT GROUPS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    f.write(
        f"Train only: "
        f"{group_counts['within_train']}\n"
    )

    f.write(
        f"Valid only: "
        f"{group_counts['within_valid']}\n"
    )

    f.write(
        f"Test only: "
        f"{group_counts['within_test']}\n\n"
    )


    f.write(
        "CROSS-SPLIT GROUPS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    f.write(
        f"Train <-> Valid: "
        f"{group_counts['cross_train_valid']}\n"
    )

    f.write(
        f"Train <-> Test: "
        f"{group_counts['cross_train_test']}\n"
    )

    f.write(
        f"Valid <-> Test: "
        f"{group_counts['cross_valid_test']}\n"
    )

    f.write(
        f"Train <-> Valid <-> Test: "
        f"{group_counts['cross_all_three']}\n"
    )

    f.write(
        f"Other cross-split: "
        f"{group_counts['other_cross_split']}\n"
    )

    f.write(
        f"\nTOTAL CROSS-SPLIT GROUPS: "
        f"{len(cross_split_groups)}\n"
    )


# ============================================================
# FINISHED
# ============================================================

print()
print("=" * 70)
print("DUPLICATE ANALYSIS COMPLETE")
print("=" * 70)

print()
print("Reports created in:")

print(
    OUTPUT_DIR.resolve()
)

print()
print("Files:")

print(
    "  duplicate_summary.txt"
)

print(
    "  cross_split_duplicates.csv"
)

print(
    "  duplicate_groups.csv"
)

print()
print("NO DATASET FILES WERE MODIFIED.")

print()
print("Next step:")

print(
    "Send me the terminal output."
)

print("=" * 70)