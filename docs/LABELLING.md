@"
# HYDRO-VISION-3D — Labelling rule for unpaved surfaces

Written before annotation of the ELCIA organiser footage (GX010694.MP4,
Electronics City, Bengaluru). Applied uniformly to every frame.

## Context
Our training set is predominantly asphalt. The organiser footage is an
unpaved compacted-earth road with ruts, loose stone and rubble. On this
surface the visual signature of a pothole is much weaker, and dry tonal
patches were being misread as waterlogging at high confidence.

## LABEL as ``potholes``
1. Distinct depression with a visible rim (edge where intact surface
   drops away), not a gradual dip.
2. Roughly 0.3 m or larger. In-frame references: autorickshaw ~1.4 m
   wide, motorcycle ~0.7 m, person's shoulders ~0.45 m. Smaller than a
   shoulder width -> skip.
3. Interior visibly darker than surrounding surface (indicates depth,
   not tone).
4. Discrete. A single hole, not a continuous stretch of washboard rut.

## DO NOT label
- Tyre ruts, washboard corrugation (road-condition, not a point hazard)
- Loose stones, gravel, rubble sitting on the surface
- Shadows from vehicles, buildings or people
- Tonal variation in dry earth
- Anything uncertain. A missing label is a smaller error than a wrong one.

## The dispatch test
Would a municipal engineer send a crew with material to fill this one
spot? If the honest answer is "no, this road needs resurfacing", it is
not a pothole.

## Negatives
Frames with no qualifying hazard are included with empty annotations,
target ~30% of the set. These teach the model that ordinary rutted
earth and dry pale patches are not hazards. This directly addresses the
waterlogging false positives (peaked at 0.815 on dry ground).

## Train/test split
Frames 0-2200 -> training. Frames 2200-3725 -> held out, never trained
on, used to measure whether fine-tuning actually generalised.
"@ | Out-File -Encoding utf8 docs\LABELLING.md