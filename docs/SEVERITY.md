# How Hydro-Vision-3D Scores Hazard Severity

Version 1.0 · Team Drone404, GSFC University

This document explains exactly how the system decides that one hazard is
CRITICAL and another is LOW. Every number is reproducible: the same hazard
always produces the same score.

---

## 1. The problem we are solving

A one-minute drone flight produces thousands of detections. A municipal
engineer cannot act on thousands of items. They need to know **what to fix
first**.

So the question is not "what did we find?" It is "in what order should a
repair crew visit these?"

That is a ranking problem, and ranking needs a score.

---

## 2. What makes a hazard urgent

Before writing any formula we asked: what actually makes one road defect
more urgent than another? Four things.

**1. What kind of hazard it is.**
An open manhole can kill someone tonight. A cracked footpath will still be
a cracked footpath next month. The type matters more than anything else.

**2. How big it is.**
A puddle covering half a road blocks traffic. A puddle the size of a dinner
plate does not.

**3. How long it stayed in view.**
A hazard the drone flew over for eight seconds is a large, real, continuous
problem. Something that flickered for half a second is more likely to be a
shadow or a wet patch.

**4. How confident the detector was.**
A detection at 0.92 confidence is more trustworthy than one at 0.41. We
should not send a crew to something the AI was unsure about.

---

## 3. The formula

```
severity = 0.45 x class_risk
         + 0.25 x extent
         + 0.15 x persistence
         + 0.15 x confidence
```

All four inputs are scaled 0 to 1, and the weights add to 1.00, so the final
score is always between 0 and 1.

### Why these weights

| Factor | Weight | Reason |
|---|---|---|
| class_risk | **0.45** | The single biggest factor. A small open manhole is more dangerous than a large crack. Danger comes mostly from *what it is*. |
| extent | **0.25** | Size matters, but a big crack is still just a crack. Second most important. |
| persistence | **0.15** | Mostly a reliability filter. Long visibility means the detection is real. |
| confidence | **0.15** | Same weight as persistence. Useful, but the AI being confident does not make a hazard dangerous. |

We deliberately gave confidence a low weight. **A model can be confidently
wrong.** Basing urgency mainly on model certainty would be a mistake.

---

## 4. The four inputs, one at a time

### 4.1 class_risk — how dangerous is this type?

Fixed values, 0 to 1:

| Hazard type | Risk | Why |
|---|---|---|
| open_manhole | **1.00** | Immediate danger to life. A person or two-wheeler can fall in. Highest possible. |
| waterlogging_area | **0.70** | Hides what is underneath. Causes accidents, blocks roads, spreads disease. |
| drainage_overflow | **0.65** | Health hazard, and a sign of a blockage that will get worse. |
| potholes | **0.55** | Common cause of two-wheeler accidents and vehicle damage. |
| damaged_footpath | **0.40** | Real but slower-acting. Pedestrians can usually walk around it. |

These were set by asking one question: **can this hurt someone today?**
Open manhole — yes, immediately. Damaged footpath — unlikely today.

### 4.2 extent — how big, compared to the others?

We do **not** use raw size. We use the hazard's **percentile** within the
session.

If there are 10 hazards and this one is the 8th largest:

```
extent = 7 / 9 = 0.78
```

(7 hazards are smaller, out of 9 possible comparisons.)

**Why percentile instead of actual area:**

Actual size in square metres depends on the drone's altitude. Fly at 5
metres and everything looks huge. Fly at 25 metres and the same hazard
looks small. If we used raw size, the same pothole would score differently
depending on flight height. That would be wrong.

Percentile is **altitude-independent**. It answers "is this one of the
bigger problems on this road?" — which is what a repair crew actually
cares about.

When we do have a verified altitude, we also report area in square metres
and label the score `severity_basis: "metric"`. When we do not, we label it
`severity_basis: "relative"`. **The label is always shown**, so nobody
mistakes a relative ranking for a physical measurement.

### 4.3 persistence — how long was it visible?

```
persistence = this hazard's duration / longest duration in the session
```

Capped at 1.0.

If the longest-seen hazard was visible 8.0 seconds and this one 6.0 seconds:

```
persistence = 6.0 / 8.0 = 0.75
```

**Why relative and not absolute:** a 10-second video and a 10-minute video
have completely different scales. Dividing by the session maximum makes it
work for both.

### 4.4 confidence — how sure was the detector?

The **highest** confidence seen across all frames of that hazard.

We use the peak rather than the average deliberately. A hazard seen for 200
frames will have low-confidence frames at the edges as it enters and leaves
view. Averaging punishes it for that. The best single view is the fairest
measure of whether the detector really identified it.

---

## 5. Turning the score into a band

| Score range | Band | What it means |
|---|---|---|
| 0.00 – 0.34 | **LOW** | Log it. Fix during routine maintenance. |
| 0.35 – 0.59 | **MODERATE** | Schedule within the normal cycle. |
| 0.60 – 0.81 | **HIGH** | Dispatch a crew. Do not leave for next month. |
| 0.82 – 1.00 | **CRITICAL** | Act today. Barricade if needed. |

### Where these boundaries come from

They are not arbitrary. We worked out what each class can actually score.

Take a **pothole** (class_risk 0.55). Its fixed part is:
```
0.45 x 0.55 = 0.2475
```
The other three factors contribute at most `0.25 + 0.15 + 0.15 = 0.55`.

