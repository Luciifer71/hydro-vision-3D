from pathlib import Path
from collections import Counter, defaultdict
from PIL import Image, ImageDraw, ImageFont
import csv
import math
import random


# ============================================================
# CONFIGURATION
# ============================================================

DATASET_DIR = Path(
    r"C:\Users\Krish\Downloads\Hydro-vision-merged.v2i.yolov8"
)

OUTPUT_DIR = Path("data") / "empty_image_analysis"

# Number of thumbnails per contact sheet
IMAGES_PER_SHEET = 100

# Number of "other/unknown" empty images to sample
OTHER_SAMPLE_SIZE = 300

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".bmp",
    ".webp"
}

SPLITS = {
    "train": "train",
    "val": "valid",
    "test": "test",
}


# ============================================================
# FILENAME KEYWORDS
# ============================================================
# These are ONLY investigation categories.
# They do NOT automatically mean an image will be deleted.

SUSPICIOUS_KEYWORDS = {
    "cardboard": "cardboard",
    "glass": "glass",
    "plastic": "plastic",
    "paper": "paper",
    "bottle": "bottle",
    "can": "container",
    "container": "container",
    "product": "product",
    "crowd": "crowd",
    "person": "people",
    "people": "people",
    "human": "people",
    "animal": "animal",
    "cat": "animal",
    "dog": "animal",
    "food": "food",
    "fruit": "food",
    "vegetable": "food",
    "package": "packaging",
    "packaging": "packaging",
    "box": "box",
    "document": "document",
    "paper": "paper",
    "newspaper": "document",
    "magazine": "document",
    "book": "document",
    "phone": "electronics",
    "mobile": "electronics",
    "laptop": "electronics",
    "computer": "electronics",
    "keyboard": "electronics",
    "mouse": "electronics",
    "chair": "furniture",
    "table": "furniture",
    "sofa": "furniture",
    "bed": "furniture",
}


# ============================================================
# HELPERS
# ============================================================

def get_images(folder):
    """Return supported image files."""
    if not folder.exists():
        return []

    return sorted(
        [
            p for p in folder.iterdir()
            if p.is_file()
            and p.suffix.lower() in IMAGE_EXTENSIONS
        ]
    )


def find_keyword_categories(filename):
    """
    Return suspicious filename categories.

    This is only a first-pass signal.
    It does NOT classify the actual image.
    """

    name = filename.lower()

    categories = set()

    for keyword, category in SUSPICIOUS_KEYWORDS.items():

        if keyword in name:
            categories.add(category)

    return sorted(categories)


def get_image_info(image_path):
    """Get basic image information."""

    try:
        with Image.open(image_path) as img:

            width, height = img.size

            return {
                "width": width,
                "height": height,
                "mode": img.mode,
                "valid": True,
            }

    except Exception as e:

        return {
            "width": "",
            "height": "",
            "mode": "",
            "valid": False,
            "error": str(e),
        }


def create_contact_sheet(
    image_paths,
    output_path,
    title,
    columns=5,
    thumbnail_size=(220, 160),
):
    """
    Create a contact sheet containing thumbnails.
    """

    if not image_paths:
        return

    rows = math.ceil(len(image_paths) / columns)

    label_height = 45

    sheet_width = columns * thumbnail_size[0]
    sheet_height = (
        rows * (thumbnail_size[1] + label_height)
        + 50
    )

    sheet = Image.new(
        "RGB",
        (sheet_width, sheet_height),
        "white"
    )

    draw = ImageDraw.Draw(sheet)

    # Title
    draw.text(
        (10, 10),
        title,
        fill="black"
    )

    for index, image_path in enumerate(image_paths):

        row = index // columns
        col = index % columns

        x = col * thumbnail_size[0]
        y = 50 + row * (
            thumbnail_size[1] + label_height
        )

        try:

            with Image.open(image_path) as img:

                img = img.convert("RGB")

                img.thumbnail(thumbnail_size)

                paste_x = (
                    x
                    + (thumbnail_size[0] - img.width) // 2
                )

                paste_y = (
                    y
                    + (thumbnail_size[1] - img.height) // 2
                )

                sheet.paste(
                    img,
                    (paste_x, paste_y)
                )

            # Short filename
            filename = image_path.name

            if len(filename) > 28:
                filename = filename[:25] + "..."

            draw.text(
                (x + 4, y + thumbnail_size[1] + 3),
                filename,
                fill="black"
            )

        except Exception:

            draw.text(
                (x + 10, y + 10),
                "IMAGE ERROR",
                fill="red"
            )

    sheet.save(
        output_path,
        quality=90
    )


