#!/usr/bin/env python3
"""
HYDRO-VISION-3D — Model evaluation
===================================

Produces the numbers we are prepared to defend, and the ones we are not.

Three things this answers that `yolo val` alone does not:

  1. Per-class operating point. Overall mAP hides a class that scores zero.
     We report every class separately and flag any that is untrained.

  2. Optimal confidence per class. The F1-confidence curve peaks at a
     different threshold for each class. Using one global threshold leaves
     recall on the table for the weak classes and precision on the table for
     the strong ones.

  3. Consolidation ratio. Our core claim is that N frame-detections become
     one incident. That ratio is measurable and we measure it.

Usage:
    python tools/evaluate.py                                  # defaults
    python tools/evaluate.py --weights runs/x/weights/best.pt
    python tools/evaluate.py --session outputs/sessions/S-2026...
    python tools/evaluate.py --compare best_old.pt            # A/B
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent

CLASS_NAMES = [
    "damaged_footpath",
    "drainage_overflow",
    "open_manhole",
    "potholes",
    "waterlogging_area",
]


# ---------------------------------------------------------------------------
# Core evaluation
# ---------------------------------------------------------------------------

def evaluate_model(weights: Path, data_yaml: Path, split: str = "val",
                   imgsz: int = 640, device: str | None = None) -> dict[str, Any]:
    """Run validation and pull out the per-class numbers."""
    from ultralytics import YOLO

    print(f"[EVAL] weights : {weights}")
    print(f"[EVAL] data    : {data_yaml}")
    print(f"[EVAL] split   : {split}")

    model = YOLO(str(weights))

    names = model.names
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]

    if list(names) != CLASS_NAMES:
        print(f"[EVAL WARNING] Model class order differs from expected.")
        print(f"  model    : {list(names)}")
        print(f"  expected : {CLASS_NAMES}")

    kwargs: dict[str, Any] = dict(data=str(data_yaml), split=split,
                                  imgsz=imgsz, verbose=False)
    if device:
        kwargs["device"] = device

    r = model.val(**kwargs)

    per_class = []
    for i, name in enumerate(names):
        def _at(seq, idx, default=0.0):
            try:
                return float(seq[idx])
            except (IndexError, TypeError):
                return default

        p = _at(r.box.p, i)
        rec = _at(r.box.r, i)
        ap50 = _at(r.box.ap50, i)
        ap = _at(r.box.maps, i)
        f1 = (2 * p * rec / (p + rec)) if (p + rec) > 0 else 0.0

        per_class.append({
            "class": name,
            "precision": round(p, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "map50": round(ap50, 4),
            "map50_95": round(ap, 4),
            # A class that scores exactly zero across the board almost always
            # means no training data, not a hard class. Worth stating plainly.
            "untrained": (p == 0.0 and rec == 0.0 and ap50 == 0.0),
        })

    return {
        "weights": str(weights),
        "data_yaml": str(data_yaml),
        "split": split,
        "imgsz": imgsz,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "overall": {
            "precision": round(float(r.box.mp), 4),
            "recall": round(float(r.box.mr), 4),
            "map50": round(float(r.box.map50), 4),
            "map50_95": round(float(r.box.map), 4),
        },
        "per_class": per_class,
        "speed_ms": {k: round(float(v), 2) for k, v in (r.speed or {}).items()},
    }


def sweep_thresholds(weights: Path, data_yaml: Path, split: str = "val",
                     imgsz: int = 640, device: str | None = None,
                     points: tuple[float, ...] = (0.05, 0.10, 0.15, 0.20, 0.25,
                                                  0.30, 0.35, 0.40, 0.45, 0.50,
                                                  0.55, 0.60)) -> dict[str, Any]:
    """Find the confidence threshold that maximises F1, per class.

    This is why we use per-class thresholds rather than one global value:
    a class with poor recall needs a lower bar than a class with high
    precision, and the optimum is measurable rather than guessed.
    """
    from ultralytics import YOLO

    model = YOLO(str(weights))
    names = model.names
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]

    rows: list[dict[str, Any]] = []
    print(f"[SWEEP] {len(points)} thresholds x {len(names)} classes")

    for conf in points:
        kwargs: dict[str, Any] = dict(data=str(data_yaml), split=split,
                                      imgsz=imgsz, conf=conf, verbose=False)
        if device:
            kwargs["device"] = device
        r = model.val(**kwargs)

        entry: dict[str, Any] = {"conf": conf, "classes": {}}
        for i, name in enumerate(names):
            try:
                p = float(r.box.p[i]); rec = float(r.box.r[i])
            except (IndexError, TypeError):
                p = rec = 0.0
            f1 = (2 * p * rec / (p + rec)) if (p + rec) > 0 else 0.0
            entry["classes"][name] = {"p": round(p, 4), "r": round(rec, 4),
                                      "f1": round(f1, 4)}
        rows.append(entry)
        print(f"  conf={conf:.2f}  mAP50={float(r.box.map50):.4f}")

    best: dict[str, Any] = {}
    for name in names:
        best_row = max(rows, key=lambda e: e["classes"][name]["f1"])
        best[name] = {
            "optimal_conf": best_row["conf"],
            "f1_at_optimal": best_row["classes"][name]["f1"],
            "precision": best_row["classes"][name]["p"],
            "recall": best_row["classes"][name]["r"],
        }

    return {"sweep": rows, "recommended_class_conf": best}


def analyse_session(session_dir: Path) -> dict[str, Any] | None:
    """Consolidation statistics from a real pipeline run.

    This is the number behind our central claim. If raw tracks and confirmed
    hazards are the same, consolidation is not doing anything.
    """
    hazards_json = session_dir / "hazards.json"
    if not hazards_json.exists():
        print(f"[SESSION] No hazards.json in {session_dir}")
        return None

    d = json.loads(hazards_json.read_text())
    summary = d.get("summary", {})
    hazards = d.get("hazards", [])

    raw = summary.get("raw_tracks", 0)
    confirmed = len(hazards)

    total_detections = sum(h.get("detections_count", 0) for h in hazards)

    by_class: dict[str, int] = {}
    by_band: dict[str, int] = {}
    for h in hazards:
        by_class[h.get("class_name", "?")] = by_class.get(h.get("class_name", "?"), 0) + 1
        by_band[h.get("severity_band", "?")] = by_band.get(h.get("severity_band", "?"), 0) + 1

    durations = [h.get("duration_s", 0.0) for h in hazards]
    confs = [h.get("confidence_max", 0.0) for h in hazards]

    def _mean(xs):
        return round(sum(xs) / len(xs), 3) if xs else 0.0

    return {
        "session_id": summary.get("session_id"),
        "frames_processed": summary.get("frames_processed"),
        "raw_tracks": raw,
        "confirmed_hazards": confirmed,
        "rejected_by_gate": max(0, raw - confirmed),
        "total_frame_detections": total_detections,
        # The headline: how many frame-level detections collapsed into one
        # actionable record.
        "consolidation_ratio": (round(total_detections / confirmed, 1)
                                if confirmed else None),
        "confirmation_rate": (round(confirmed / raw, 3) if raw else None),
        "by_class": by_class,
        "by_severity_band": by_band,
        "mean_duration_s": _mean(durations),
        "mean_confidence": _mean(confs),
        "hazards_with_evidence": sum(1 for h in hazards if h.get("evidence_image")),
        "hazards_with_location": sum(1 for h in hazards if h.get("lat") is not None),
        "hazards_with_metric_area": sum(1 for h in hazards if h.get("area_m2") is not None),
    }


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def print_report(res: dict[str, Any], session: dict[str, Any] | None = None,
                 sweep: dict[str, Any] | None = None) -> None:
    w = 78
    print("\n" + "=" * w)
    print("HYDRO-VISION-3D — EVALUATION REPORT")
    print("=" * w)
    print(f"Weights : {res['weights']}")
    print(f"Dataset : {res['data_yaml']}  ({res['split']} split, imgsz {res['imgsz']})")

    o = res["overall"]
    print(f"\nOVERALL")
    print(f"  Precision   {o['precision']:.4f}")
    print(f"  Recall      {o['recall']:.4f}")
    print(f"  mAP50       {o['map50']:.4f}")
    print(f"  mAP50-95    {o['map50_95']:.4f}")

    print(f"\nPER CLASS")
    print(f"  {'class':<22}{'P':>8}{'R':>8}{'F1':>8}{'mAP50':>9}{'mAP50-95':>10}")
    print("  " + "-" * (w - 4))
    for c in res["per_class"]:
        flag = "  << NO TRAINING DATA" if c["untrained"] else ""
        print(f"  {c['class']:<22}{c['precision']:>8.3f}{c['recall']:>8.3f}"
              f"{c['f1']:>8.3f}{c['map50']:>9.3f}{c['map50_95']:>10.3f}{flag}")

    untrained = [c["class"] for c in res["per_class"] if c["untrained"]]
    if untrained:
        print(f"\n  NOTE: {', '.join(untrained)} scored zero on every metric.")
        print(f"  This indicates absent training data, not model difficulty.")
        print(f"  These classes should be disabled rather than reported as working.")

    if sweep:
        print(f"\nRECOMMENDED PER-CLASS CONFIDENCE (max F1)")
        print(f"  {'class':<22}{'conf':>8}{'F1':>8}{'P':>8}{'R':>8}")
        print("  " + "-" * (w - 4))
        for name, b in sweep["recommended_class_conf"].items():
            print(f"  {name:<22}{b['optimal_conf']:>8.2f}{b['f1_at_optimal']:>8.3f}"
                  f"{b['precision']:>8.3f}{b['recall']:>8.3f}")

    if session:
        s = session
        print(f"\nCONSOLIDATION (session {s['session_id']})")
        print(f"  Frames processed          {s['frames_processed']}")
        print(f"  Frame-level detections    {s['total_frame_detections']}")
        print(f"  Raw tracks                {s['raw_tracks']}")
        print(f"  Confirmed hazards         {s['confirmed_hazards']}")
        print(f"  Rejected by gate          {s['rejected_by_gate']}")
        if s["consolidation_ratio"]:
            print(f"  Consolidation ratio       {s['consolidation_ratio']}:1")
        print(f"\n  With evidence image       {s['hazards_with_evidence']}/{s['confirmed_hazards']}")
        print(f"  With location             {s['hazards_with_location']}/{s['confirmed_hazards']}")
        print(f"  With metric area          {s['hazards_with_metric_area']}/{s['confirmed_hazards']}")
        if s["by_class"]:
            print(f"\n  By class:")
            for k, v in sorted(s["by_class"].items(), key=lambda kv: -kv[1]):
                print(f"    {k:<22}{v}")
        if s["by_severity_band"]:
            print(f"\n  By severity:")
            for band in ("CRITICAL", "HIGH", "MODERATE", "LOW"):
                if band in s["by_severity_band"]:
                    print(f"    {band:<22}{s['by_severity_band'][band]}")

    print("\n" + "=" * w)


def write_html(res: dict[str, Any], out: Path,
               session: dict[str, Any] | None = None,
               sweep: dict[str, Any] | None = None) -> None:
    """A single self-contained page. Something to hand over, not just print."""

    def rows_per_class() -> str:
        html = ""
        for c in res["per_class"]:
            cls = ' class="warn"' if c["untrained"] else ""
            note = " &larr; no training data" if c["untrained"] else ""
            html += (f"<tr{cls}><td>{c['class']}{note}</td>"
                     f"<td>{c['precision']:.3f}</td><td>{c['recall']:.3f}</td>"
                     f"<td>{c['f1']:.3f}</td><td>{c['map50']:.3f}</td>"
                     f"<td>{c['map50_95']:.3f}</td></tr>")
        return html

    sweep_html = ""
    if sweep:
        sweep_html = "<h2>Recommended per-class confidence</h2><table><tr>" \
                     "<th>Class</th><th>Optimal conf</th><th>F1</th>" \
                     "<th>Precision</th><th>Recall</th></tr>"
        for name, b in sweep["recommended_class_conf"].items():
            sweep_html += (f"<tr><td>{name}</td><td>{b['optimal_conf']:.2f}</td>"
                           f"<td>{b['f1_at_optimal']:.3f}</td>"
                           f"<td>{b['precision']:.3f}</td>"
                           f"<td>{b['recall']:.3f}</td></tr>")
        sweep_html += "</table><p class='note'>Each class peaks at a different " \
                      "threshold. A single global confidence value is a compromise " \
                      "that suits none of them.</p>"

    session_html = ""
    if session:
        s = session
        ratio = f"{s['consolidation_ratio']}:1" if s["consolidation_ratio"] else "—"
        session_html = f"""
        <h2>Consolidation — session {s['session_id']}</h2>
        <div class="grid">
          <div class="kpi"><span>{s['total_frame_detections']}</span>frame detections</div>
          <div class="kpi"><span>{s['confirmed_hazards']}</span>confirmed hazards</div>
          <div class="kpi"><span>{ratio}</span>consolidation ratio</div>
          <div class="kpi"><span>{s['rejected_by_gate']}</span>rejected by gate</div>
        </div>
        <table>
          <tr><th>Evidence image present</th><td>{s['hazards_with_evidence']} / {s['confirmed_hazards']}</td></tr>
          <tr><th>Location available</th><td>{s['hazards_with_location']} / {s['confirmed_hazards']}</td></tr>
          <tr><th>Metric area available</th><td>{s['hazards_with_metric_area']} / {s['confirmed_hazards']}</td></tr>
          <tr><th>Mean visible duration</th><td>{s['mean_duration_s']} s</td></tr>
          <tr><th>Mean peak confidence</th><td>{s['mean_confidence']}</td></tr>
        </table>"""

    o = res["overall"]
    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Hydro-Vision-3D Evaluation</title>
<style>
 body{{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:960px;
      margin:40px auto;padding:0 20px;color:#1a1a1a;line-height:1.5}}
 h1{{border-bottom:2px solid #111;padding-bottom:8px}}
 h2{{margin-top:36px;color:#333}}
 table{{border-collapse:collapse;width:100%;margin:16px 0}}
 th,td{{border:1px solid #ddd;padding:8px 10px;text-align:left}}
 th{{background:#f4f4f4;font-weight:600}}
 tr.warn{{background:#fff6f6}}
 .grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}}
 .kpi{{background:#f7f7f7;border:1px solid #e0e0e0;border-radius:6px;
       padding:14px;text-align:center;font-size:.82rem;color:#666}}
 .kpi span{{display:block;font-size:1.7rem;font-weight:700;color:#111}}
 .note{{color:#666;font-size:.9rem;font-style:italic}}
 .meta{{color:#888;font-size:.85rem}}
</style></head><body>
<h1>Hydro-Vision-3D — Model Evaluation</h1>
<p class="meta">{res['weights']}<br>{res['data_yaml']} ({res['split']} split,
imgsz {res['imgsz']})<br>Generated {res['evaluated_at']}</p>

<h2>Overall</h2>
<div class="grid">
  <div class="kpi"><span>{o['map50']:.3f}</span>mAP50</div>
  <div class="kpi"><span>{o['map50_95']:.3f}</span>mAP50-95</div>
  <div class="kpi"><span>{o['precision']:.3f}</span>precision</div>
  <div class="kpi"><span>{o['recall']:.3f}</span>recall</div>
</div>

<h2>Per class</h2>
<table><tr><th>Class</th><th>Precision</th><th>Recall</th><th>F1</th>
<th>mAP50</th><th>mAP50-95</th></tr>{rows_per_class()}</table>
<p class="note">Overall mAP averages across classes and can hide a class that
detects nothing. Per-class figures are reported so that cannot happen.</p>

{sweep_html}
{session_html}
</body></html>"""

    out.write_text(html, encoding="utf-8")
    print(f"[EVAL] HTML report -> {out}")


# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Evaluate a Hydro-Vision model.")
    ap.add_argument("--weights", default="best.pt")
    ap.add_argument("--data", default="data/final_dataset_v2/data.yaml")
    ap.add_argument("--split", default="val", choices=["train", "val", "test"])
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--device", default=None,
                    help="cuda | mps | cpu. Auto-detected if omitted.")
    ap.add_argument("--session", default=None,
                    help="Session directory for consolidation stats.")
    ap.add_argument("--sweep", action="store_true",
                    help="Run the confidence sweep (slow: one val per point).")
    ap.add_argument("--compare", default=None,
                    help="Second weights file to compare against.")
    ap.add_argument("--out", default="outputs/evaluation")
    args = ap.parse_args()

    weights = ROOT / args.weights
    data_yaml = ROOT / args.data
    if not weights.exists():
        print(f"ERROR: weights not found: {weights}")
        return 1
    if not data_yaml.exists():
        print(f"ERROR: data.yaml not found: {data_yaml}")
        return 1

    out_dir = ROOT / args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    res = evaluate_model(weights, data_yaml, args.split, args.imgsz, args.device)

    sweep = None
    if args.sweep:
        sweep = sweep_thresholds(weights, data_yaml, args.split,
                                 args.imgsz, args.device)

    session = None
    if args.session:
        session = analyse_session(ROOT / args.session)

    print_report(res, session, sweep)

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    bundle = {"evaluation": res, "sweep": sweep, "session": session}
    json_path = out_dir / f"eval_{stamp}.json"
    json_path.write_text(json.dumps(bundle, indent=2))
    print(f"[EVAL] JSON -> {json_path}")

    write_html(res, out_dir / f"eval_{stamp}.html", session, sweep)

    if args.compare:
        other = ROOT / args.compare
        if not other.exists():
            print(f"[COMPARE] not found: {other}")
            return 0
        print(f"\n[COMPARE] Evaluating {other.name} ...")
        res_b = evaluate_model(other, data_yaml, args.split, args.imgsz, args.device)

        print(f"\n{'class':<22}{'A':>10}{'B':>10}{'delta':>10}")
        print("-" * 52)
        regressed = []
        for a, b in zip(res["per_class"], res_b["per_class"]):
            d = b["map50"] - a["map50"]
            flag = ""
            if d < -0.02:
                flag = "  REGRESSED"
                regressed.append(a["class"])
            elif d > 0.02:
                flag = "  improved"
            print(f"{a['class']:<22}{a['map50']:>10.3f}{b['map50']:>10.3f}"
                  f"{d:>+10.3f}{flag}")
        da = res_b["overall"]["map50"] - res["overall"]["map50"]
        print("-" * 52)
        print(f"{'OVERALL mAP50':<22}{res['overall']['map50']:>10.3f}"
              f"{res_b['overall']['map50']:>10.3f}{da:>+10.3f}")

        print("\nVERDICT")
        if regressed:
            print(f"  {len(regressed)} class(es) regressed: {', '.join(regressed)}")
            print("  Do not deploy B without understanding why.")
        elif da > 0:
            print("  B improves overall with no class regression.")
        else:
            print("  No regression, but no overall gain. Check the classes you")
            print("  actually care about before deciding.")

    return 0


if __name__ == "__main__":
    sys.exit(main())