So a pothole can score between **0.2475** (smallest, briefest, least
confident) and **0.7975** (largest, longest, most confident).

Doing this for every class:

| Class | Minimum possible | Maximum possible |
|---|---|---|
| open_manhole | 0.450 | **1.000** |
| waterlogging_area | 0.315 | 0.865 |
| drainage_overflow | 0.293 | 0.843 |
| potholes | 0.248 | 0.798 |
| damaged_footpath | 0.180 | 0.730 |

Now the boundaries make sense:

- **0.82 (CRITICAL)** — only `open_manhole`, `waterlogging_area` and
  `drainage_overflow` can reach this, and only when they are also large,
  persistent and confidently detected. **A pothole can never be CRITICAL,
  no matter how big.** That is intentional.
- **0.60 (HIGH)** — every class can reach this if significant. Nothing is
  permanently locked out of being urgent.
- **0.35 (MODERATE)** — above the floor of every class, so a tiny hazard of
  any type starts at LOW and has to earn its way up.

**This is the key design point:** the bands were chosen *after* calculating
the possible range of each class, so the boundaries mean something. They
were not picked because they looked reasonable.

---

## 6. Worked example — from our own output

Real hazard from session `S-20260905-191517`:

```
HAZ-8C4C02   waterlogging_area   conf=0.92   seen=211x   7.0s   CRITICAL
```

Session context: 46 hazards, longest duration 7.0s, this one is the largest.

**Step 1 — class_risk**
```
waterlogging_area = 0.70
```

**Step 2 — extent** (largest of 46)
```
extent = 45 / 45 = 1.00
```

**Step 3 — persistence**
```
persistence = 7.0 / 7.0 = 1.00
```

**Step 4 — confidence**
```
confidence = 0.92
```

**Step 5 — the sum**
```
0.45 x 0.70  = 0.3150
0.25 x 1.00  = 0.2500
0.15 x 1.00  = 0.1500
0.15 x 0.92  = 0.1380
               ------
               0.8530
```

**0.853 is above 0.82, so: CRITICAL.** Priority score 85 out of 100.

That matches what the system output. A judge can verify it by hand.

### A contrasting example

```
HAZ-15C478   waterlogging_area   conf=0.73   seen=56x   2.07s   HIGH
```

Same class, much smaller and briefer. Say it sits at the 60th percentile:

```
0.45 x 0.70   = 0.3150
0.25 x 0.60   = 0.1500
0.15 x 0.296  = 0.0444    (2.07 / 7.0)
0.15 x 0.73   = 0.1095
                ------
                0.6189
```

**0.619 → HIGH, not CRITICAL.** Same hazard type, correctly ranked lower
because it is smaller, briefer and less confidently detected.

---

## 7. Why we use median, not a moving average

A hazard is seen across many frames, each giving a slightly different size.
We need one number.

Two options:

**Exponential moving average (EMA):**
```
smoothed = 0.7 x previous + 0.3 x current
```

**Median:** the middle value of all measurements.

We chose **median**, for two reasons.

**1. One bad frame cannot distort it.** If motion blur produces one enormous
box, EMA carries that error forward through every later frame. Median
ignores it entirely — a single outlier barely moves the middle of a sorted
list.

**2. EMA lags when the drone moves.** As the drone approaches a hazard, the
hazard genuinely gets bigger in frame. EMA always trails the true value
because it keeps weighting old, smaller measurements.

Median is the standard robust choice when outliers are expected, and motion
blur, partial occlusion and edge-of-frame clipping guarantee outliers here.

---

## 8. What this score does not claim

Being honest about limitations is part of the method.

- **It is not calibrated against real repair data.** We have no dataset of
  municipal repair urgency to fit against. This is a documented, reasoned
  heuristic — not an empirically validated model.
- **The class risk values are engineering judgement.** Defensible, but not
  derived from accident statistics.
- **Percentile ranking is within-session only.** A hazard scoring 0.85 in a
  quiet street would score lower on a badly damaged road. The score answers
  "what to fix first *here*", not "how bad is this road compared to others".
- **It inherits the detector's errors.** If the model misses a hazard, it
  gets no score at all.
- **damaged_footpath currently scores nothing.** Our training data contained
  zero instances of it, so it is disabled rather than reporting fake results.

---

## 9. Reproducibility

Everything needed to reproduce a score is stored with the session:

```json
"severity": {
  "weights": {
    "class_base": 0.45, "extent": 0.25,
    "persistence": 0.15, "confidence": 0.15
  },
  "class_base_risk": { "open_manhole": 1.00, "waterlogging_area": 0.70, ... },
  "bands": [[0.00,"LOW"],[0.35,"MODERATE"],[0.60,"HIGH"],[0.82,"CRITICAL"]]
}
```

Config in `config/runtime.json`, implementation in `HazardRegistry._score()`.
Same input always gives the same output — no randomness anywhere in the
scoring path.

---

## Summary

| Question | Answer |
|---|---|
| Is it reproducible? | Yes. Deterministic, same input to same output. |
| Are the weights arbitrary? | No. Chosen by asking what makes a hazard urgent, and published. |
| Are the bands arbitrary? | No. Derived from the possible score range of each class. |
| Is it validated against real repair data? | **No.** It is a documented heuristic. We say so. |
| Can a judge check it by hand? | Yes. Section 6 shows a full worked example. |
