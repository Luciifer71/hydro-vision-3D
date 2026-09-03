import os
import shutil
from pathlib import Path
import glob

# 1. Define Paths
BASE_DIR = Path("data")
OLD_DATA = BASE_DIR / "multiclass_dataset"
UNIFIED_DIR = BASE_DIR / "unified_dataset"
ARCHIVE_DIR = BASE_DIR / "old_archive"

# 2. Create Unified Structure
for split in ['train', 'val']:
    (UNIFIED_DIR / 'images' / split).mkdir(parents=True, exist_ok=True)
    (UNIFIED_DIR / 'labels' / split).mkdir(parents=True, exist_ok=True)

ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)

# 3. Migrate the Data Automatically
if OLD_DATA.exists():
    print("Migrating data from multiclass_dataset to unified_dataset...")
    
    # Move Images
    for img in glob.glob(str(OLD_DATA / "images/*.*")):
        shutil.copy(img, UNIFIED_DIR / "images" / "train")
        
    # Move Labels
    for lbl in glob.glob(str(OLD_DATA / "labels/*.txt")):
        shutil.copy(lbl, UNIFIED_DIR / "labels" / "train")
    print("Data migration complete.")

# 4. Clean Up the Clutter (Move old folders to archive)
folders_to_archive = ["external_datasets", "multiclass_dataset", "maritime", "gis", "processed_frames"]

for folder in folders_to_archive:
    src = BASE_DIR / folder
    if src.exists():
        shutil.move(str(src), str(ARCHIVE_DIR / folder))
        print(f"Archived: {folder}")

print("\nWorkspace is clean! Your unified_dataset is ready.")