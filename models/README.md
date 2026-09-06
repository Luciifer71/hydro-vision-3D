@"
# models/

frozen/  — the only two models the backend may load. NOT in git (50MB each).
           Copy by hand when setting up a machine.
archive/ — superseded 5-class weights, kept for provenance.
base/    — pretrained COCO weights. train.py starts from these.

| File | Trained | Classes | mAP50 | Role |
|---|---|---|---|---|
| frozen/yolov8m_5class_20260906.pt | 6 Sep 2026 | 5 | 0.645 | PRIMARY |
| frozen/yolov8s_5class_20260905.pt | 5 Sep 2026 | 5 | 0.599 | FALLBACK |

Older lineages live in runs/ only, never in frozen/:
  yolov8s_6class_OLD    — 6-class, severe domain gap (0.759 val / 0.014 real)
  yolov8s_7class_OLD    — original 7-class taxonomy

## Switching models
Edit config/runtime.json:
  "model": { "weights": "models/frozen/yolov8s_5class_20260905.pt" }
Restart the backend. No code change. The backend refuses to start if the
file is missing or its class list doesn't match src/schema.py.
"@ | Out-File -Encoding utf8 models\README.md