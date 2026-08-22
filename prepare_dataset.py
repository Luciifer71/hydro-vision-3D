import os
import shutil
from pathlib import Path

BASE_DIR = Path("data/multiclass_dataset")
IMG_DIR = BASE_DIR / "images"
LBL_DIR = BASE_DIR / "labels"

# Add paths for your other raw datasets here
BHARAT_DIR = BASE_DIR / "raw_downloads/bharatpothole/BharatPotHole/BharatPotHole"
FOOTPATH_DIR = BASE_DIR / "raw_downloads/footpath/Final Indian..." # Update this path

def process_dataset(source_dir, target_class_id):
    # Write the logic here to:
    # 1. Loop through images and labels in source_dir
    # 2. Open the .txt label files and overwrite the class ID 
    #    with target_class_id (e.g., 5 for damaged_footpath)
    # 3. Copy them into IMG_DIR and LBL_DIR
    pass

def process_bharatpothole():
    # Your existing code goes here (it's already Class 0)
    pass

if __name__ == "__main__":
    print("Starting Fast Dataset Merger...")
    # process_bharatpothole()  # Comment this out if it's already done
    
    # process_dataset(FOOTPATH_DIR, target_class_id=5) # 5 = damaged_footpath
    # process_dataset(WATERLOGGING_DIR, target_class_id=3) # 3 = waterlogging_area
    
    print("Dataset staged! Ready for 7-class fine-tuning.")



# import os
# import shutil
# from pathlib import Path

# BASE_DIR = Path("data/multiclass_dataset")
# IMG_DIR = BASE_DIR / "images"
# LBL_DIR = BASE_DIR / "labels"
# BHARAT_DIR = BASE_DIR / "raw_downloads/bharatpothole/BharatPotHole/BharatPotHole"

# def process_bharatpothole():
#     print("Processing BharatPotHole Dataset (Skipping Footpaths)...")
    
#     # Kaggle dataset splits
#     for split in ["train", "valid", "test"]:
#         yolo_split = "val" if split == "valid" else split
        
#         img_src = BHARAT_DIR / split / "images"
#         lbl_src = BHARAT_DIR / split / "labels"
        
#         if not img_src.exists(): 
#             print(f"Skipping {split} - folder not found.")
#             continue
            
#         count = 0
#         for img_path in img_src.glob("*.*"):
#             # Copy Image
#             shutil.copy(img_path, IMG_DIR / yolo_split / img_path.name)
            
#             # Copy Label
#             lbl_path = lbl_src / f"{img_path.stem}.txt"
#             if lbl_path.exists():
#                 shutil.copy(lbl_path, LBL_DIR / yolo_split / lbl_path.name)
#             count += 1
            
#         print(f"Copied {count} files to {yolo_split}")

# if __name__ == "__main__":
#     print("Starting Fast Dataset Merger...")
#     process_bharatpothole()
#     print("Dataset staged! Ready for Mac Mini M4 Pro training.")
