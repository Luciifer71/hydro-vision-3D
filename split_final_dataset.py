from pathlib import Path
from collections import defaultdict
import hashlib
import shutil
import random

# ============================================================
# CONFIGURATION
# ============================================================

SOURCE = Path("data/clean_dataset")
OUTPUT = Path("data/final_dataset")

SEED = 42

# Desired approximate coverage in validation/test
# for classes that are currently severely underrepresented.
TARGET_CRACK_TEST_IMAGES = 230
TARGET_DRAINAGE_TEST_IMAGES = 23
TARGET_OPEN_MANHOLE_VAL_IMAGES = 180

# ============================================================
# HELPERS
# ============================================================

random.seed(SEED)


def sha256_file(path):
    h = hashlib.sha256()

    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)

    return h.hexdigest()


def read_classes(label_path):
    """
    Returns the set of class IDs present in a label file.
    Empty label files return an empty set.
    """
    classes = set()

    if not label_path.exists():
        return classes

    with open(label_path, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split()

            if not parts:
                continue

            try:
                class_id = int(float(parts[0]))
                classes.add(class_id)
            except ValueError:
                continue

    return classes


def image_files(split):
    image_dir = SOURCE / split / "images"

    return sorted(
        p for p in image_dir.iterdir()
        if p.is_file()
        and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    )


def label_for(image_path, split):
    return SOURCE / split / "labels" / f"{image_path.stem}.txt"


# ============================================================
# LOAD EXISTING SPLITS
# ============================================================

print("=" * 70)
print("FINAL DATASET SPLIT BUILDER")
print("=" * 70)

print(f"\nSource : {SOURCE}")
print(f"Output : {OUTPUT}")

train_images = image_files("train")
valid_images = image_files("valid")
test_images = image_files("test")

print("\nCurrent split sizes:")
print(f"  Train : {len(train_images):,}")
print(f"  Valid : {len(valid_images):,}")
print(f"  Test  : {len(test_images):,}")

# ============================================================
# BUILD DUPLICATE GROUPS
# ============================================================

print("\nScanning exact duplicates...")

all_images = []

for split, images in [
    ("train", train_images),
    ("valid", valid_images),
    ("test", test_images),
]:
    for img in images:
        all_images.append((split, img))


hash_groups = defaultdict(list)

for split, img in all_images:
    digest = sha256_file(img)
    hash_groups[digest].append((split, img))

duplicate_groups = {
    digest: members
    for digest, members in hash_groups.items()
    if len(members) > 1
}

print(f"  Duplicate groups found: {len(duplicate_groups):,}")

# ============================================================
# VERIFY NO CURRENT CROSS-SPLIT DUPLICATES
# ============================================================

cross_split_groups = []

for digest, members in duplicate_groups.items():

    splits = {split for split, _ in members}

    if len(splits) > 1:
        cross_split_groups.append(members)

if cross_split_groups:
    print("\nWARNING:")
    print("Cross-split duplicate groups still exist.")

    for group in cross_split_groups:
        print("\nGroup:")
        for split, img in group:
            print(f"  {split}: {img.name}")

    raise RuntimeError(
        "Cross-split duplicates detected. "
        "Fix leakage before rebuilding the final split."
    )

print("  No cross-split duplicate leakage detected.")

# ============================================================
# GROUP TRAIN IMAGES BY DUPLICATE HASH
# ============================================================

train_groups = defaultdict(list)

for img in train_images:
    digest = sha256_file(img)
    train_groups[digest].append(img)

train_group_list = list(train_groups.values())

random.shuffle(train_group_list)

# ============================================================
# CLASS CONSTANTS
# ============================================================

CRACKS = 0
DAMAGED_FOOTPATH = 1
DRAINAGE_OVERFLOW = 2
OPEN_MANHOLE = 3
POTHOLES = 4
WATERLOGGING = 5

# ============================================================
# FIND TRAIN GROUPS BY CLASS
# ============================================================

group_classes = {}

for group in train_group_list:

    classes = set()

    for img in group:
        label = label_for(img, "train")
        classes.update(read_classes(label))

    group_classes[id(group)] = classes


def select_groups_for_class(
    candidate_groups,
    class_id,
    target_images,
    already_selected
):
    """
    Greedily select duplicate groups containing class_id.
    Keeps complete duplicate groups together.
    """

    candidates = []

    for group in candidate_groups:

        if id(group) in already_selected:
            continue

        classes = group_classes[id(group)]

        if class_id in classes:
            candidates.append(group)

    random.shuffle(candidates)

    # Prefer groups containing the target class and fewer
    # additional classes, so the split remains useful.
    candidates.sort(
        key=lambda g: (
            len(group_classes[id(g)]),
            -len(g)
        )
    )

    selected = []
    count = 0

    for group in candidates:

        if count >= target_images:
            break

        selected.append(group)
        already_selected.add(id(group))
        count += len(group)

    return selected, count


# ============================================================
# SELECT TEST GROUPS
# ============================================================

selected_for_test = set()

print("\nSelecting crack images for TEST...")

crack_groups, crack_count = select_groups_for_class(
    train_group_list,
    CRACKS,
    TARGET_CRACK_TEST_IMAGES,
    selected_for_test
)

print(f"  Selected crack images: {crack_count:,}")

print("\nSelecting drainage-overflow images for TEST...")

drainage_groups, drainage_count = select_groups_for_class(
    train_group_list,
    DRAINAGE_OVERFLOW,
    TARGET_DRAINAGE_TEST_IMAGES,
    selected_for_test
)

print(f"  Additional drainage-overflow images: {drainage_count:,}")

test_move_groups = crack_groups + drainage_groups

test_move_images = []

for group in test_move_groups:
    test_move_images.extend(group)

test_move_images = list(dict.fromkeys(test_move_images))

print(f"\nTotal train images moving to TEST: {len(test_move_images):,}")

# ============================================================
# SELECT OPEN-MANHOLE GROUPS FOR VALIDATION
# ============================================================

remaining_train_groups = [
    group
    for group in train_group_list
    if id(group) not in selected_for_test
]

selected_for_valid = set()

print("\nSelecting open-manhole images for VALID...")

manhole_groups, manhole_count = select_groups_for_class(
    remaining_train_groups,
    OPEN_MANHOLE,
    TARGET_OPEN_MANHOLE_VAL_IMAGES,
    selected_for_valid
)

print(f"  Selected open-manhole images: {manhole_count:,}")

valid_move_images = []

for group in manhole_groups:
    valid_move_images.extend(group)

valid_move_images = list(dict.fromkeys(valid_move_images))

print(f"  Total train images moving to VALID: {len(valid_move_images):,}")

# ============================================================
# CREATE OUTPUT DIRECTORIES
# ============================================================

if OUTPUT.exists():
    raise RuntimeError(
        f"\nOutput directory already exists:\n{OUTPUT}\n\n"
        "Delete it manually if you want to rebuild the dataset."
    )

for split in ["train", "valid", "test"]:
    (OUTPUT / split / "images").mkdir(parents=True, exist_ok=True)
    (OUTPUT / split / "labels").mkdir(parents=True, exist_ok=True)

# ============================================================
# DETERMINE FINAL MEMBERSHIP
# ============================================================

move_to_test = set(test_move_images)
move_to_valid = set(valid_move_images)

final_train = [
    img for img in train_images
    if img not in move_to_test
    and img not in move_to_valid
]

final_valid = list(valid_images) + valid_move_images
final_test = list(test_images) + test_move_images

print("\nFinal split sizes:")
print(f"  Train : {len(final_train):,}")
print(f"  Valid : {len(final_valid):,}")
print(f"  Test  : {len(final_test):,}")

# ============================================================
# COPY FILES
# ============================================================

def copy_split(images, source_split, output_split):

    for img in images:

        src_img = img
        src_label = label_for(img, source_split)

        dst_img = OUTPUT / output_split / "images" / img.name
        dst_label = OUTPUT / output_split / "labels" / f"{img.stem}.txt"

        shutil.copy2(src_img, dst_img)

        if src_label.exists():
            shutil.copy2(src_label, dst_label)
        else:
            # Create empty label file if missing
            dst_label.touch()


print("\nCopying TRAIN...")
copy_split(
    final_train,
    "train",
    "train"
)

print("Copying existing VALID...")
copy_split(
    valid_images,
    "valid",
    "valid"
)

print("Copying moved images into VALID...")
copy_split(
    valid_move_images,
    "train",
    "valid"
)

print("Copying existing TEST...")
copy_split(
    test_images,
    "test",
    "test"
)

print("Copying moved images into TEST...")
copy_split(
    test_move_images,
    "train",
    "test"
)

# ============================================================
# CREATE DATA.YAML
# ============================================================

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

with open(OUTPUT / "data.yaml", "w", encoding="utf-8") as f:
    f.write(yaml_text)

# ============================================================
# SAVE SPLIT LOG
# ============================================================

with open(OUTPUT / "split_log.txt", "w", encoding="utf-8") as f:

    f.write("Hydro-Vision-3D Final Dataset Split\n")
    f.write("=" * 50 + "\n\n")

    f.write(f"Random seed: {SEED}\n\n")

    f.write("Moved from TRAIN to TEST:\n")
    f.write(f"  Crack-target images: {crack_count}\n")
    f.write(f"  Drainage-target images: {drainage_count}\n")
    f.write(f"  Total moved: {len(test_move_images)}\n\n")

    f.write("Moved from TRAIN to VALID:\n")
    f.write(f"  Open-manhole-target images: {manhole_count}\n")
    f.write(f"  Total moved: {len(valid_move_images)}\n\n")

    f.write("Final split sizes:\n")
    f.write(f"  Train: {len(final_train)}\n")
    f.write(f"  Valid: {len(final_valid)}\n")
    f.write(f"  Test: {len(final_test)}\n")

print("\n" + "=" * 70)
print("DONE")
print("=" * 70)

print(f"\nFinal dataset created at:")
print(f"  {OUTPUT}")

print("\nIMPORTANT:")
print("  data/clean_dataset was NOT modified.")
print("  Polygon/OBB annotations were NOT converted yet.")
print("  No annotations were rewritten.")