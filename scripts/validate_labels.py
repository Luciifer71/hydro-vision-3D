import sys, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LABELS = ROOT / "data/unified_dataset/labels"
NC = 5
NAMES = ["potholes","waterlogging_area","drainage_overflow","open_manhole","damaged_footpath"]

counts = collections.Counter()
bad_files, bad_lines = [], 0
files = list(LABELS.rglob("*.txt"))
print(f"Scanning {len(files)} label files...\n")

for f in files:
    for i, line in enumerate(f.read_text().splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            cid = int(line.split()[0])
        except (ValueError, IndexError):
            bad_files.append(f"{f.name}:{i} unparseable"); bad_lines += 1; continue
        if cid < 0 or cid >= NC:
            bad_files.append(f"{f.name}:{i} class_id={cid} OUT OF RANGE"); bad_lines += 1
        counts[cid] += 1

print("Class distribution:")
for cid in sorted(counts):
    name = NAMES[cid] if cid < NC else f"INVALID({cid})"
    print(f"  {cid}: {name:22s} {counts[cid]}")

if bad_lines:
    print(f"\n*** {bad_lines} INVALID LINES ***")
    for b in bad_files[:20]:
        print("  ", b)
    sys.exit(1)
print("\nAll class IDs in range 0-4.")