# ============================================================
# START
# ============================================================

print()
print("=" * 70)
print("HYDRO-VISION-3D EMPTY IMAGE ANALYZER")
print("=" * 70)

print()
print("Dataset:")
print(DATASET_DIR)

print()
print("IMPORTANT:")
print("This script does NOT delete anything.")
print("This script does NOT move anything.")
print("This script does NOT modify the dataset.")


# ============================================================
# CHECK DATASET
# ============================================================

if not DATASET_DIR.exists():

    print()
    print("ERROR: Dataset folder not found.")
    print("Check DATASET_DIR in the script.")
    raise SystemExit(1)


# ============================================================
# CREATE OUTPUT DIRECTORIES
# ============================================================

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

CONTACT_DIR = OUTPUT_DIR / "contact_sheets"

CONTACT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# FIND EMPTY-LABEL IMAGES
# ============================================================

empty_images = []

keyword_groups = defaultdict(list)

other_images = []

split_counts = Counter()

total_images = 0


for split_name, folder_name in SPLITS.items():

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
            f"\nWARNING: Missing images directory: "
            f"{images_dir}"
        )

        continue

    if not labels_dir.exists():

        print(
            f"\nWARNING: Missing labels directory: "
            f"{labels_dir}"
        )

        continue

    images = get_images(images_dir)

    total_images += len(images)

    print(
        f"\nScanning {split_name}: "
        f"{len(images)} images"
    )

    for image_path in images:

        label_path = labels_dir / (
            image_path.stem + ".txt"
        )

        # ----------------------------------------------------
        # Only interested in EMPTY label files
        # ----------------------------------------------------

        if not label_path.exists():
            continue

        try:

            label_text = label_path.read_text(
                encoding="utf-8",
                errors="replace"
            )

        except Exception:
            continue

        if label_text.strip():
            continue

        # ----------------------------------------------------
        # Empty image found
        # ----------------------------------------------------

        empty_images.append(
            {
                "split": split_name,
                "image": image_path,
                "label": label_path,
            }
        )

        split_counts[split_name] += 1

        # ----------------------------------------------------
        # Filename keyword analysis
        # ----------------------------------------------------

        categories = find_keyword_categories(
            image_path.name
        )

        if categories:

            for category in categories:

                keyword_groups[category].append(
                    image_path
                )

        else:

            other_images.append(image_path)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 70)
print("EMPTY IMAGE SUMMARY")
print("=" * 70)

print(
    f"\nTotal dataset images: "
    f"{total_images}"
)

print(
    f"Total empty-label images: "
    f"{len(empty_images)}"
)

for split_name in SPLITS:

    print(
        f"{split_name:<8}: "
        f"{split_counts[split_name]}"
    )


print()
print(
    f"Images with suspicious filename keywords: "
    f"{sum(len(v) for v in keyword_groups.values())}"
)

print(
    f"Images without suspicious filename keywords: "
    f"{len(other_images)}"
)


# ============================================================
# KEYWORD SUMMARY
# ============================================================

print()
print("=" * 70)
print("FILENAME CATEGORY SUMMARY")
print("=" * 70)

for category, paths in sorted(
    keyword_groups.items(),
    key=lambda x: len(x[1]),
    reverse=True
):

    print(
        f"{category:<20} "
        f"{len(paths):>6}"
    )


# ============================================================
# WRITE COMPLETE CSV
# ============================================================

all_csv = OUTPUT_DIR / "empty_images.csv"

