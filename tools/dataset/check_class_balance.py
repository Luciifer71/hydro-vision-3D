from collections import Counter
from pathlib import Path

labels_dir = Path("data/external_datasets/road_hazards/train/labels")
class_counts = Counter()

for label_file in labels_dir.rglob("*.txt"):
    with open(label_file) as f:
        for line in f:
            parts = line.strip().split()
            if parts:
                class_counts[int(parts[0])] += 1

print("Class distribution in road_hazards training labels:")
for class_id, count in sorted(class_counts.items()):
    print(f"  {class_id}: {count} annotations")

print(f"\nTotal label files scanned: {len(list(labels_dir.rglob('*.txt')))}")