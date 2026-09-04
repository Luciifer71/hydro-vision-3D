"""
Convert polygon/segment annotations to axis-aligned bounding boxes.

Why: Ultralytics refuses to train on a mixed detect+segment dataset. It
discards ALL segment annotations, which in our case means 8,152 lost
annotations in train, 7,287 of them waterlogging_area — our most important
and worst-performing class.

Converting loses shape information but keeps the annotation. For detection
training that is exactly what we want.

Run with --dry-run first.
"""

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = ['damaged_footpath', 'drainage_overflow', 'open_manhole',
         'potholes', 'waterlogging_area']


def poly_to_box(parts):
    """class x1 y1 x2 y2 ... -> class xc yc w h (all normalised 0-1)."""
    cid = parts[0]
    coords = [float(v) for v in parts[1:]]
    xs = coords[0::2]
    ys = coords[1::2]
    x1, x2 = min(xs), max(xs)
    y1, y2 = min(ys), max(ys)
    # Clamp — a few Roboflow exports have coords slightly outside [0,1]
    x1, y1 = max(0.0, x1), max(0.0, y1)
    x2, y2 = min(1.0, x2), min(1.0, y2)
    w, h = x2 - x1, y2 - y1
    if w <= 0 or h <= 0:
        return None
    return f"{cid} {x1 + w/2:.6f} {y1 + h/2:.6f} {w:.6f} {h:.6f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default="data/final_dataset_v2")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    dataset = ROOT / args.dataset
    if not dataset.exists():
        print(f"ERROR: {dataset} not found")
        return

    if not args.dry_run:
        backup = dataset.parent / f"{dataset.name}_LABELS_BACKUP"
        if backup.exists():
            print(f"Backup already exists at {backup} — leaving it alone.")
        else:
            backup.mkdir(parents=True)
            for split in ("train", "valid", "test"):
                src = dataset / split / "labels"
                if src.exists():
                    shutil.copytree(src, backup / split)
            print(f"[SAFETY] Labels backed up -> {backup}\n")

    grand_conv = grand_kept = grand_dropped = 0

    for split in ("train", "valid", "test"):
        labels = dataset / split / "labels"
        if not labels.exists():
            continue

        converted = kept = dropped = files_changed = 0

        for f in sorted(labels.glob("*.txt")):
            out_lines = []
            changed = False
            for line in f.read_text().splitlines():
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                n = len(parts) - 1
                if n == 4:
                    out_lines.append(line)
                    kept += 1
                elif n >= 6 and n % 2 == 0:
                    box = poly_to_box(parts)
                    if box:
                        out_lines.append(box)
                        converted += 1
                    else:
                        dropped += 1
                    changed = True
                else:
                    dropped += 1
                    changed = True

            if changed:
                files_changed += 1
                if not args.dry_run:
                    f.write_text("\n".join(out_lines) + ("\n" if out_lines else ""))

        print(f"=== {split} ===")
        print(f"  files changed        : {files_changed}")
        print(f"  boxes kept as-is     : {kept}")
        print(f"  polygons -> boxes    : {converted}")
        print(f"  dropped (degenerate) : {dropped}")
        grand_conv += converted; grand_kept += kept; grand_dropped += dropped

    print(f"\nTOTAL converted: {grand_conv}   kept: {grand_kept}   dropped: {grand_dropped}")
    if args.dry_run:
        print("\nDRY RUN — nothing written. Re-run without --dry-run to apply.")
    else:
        print("\nDone. Now re-run scripts/check_annotation_format.py to verify"
              "\npolygon count is 0 everywhere.")


if __name__ == "__main__":
    main()