with open(
    all_csv,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow(
        [
            "split",
            "image",
            "label",
            "filename_categories",
            "width",
            "height",
            "mode",
            "image_valid",
        ]
    )

    for item in empty_images:

        image_path = item["image"]

        info = get_image_info(
            image_path
        )

        categories = find_keyword_categories(
            image_path.name
        )

        writer.writerow(
            [
                item["split"],
                str(image_path),
                str(item["label"]),
                ",".join(categories),
                info.get("width", ""),
                info.get("height", ""),
                info.get("mode", ""),
                info.get("valid", False),
            ]
        )


# ============================================================
# WRITE CATEGORY CSV
# ============================================================

category_csv = OUTPUT_DIR / "keyword_groups.csv"

with open(
    category_csv,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow(
        [
            "category",
            "image",
        ]
    )

    for category, paths in sorted(
        keyword_groups.items()
    ):

        for path in paths:

            writer.writerow(
                [
                    category,
                    str(path),
                ]
            )


# ============================================================
# CREATE CONTACT SHEETS FOR KEYWORD GROUPS
# ============================================================

print()
print("=" * 70)
print("CREATING CONTACT SHEETS")
print("=" * 70)

for category, paths in sorted(
    keyword_groups.items(),
    key=lambda x: len(x[1]),
    reverse=True
):

    print(
        f"\n{category}: "
        f"{len(paths)} images"
    )

    for start in range(
        0,
        len(paths),
        IMAGES_PER_SHEET
    ):

        chunk = paths[
            start:start + IMAGES_PER_SHEET
        ]

        sheet_number = (
            start // IMAGES_PER_SHEET
        ) + 1

        output_path = (
            CONTACT_DIR
            / f"{category}_{sheet_number:03d}.jpg"
        )

        create_contact_sheet(
            chunk,
            output_path,
            f"{category} | "
            f"{start + 1}-{start + len(chunk)}"
        )


# ============================================================
# SAMPLE OTHER EMPTY IMAGES
# ============================================================

print()
print("=" * 70)
print("CREATING SAMPLE OF OTHER EMPTY IMAGES")
print("=" * 70)

random.seed(42)

if len(other_images) > OTHER_SAMPLE_SIZE:

    other_sample = random.sample(
        other_images,
        OTHER_SAMPLE_SIZE
    )

else:

    other_sample = other_images


other_csv = OUTPUT_DIR / "other_empty_sample.csv"

with open(
    other_csv,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow(
        [
            "image"
        ]
    )

    for path in other_sample:

        writer.writerow(
            [
                str(path)
            ]
        )


for start in range(
    0,
    len(other_sample),
    IMAGES_PER_SHEET
):

    chunk = other_sample[
        start:start + IMAGES_PER_SHEET
    ]

    sheet_number = (
        start // IMAGES_PER_SHEET
    ) + 1

    output_path = (
        CONTACT_DIR
        / f"other_{sheet_number:03d}.jpg"
    )

    create_contact_sheet(
        chunk,
        output_path,
        f"OTHER EMPTY IMAGES | "
        f"{start + 1}-{start + len(chunk)}"
    )


# ============================================================
# SUMMARY FILE
# ============================================================

summary_path = (
    OUTPUT_DIR
    / "empty_image_summary.txt"
)

with open(
    summary_path,
    "w",
    encoding="utf-8"
) as f:

    f.write(
        "HYDRO-VISION-3D EMPTY IMAGE ANALYSIS\n"
    )

    f.write(
        "=" * 60 + "\n\n"
    )

    f.write(
        f"Total dataset images: "
        f"{total_images}\n"
    )

    f.write(
        f"Total empty-label images: "
        f"{len(empty_images)}\n\n"
    )

    f.write(
        "EMPTY IMAGES BY SPLIT\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    for split_name in SPLITS:

        f.write(
            f"{split_name}: "
            f"{split_counts[split_name]}\n"
        )

    f.write(
        "\nFILENAME CATEGORY COUNTS\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    for category, paths in sorted(
        keyword_groups.items(),
        key=lambda x: len(x[1]),
        reverse=True
    ):

        f.write(
            f"{category}: "
            f"{len(paths)}\n"
        )

    f.write(
        "\nOTHER EMPTY IMAGES\n"
    )

    f.write(
        "-" * 60 + "\n"
    )

    f.write(
        f"Total without suspicious filename keywords: "
        f"{len(other_images)}\n"
    )

    f.write(
        f"Sampled for contact sheets: "
        f"{len(other_sample)}\n"
    )


# ============================================================
# FINISHED
# ============================================================

print()
print("=" * 70)
print("ANALYSIS COMPLETE")
print("=" * 70)

print()
print("NO DATASET FILES WERE MODIFIED.")

print()
print("Reports created in:")
print(OUTPUT_DIR)

print()
print("Important files:")
print("  empty_image_summary.txt")
print("  empty_images.csv")
print("  keyword_groups.csv")
print("  other_empty_sample.csv")

print()
print("Contact sheets:")
print(CONTACT_DIR)

print()
print("Next step:")
print(
    "Send me the contents of "
    "empty_image_summary.txt"
)

print("=" * 70)