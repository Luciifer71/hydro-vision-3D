import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "final_dataset_v2"

for split in ("train", "valid", "test"):
    labels = DATASET / split / "labels"
    if not labels.exists():
        print(f"{split}: folder not found")
        continue

    boxes = polygons = empty = mixed_files = 0
    total_files = 0
    poly_by_class = collections.Counter()

    for f in labels.glob("*.txt"):
        total_files += 1
        has_box = has_poly = False
        lines = [l.strip() for l in f.read_text().splitlines() if l.strip()]
        if not lines:
            empty += 1
            continue
        for line in lines:
            parts = line.split()
            n_coords = len(parts) - 1
            if n_coords == 4:
                boxes += 1
                has_box = True
            elif n_coords >= 6 and n_coords % 2 == 0:
                polygons += 1
                has_poly = True
                poly_by_class[int(parts[0])] += 1
        if has_box and has_poly:
            mixed_files += 1

    print(f"\n=== {split} ===")
    print(f"  label files      : {total_files}")
    print(f"  empty files      : {empty}")
    print(f"  box annotations  : {boxes}")
    print(f"  polygon annots   : {polygons}")
    print(f"  MIXED files      : {mixed_files}  <-- these get skipped entirely")
    if poly_by_class:
        names = ['damaged_footpath','drainage_overflow','open_manhole','potholes','waterlogging_area']
        print("  polygons by class:")
        for cid, n in sorted(poly_by_class.items()):
            nm = names[cid] if cid < len(names) else f"INVALID({cid})"
            print(f"    {cid}: {nm:22s} {n}")