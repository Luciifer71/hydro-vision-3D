"""
Compare two models per class before deploying either.

The rule: a fine-tune ships only if it improves the failing classes WITHOUT
regressing the ones that already work. Overall mAP hides exactly that trade.

Usage:
    python scripts/compare_models.py
    python scripts/compare_models.py --a best.pt --b runs/domain_adapt_v1/weights/best.pt
"""

import argparse
from pathlib import Path

from ultralytics import YOLO

ROOT = Path(__file__).resolve().parent.parent
CLASSES = ["cracks", "damaged_footpath", "drainage_overflow",
           "open_manhole", "potholes", "waterlogging_area"]


def evaluate(weights: Path, data: str):
    m = YOLO(str(weights))
    r = m.val(data=data, verbose=False)
    return {
        "map50": float(r.box.map50),
        "map": float(r.box.map),
        "per_class_map": [float(x) for x in r.box.maps],
        "precision": [float(x) for x in r.box.p],
        "recall": [float(x) for x in r.box.r],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--a", default="best.pt", help="current model")
    ap.add_argument("--b", default="runs/domain_adapt_v1/weights/best.pt",
                    help="fine-tuned model")
    ap.add_argument("--data", default="data/yolo_ready_dataset/data.yaml")
    args = ap.parse_args()

    pa, pb = ROOT / args.a, ROOT / args.b
    for p in (pa, pb):
        if not p.exists():
            print(f"ERROR: not found: {p}")
            return

    print(f"A (current)    : {args.a}")
    print(f"B (fine-tuned) : {args.b}")
    print(f"Test set       : {args.data}\n")

    print("Evaluating A...")
    a = evaluate(pa, args.data)
    print("Evaluating B...\n")
    b = evaluate(pb, args.data)

    print(f"{'class':<22}{'A mAP50-95':>12}{'B mAP50-95':>12}{'delta':>10}")
    print("-" * 56)
    regressions = []
    for i, c in enumerate(CLASSES):
        va = a["per_class_map"][i] if i < len(a["per_class_map"]) else 0.0
        vb = b["per_class_map"][i] if i < len(b["per_class_map"]) else 0.0
        d = vb - va
        flag = "  <-- REGRESSED" if d < -0.02 else ("  ++" if d > 0.02 else "")
        if d < -0.02:
            regressions.append(c)
        print(f"{c:<22}{va:>12.3f}{vb:>12.3f}{d:>+10.3f}{flag}")

    print("-" * 56)
    print(f"{'OVERALL mAP50':<22}{a['map50']:>12.3f}{b['map50']:>12.3f}"
          f"{b['map50']-a['map50']:>+10.3f}")
    print(f"{'OVERALL mAP50-95':<22}{a['map']:>12.3f}{b['map']:>12.3f}"
          f"{b['map']-a['map']:>+10.3f}")

    print("\nVERDICT")
    if regressions:
        print(f"  {len(regressions)} class(es) regressed: {', '.join(regressions)}")
        print("  Do NOT deploy as-is. Lower --lr (try 0.0004) and retrain,")
        print("  or add more examples of the regressed classes.")
    elif b["map50"] > a["map50"]:
        print("  B improves overall with no class regression. Safe to deploy.")
    else:
        print("  No regression, but no overall gain either. Check whether the")
        print("  classes you actually care about improved before deciding.")

    print("\nNOTE: this evaluates on the ORIGINAL validation set. The real test")
    print("is scripts/probe_frames.py on frames from YOUR video — that is the")
    print("distribution you deploy on, and the reason for this fine-tune.")


if __name__ == "__main__":
    main()