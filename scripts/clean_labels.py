import glob

def clean_dataset_labels():
    print("Scanning dataset for mixed bounding box and segmentation labels...")
    
    # Find all text files in the labels directory
    label_files = glob.glob('data/multiclass_dataset/labels/**/*.txt', recursive=True)
    cleaned_count = 0
    
    for file_path in label_files:
        with open(file_path, 'r') as f:
            lines = f.readlines()
            
        valid_lines = []
        for line in lines:
            parts = line.strip().split()
            if len(parts) == 5:
                # Normal YOLO bounding box (class x_center y_center width height)
                valid_lines.append(line)
            elif len(parts) > 5:
                # It's a segmentation polygon. Convert it to a bounding box.
                class_id = parts[0]
                coords = [float(x) for x in parts[1:]]
                xs = coords[0::2]
                ys = coords[1::2]
                
                x_center = (min(xs) + max(xs)) / 2
                y_center = (min(ys) + max(ys)) / 2
                w = max(xs) - min(xs)
                h = max(ys) - min(ys)
                
                valid_lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}\n")
                
        # Overwrite the file with the cleaned lines
        with open(file_path, 'w') as f:
            f.writelines(valid_lines)
            
        cleaned_count += 1

    print(f"Successfully cleaned and standardized {cleaned_count} label files.")
    print("Dataset is now 100% standard YOLOv8 format. Ready for MPS training.")

if __name__ == "__main__":
    clean_dataset_labels()
