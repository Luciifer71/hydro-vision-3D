# HYDRO-VISION-3D

**AI-Powered Ground Control Station for Monsoon, Roads & Civic
Infrastructure Intelligence**

**Team:** Drone404\
**Institution:** GSFC University\
**Event:**  Hackathon\
------------------------------------------------------------------------

## 1. IDEA Overview

HYDRO-VISION-3D is a drone and video-based infrastructure inspection
platform for identifying common monsoon and road-related civic hazards
and turning those observations into structured maintenance information.

The system currently works with five hazard categories:

    Class ID Hazard
  ---------- -------------------
           0 Damaged Footpath
           1 Drainage Overflow
           2 Open Manhole
           3 Potholes
           4 Waterlogging Area

The main idea is simple:

> **Do not stop at detecting a defect. Turn the detection into an
> incident that can be reviewed, prioritized and acted upon.**

The IDEA combines computer vision, video analysis, temporal
tracking, evidence capture, risk analysis, spatial/depth analysis,
mapping and a municipal operations interface.

------------------------------------------------------------------------

## 2. The Problem

Monsoon conditions can expose or worsen road and civic infrastructure
problems quickly. For a city authority, identifying a problem is only
the first step.

A useful inspection system should answer:

-   What is the problem?
-   Where was it observed?
-   When was it observed?
-   How serious is it?
-   What evidence supports it?
-   What action should follow?

HYDRO-VISION-3D is designed to provide this information from aerial or
inspection video through a single Ground Control Station.

------------------------------------------------------------------------

## 3. From Detection to Civic Action

A basic computer-vision system might produce:

``` text
"Pothole detected"
```

HYDRO-VISION-3D is designed to produce a richer record:

``` text
Video
  |
  v
Detection
  |
  v
Temporal Observation
  |
  v
Incident
  |
  +---- Evidence
  |
  +---- Risk / Severity
  |
  +---- Spatial Context
  |
  v
Municipal Action
```

This distinction is central to the IDEA.

**YOLO is the perception layer; the application around it provides the
operational context.**

------------------------------------------------------------------------

# 4. Main Application

The Ground Control Station is divided into focused operational views.

  -----------------------------------------------------------------------
  Page                                Purpose
  ----------------------------------- -----------------------------------
  Dashboard                           Mission summary, hazard counts,
                                      severity and risk

  Stream Control / Fly HUD            Video ingestion and inspection
                                      monitoring

  Detections & Alerts                 Searchable hazard inventory and
                                      alert review

  Risk Engine                         Hazard severity and operational
                                      priority

  Area Analytics                      Footprint and area statistics

  Depth Analysis                      Relative depth and geometric
                                      context

  GPS / Map                           Geographic hazard visualization
                                      when valid telemetry exists

  Civic Command                       Ward-level maintenance and
                                      work-order workflow
  -----------------------------------------------------------------------

The application is designed around:

**Observe → Detect → Confirm → Analyze → Locate → Prioritize → Act**

------------------------------------------------------------------------

# 5. High-Level Architecture

``` text
                   DRONE / INSPECTION VIDEO
                              |
                              v
                     +-------------------+
                     | Video Ingestion   |
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     | AI Perception     |
                     | Object Detection  |
                     | Temporal Analysis|
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     | Incident Layer    |
                     | Evidence / Risk   |
                     | Spatial Context   |
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     | FastAPI Backend   |
                     | REST + WebSocket  |
                     +---------+---------+
                               |
                               v
                     +-------------------+
                     | React Ground      |
                     | Control Station   |
                     +---------+---------+
                               |
             +-----------------+------------------+
             |                 |                  |
             v                 v                  v
           GIS             Analytics         Operations
             |                 |                  |
             +-----------------+------------------+
                               |
                               v
                       Supabase / PostgreSQL
```

The public repository documents the architecture and methodology without
exposing every internal inference, thresholding and decision rule used
during development.

------------------------------------------------------------------------

# 6. Computer Vision

## Why Object Detection?

Object detection was chosen because the system needs both
**classification** and **image localization**.

A classification model can answer:

> "What type of hazard is present?"

An object detector can additionally answer:

> "Where is the hazard in this frame?"

A detection can be represented as:

\[ D=(c,p,x_1,y_1,x_2,y_2) \]

where:

-   \(c\) = predicted class
-   \(p\) = confidence
-   (x_1,y_1,x_2,y_2) = bounding-box coordinates

The image-space dimensions are:

\[ w=x_2-x_1 \]

\[ h=y_2-y_1 \]

and the pixel footprint is:

\[ A\_{px}=w`\times `{=tex}h \]

This representation becomes the starting point for tracking, evidence
extraction and further spatial analysis.

------------------------------------------------------------------------

# 7. Dataset Development

The original Roboflow source contained:

**17,324 images**

The initial dataset contained six classes:

  Class                 Instances   Images
  ------------------- ----------- --------
  Cracks                    4,341    2,325
  Damaged Footpath          2,349      977
  Drainage Overflow           232      231
  Open Manhole              2,210    2,148
  Potholes                  9,101    2,987
  Waterlogging Area         5,812    3,337

During cleaning and auditing:

-   **5,810 empty-label images** were identified for review.
-   Approximately **2,016 suspicious filename matches** were reviewed.
-   Exact duplicate leakage between dataset splits was checked.
-   Annotation formats were inspected for consistency.
-   Polygon/OBB annotations were normalized to object-detection boxes.

The final IDEA taxonomy removed `cracks` and uses five classes
consistently across the model and application.

------------------------------------------------------------------------

# 8. Annotation Normalization

The source dataset contained standard bounding boxes as well as
polygon/OBB-style annotations.

For the final detector, polygon coordinates were converted into tight
axis-aligned boxes.

For polygon points ((x_i,y_i)):

\[ x\_{min}=`\min`{=tex}*i(x_i),`\qquad`{=tex}
x*{max}=`\max`{=tex}\_i(x_i) \]

\[ y\_{min}=`\min`{=tex}*i(y_i),`\qquad`{=tex}
y*{max}=`\max`{=tex}\_i(y_i) \]

The resulting box is:

\[ B=(x\_{min},y\_{min},x\_{max},y\_{max}) \]

Final normalized training representation:

-   **22,099 bounding-box annotations**
-   **0 polygon annotations**
-   **0 dropped annotations**
-   **5 final classes**

------------------------------------------------------------------------

# 9. Dataset Distribution

Final bounding-box counts:

  Class                  Instances
  ------------------- ------------
  Damaged Footpath             624
  Drainage Overflow            200
  Open Manhole                 432
  Potholes                  14,343
  Waterlogging Area          6,500
  **Total**             **22,099**

The dataset is strongly imbalanced.

For example:

\[ `\frac{14,343}{200}`{=tex}`\approx71.7`{=tex} \]

There are roughly **72 times more pothole annotations than
drainage-overflow annotations**.

This is one reason why the IDEA reports **per-class performance**
instead of relying only on one overall metric.

------------------------------------------------------------------------

# 10. Preventing Data Leakage

Duplicate images can make a model appear better than it really is.

If the same image occurs in both training and validation:

``` text
Training
   |
   +---- Image A

Validation
   |
   +---- Same Image A
```

the validation result is no longer a reliable measure of generalization.

Exact duplicate groups were therefore checked using SHA-256 image
hashes.

The intended condition is:

\[ Train`\cap `{=tex}Validation=`\varnothing`{=tex} \]

for exact duplicate content.

------------------------------------------------------------------------

# 11. Model Development

Two main detector stages were evaluated:

-   **YOLOv8s Base**
-   **YOLOv8m Mixed**

The YOLOv8m model was developed to provide a stronger representation for
visually diverse infrastructure scenes.

The model-development process also included target-domain adaptation for
unpaved-road imagery.

------------------------------------------------------------------------

# 12. YOLOv8s Baseline

The baseline model achieved:

  Metric        YOLOv8s Base
  ----------- --------------
  Precision        **0.648**
  Recall           **0.547**
  mAP50            **0.599**
  mAP50--95        **0.356**

An approximate F1 score from the reported precision and recall is:

\[ F1= 2`\frac{PR}{P+R}`{=tex} \]

\[ F1= 2`\frac{0.648(0.547)}`{=tex} {0.648+0.547} `\approx0.593`{=tex}
\]

So the baseline precision/recall operating point corresponds to
approximately:

**F1 = 0.593**

------------------------------------------------------------------------

# 13. YOLOv8m Mixed Model

The current YOLOv8m evaluation produced:

  Metric             YOLOv8m Mixed
  ---------------- ---------------
  Best Precision         **0.734**
  Best Recall            **0.640**
  Best mAP50             **0.646**
  Best mAP50--95         **0.360**
  Peak F1               **\~0.64**

The Precision-Recall evaluation reports:

\[ mAP@0.5`\approx0.645`{=tex} \]

which agrees with the rounded validation mAP50 of approximately
**0.646**.

The individual metric maxima can occur at different confidence
thresholds or epochs, so they should not be interpreted as one single
simultaneous operating point.

------------------------------------------------------------------------

# 14. Per-Class YOLOv8m Results

The current Precision-Recall evaluation gives:

  Class                     mAP50
  ------------------- -----------
  Damaged Footpath      **0.201**
  Drainage Overflow     **0.941**
  Open Manhole          **0.927**
  Potholes              **0.698**
  Waterlogging Area     **0.458**
  **All classes**       **0.645**

The results show that the detector is not equally strong across all
categories.

Strongest:

-   Drainage Overflow: **0.941**
-   Open Manhole: **0.927**

More difficult:

-   Damaged Footpath: **0.201**
-   Waterlogging Area: **0.458**

Potholes:

-   **0.698 mAP50**

This class-level view is important because aggregate performance can
hide weak classes.

------------------------------------------------------------------------

# 15. Evaluation Metrics

## Precision

Precision measures how many predicted hazards were actually correct.

\[ Precision=`\frac{TP}{TP+FP}`{=tex} \]

where:

-   (TP) = true positives
-   (FP) = false positives

High precision means fewer false alarms.

------------------------------------------------------------------------

## Recall

Recall measures how many real hazards were detected.

\[ Recall=`\frac{TP}{TP+FN}`{=tex} \]

where:

-   (FN) = false negatives

High recall means fewer missed hazards.

------------------------------------------------------------------------

## F1

F1 balances precision and recall:

\[ F1= 2`\frac{Precision\times Recall}`{=tex} {Precision+Recall} \]

The harmonic mean is useful because a very high precision with very low
recall should not be treated as an excellent detector.

------------------------------------------------------------------------

## IoU

Intersection over Union measures overlap between predicted and
ground-truth boxes:

\[ IoU= `\frac{Area(B_{pred}\cap B_{true})}`{=tex}
{Area(B\_{pred}`\cup `{=tex}B\_{true})} \]

------------------------------------------------------------------------

## mAP

Average Precision summarizes the precision-recall relationship for one
class.

For (N) classes:

\[ mAP=`\frac{1}{N}`{=tex}`\sum`{=tex}\_{i=1}\^{N}AP_i \]

`mAP50` uses an IoU threshold of 0.50.

`mAP50-95` averages AP over IoU thresholds:

\[ 0.50,0.55,0.60,`\ldots`{=tex},0.95 \]

Therefore mAP50-95 is a stricter localization measure.

------------------------------------------------------------------------

# 16. Confidence Threshold Selection

A detector can produce predictions across a confidence range from 0 to
1.

Changing the threshold changes the precision-recall balance.

``` text
Lower threshold
      |
      +-- more detections
      +-- potentially higher recall
      +-- potentially more false positives

Higher threshold
      |
      +-- fewer detections
      +-- potentially higher precision
      +-- potentially more missed hazards
```

The YOLOv8m F1-confidence curve shows approximately:

\[ F1`\approx0.64`{=tex} \]

at:

\[ Confidence`\approx0.373`{=tex} \]

This gives an evidence-based operating point rather than choosing a
threshold arbitrarily.

------------------------------------------------------------------------

# 17. Confusion Matrix

The confusion matrix provides class-level error information that
aggregate mAP cannot show.

The normalized evaluation indicates approximately:

  Class                 Correct classification
  ------------------- ------------------------
  Damaged Footpath                        0.23
  Drainage Overflow                       0.94
  Open Manhole                            0.92
  Potholes                                0.70
  Waterlogging Area                       0.45

Waterlogging and potholes have meaningful visual overlap because wet
road surfaces and depressions can share similar appearance.

The confusion matrix is therefore useful for deciding where future data
collection should focus.

------------------------------------------------------------------------

# 18. Domain Adaptation

A drone model trained on one visual environment may behave differently
on another.

Examples include:

-   paved versus unpaved roads
-   wet versus dry surfaces
-   different cameras
-   different flight heights
-   lighting changes
-   different road materials

A dedicated unpaved-road adaptation experiment was performed.

An important failure was observed:

> Fine-tuning only on the new domain caused severe degradation of
> previously learned classes.

This is a classic example of catastrophic forgetting.

The resulting approach was to retain the original domain while adding
new-domain information rather than replacing the original training
distribution.

------------------------------------------------------------------------

# 19. Target-Domain Validation

The mixed model was evaluated on organizer-style footage that was not
used for training.

Two useful behavioural changes were observed.

### Pothole confidence

Approximate peak confidence:

\[ 0.27`\rightarrow0.54`{=tex} \]

### Dry-earth waterlogging false positives

Observed confidence:

\[ 0.76-0.81 \]

was reduced to:

\[ \<0.11 \]

on the tested dry-earth examples.

These results are important because they demonstrate improvement against
a real domain-shift failure mode, rather than only reporting performance
on the original validation dataset.

------------------------------------------------------------------------

# 20. Video and Temporal Reasoning

Object detection is frame-based, but an inspection system operates on
video.

The same physical pothole may appear in many consecutive frames:

``` text
Frame 101  ─┐
Frame 102   |
Frame 103   | → Same physical hazard
Frame 104   |
Frame 105  ─┘
```

Counting every frame as a separate incident would produce inflated
hazard counts.

The system therefore separates:

``` text
Detection
    ↓
Track
    ↓
Temporal confirmation
    ↓
Incident
```

This allows repeated observations of the same physical hazard to be
consolidated into an operational record.

------------------------------------------------------------------------

# 21. Tracks vs Incidents

During one full pipeline evaluation:

-   **120 raw tracks**
-   **29 confirmed hazards**

The ratio is:

\[ `\frac{29}{120}`{=tex}`\times100`{=tex} `\approx24.2`{=tex}% \]

This **24.2% is not model precision**.

It is simply the proportion of raw tracked observations that became
confirmed incidents under the system's temporal consolidation rules for
that run.

Keeping these concepts separate is important when interpreting system
metrics.

------------------------------------------------------------------------

# 22. Incident Record

A structured incident can contain:

``` text
Incident ID
Hazard Class
Confidence
Severity
Risk Score
Timestamp
Track ID
Bounding Box
Evidence
Location, when available
Maintenance Status
Recommended Action
```

This allows one record to be:

-   displayed in the dashboard
-   searched and filtered
-   shown on a map
-   assigned a priority
-   synchronized to storage
-   converted into a maintenance workflow

------------------------------------------------------------------------

# 23. Evidence

An automated detection is more useful when a human can inspect the
evidence behind it.

The evidence flow is:

``` text
Confirmed Incident
       |
       v
Relevant Frame
       |
       v
Annotated Evidence
       |
       v
Operator Review
```

This is particularly important for municipal deployment, where an
automated result should support a decision rather than become an
unexplained decision by itself.

------------------------------------------------------------------------

# 24. Confidence vs Severity

The system deliberately separates:

\[ Confidence`\neqSeverity`{=tex} \]

Confidence answers:

> How strongly does the detector believe this visual region belongs to a
> particular class?

Severity answers:

> How serious is this issue from a civic or operational perspective?

For example:

``` text
Small pothole
Confidence = 0.95
Severity = Moderate

Open manhole
Confidence = 0.80
Severity = potentially High/Critical
```

The second issue can deserve a higher response priority even with lower
model confidence.

------------------------------------------------------------------------

# 25. Risk / Severity Model

A normalized severity formulation used during development is:

\[ S= 0.45C+ 0.25E+ 0.15P+ 0.15Q \]

where:

-   \(C\) = class-risk component
-   \(E\) = extent component
-   \(P\) = persistence component
-   \(Q\) = peak confidence component

Each component is normalized to:

\[ 0`\leq `{=tex}C,E,P,Q`\leq1`{=tex} \]

The weights sum to:

\[ 0.45+0.25+0.15+0.15=1 \]

The resulting score is:

\[ RiskScore=100S \]

The exact thresholds for Low/Moderate/High/Critical can be configured
for the intended operational policy.

------------------------------------------------------------------------

# 26. Example Risk Calculation

Suppose:

\[ C=0.90,`\quad `{=tex}E=0.80,`\quad `{=tex}P=0.85,`\quad `{=tex}Q=0.90
\]

Then:

\[ S= 0.45(0.90)+ 0.25(0.80)+ 0.15(0.85)+ 0.15(0.90) \]

\[ S=0.8675 \]

Therefore:

\[ RiskScore=86.75 \]

The example demonstrates why risk is not simply copied from model
confidence.

------------------------------------------------------------------------

# 27. Area Analysis

A detector initially provides pixel-space area:

\[ A\_{px}=w\_{px}h\_{px} \]

Pixels alone do not provide a physical area in square metres.

A simplified ground-sampling approximation is:

\[ W_g=
2H`\tan`{=tex}`\left`{=tex}(`\frac{HFOV}{2}`{=tex}`\right`{=tex}) \]

where:

-   \(H\) = camera height above ground
-   (HFOV) = horizontal field of view
-   (W_g) = ground width represented by the image

For image width (W\_{px}):

\[ GSD=`\frac{W_g}{W_{px}}`{=tex} \]

Then:

\[ A\_{m^2}`\approx `{=tex}A\_{px}GSD^2 \]

This is valid only under appropriate camera and ground-plane
assumptions.

Accurate metric area requires calibration and reliable flight
information.

------------------------------------------------------------------------

# 28. Depth Analysis

The IDEA integrates **Depth Anything V2** to obtain monocular depth
information from RGB imagery.

The purpose is to add geometric context to the visual detection:

``` text
RGB Image
    +
Detection
    ↓
Relative Depth
    ↓
Geometric Context
```

This is useful for hazards such as potholes and surface depressions.

------------------------------------------------------------------------

# 29. Why Depth Anything V2?

The prototype uses monocular depth because it can derive dense depth
cues from ordinary RGB imagery without requiring a dedicated depth
sensor.

Advantages:

-   works with existing RGB drone footage
-   provides scene-level depth information
-   avoids additional prototype hardware
-   can be applied selectively to relevant detections

The important limitation is:

> **Monocular depth is not automatically metric depth.**

Without calibration or another metric reference, its output should be
interpreted as relative geometry.

------------------------------------------------------------------------

# 30. Relative Depth

Let the depth map be:

\[ D(x,y) \]

A normalized relative-depth contrast can be expressed as:

\[ D\_{index}= clip`\left`{=tex}(
`\frac{|\tilde D_{inside}-\tilde D_{context}|}`{=tex}
{P\_{95}(D)-P_5(D)}, 0,1 `\right`{=tex}) \]

where:

-   (`\tilde `{=tex}D\_{inside}) = representative depth inside the
    detected region
-   (`\tilde `{=tex}D\_{context}) = representative surrounding depth
-   (P\_{95}), (P_5) = robust scene-level depth percentiles

This produces a relative geometric indicator.

It should not be presented as an exact measurement such as:

> "The pothole is 8 cm deep"

unless a calibrated metric depth source is available.

------------------------------------------------------------------------

# 31. Volume Concept

If a physical footprint and metric depth are available, a simple volume
approximation is:

\[ V`\approx `{=tex}A`\times `{=tex}d \]

For non-uniform depth:

\[ V`\approx`{=tex}`\sum`{=tex}\_i A_i d_i \]

or:

\[ V=`\iint`{=tex}\_A d(x,y),dA \]

The accuracy of this estimate depends on the accuracy of both the
footprint and depth measurements.

------------------------------------------------------------------------

# 32. GPS and Geographic Localization

YOLO produces image coordinates, not latitude and longitude.

A geographic position requires additional information:

``` text
Image Pixel
     +
Camera Intrinsics
     +
Drone Position
     +
Altitude
     +
Camera / Drone Orientation
     +
Ground Geometry
     |
     v
World Position
     |
     v
WGS-84 Coordinate
```

This is why geographic localization is treated separately from visual
detection.

------------------------------------------------------------------------

# 33. WGS-84 / GeoJSON

When valid telemetry and projection information are available, hazards
can be represented as geographic features.

A typical feature contains:

``` text
geometry:
    Point / Polygon

properties:
    hazard class
    severity
    confidence
    timestamp
    incident ID
```

WGS-84 provides the latitude/longitude reference system, while GeoJSON
provides a standard representation for exchanging geographic features
with GIS applications.

------------------------------------------------------------------------

# 34. Important Spatial Limitation

The system should not claim geographic accuracy when telemetry is
unavailable.

The rule is:

> **No valid telemetry means no valid geographic claim.**

Without GPS and camera-pose information, the inspection can still
retain:

-   frame number
-   timestamp
-   visual evidence
-   image-space location
-   relative spatial information

Metric geographic positioning requires the necessary telemetry and
calibration.

------------------------------------------------------------------------

# 35. Ground Control Station

The Ground Control Station brings the different parts of the system into
one interface.

``` text
Video
  +
Hazards
  +
Evidence
  +
Risk
  +
Spatial Data
  +
Analytics
  +
Municipal Workflow
```

The operator can move from a high-level mission overview to a specific
incident without leaving the application.

------------------------------------------------------------------------

# 36. Dashboard

The Dashboard is the mission-level view.

It can summarize:

-   recorded hazards
-   severity distribution
-   risk score
-   hazard classification
-   detection timeline
-   active alerts
-   affected footprint when available

The purpose is to answer:

> **"What did this inspection find?"**

------------------------------------------------------------------------

# 37. Stream Control / Fly HUD

The Stream Control and Fly-oriented interface handles the inspection
feed and operational state.

It provides information such as:

-   active feed mode
-   ingestion state
-   current frame
-   pipeline state
-   WebSocket connection
-   hazard overlays
-   mission video controls

The architecture allows recorded inspection footage to be used during
the prototype while keeping a path open for a live drone source.

------------------------------------------------------------------------

# 38. Detections & Alerts

The Detections page provides the structured hazard inventory.

It can expose:

-   Hazard ID
-   Classification
-   Confidence
-   Footprint
-   Coordinates when available
-   Threat severity
-   Risk priority
-   Municipal zone
-   Lifecycle status
-   Action

The operator can search and filter the incident list instead of manually
reviewing the entire video.

------------------------------------------------------------------------

# 39. Risk Engine

The Risk Engine separates model output from operational priority.

The conceptual relationship is:

\[ Detection `\rightarrow`{=tex} Context `\rightarrow`{=tex} Risk
`\rightarrow`{=tex} Priority \]

This allows the application to consider more than detector confidence
when deciding which issue should receive attention first.

------------------------------------------------------------------------

# 40. Area Analytics

Area Analytics provides spatial summaries.

For (n) hazards:

### Total affected area

\[ A\_{total}=`\sum`{=tex}\_{i=1}\^{n}A_i \]

### Average area

\[ A\_{avg}=`\frac{1}{n}`{=tex}`\sum`{=tex}\_{i=1}\^{n}A_i \]

### Largest defect

\[ A\_{max}=`\max`{=tex}(A_1,A_2,`\ldots`{=tex},A_n) \]

These values are meaningful as physical measurements only when the
required spatial calibration is available.

------------------------------------------------------------------------

# 41. Depth Analysis Page

The Depth Analysis page presents:

-   relative depth information
-   depth-derived indicators
-   surface-area context
-   volume-related values when supported
-   hazard-level geometric information

The goal is to move beyond a purely 2D view while being explicit about
the limits of monocular depth.

------------------------------------------------------------------------

# 42. GPS / Map Page

The Map view provides geographic context when valid coordinates are
available.

Possible map information includes:

-   hazard markers
-   classification
-   severity
-   zone
-   flight context
-   geographic boundaries

This is the layer that makes the inspection result useful to a
location-based municipal workflow.

------------------------------------------------------------------------

# 43. Civic Command

Civic Command connects inspection results to maintenance operations.

The intended lifecycle is:

``` text
DETECTED
   ↓
VERIFIED
   ↓
ASSIGNED
   ↓
IN PROGRESS
   ↓
RESOLVED
```

The page is designed around:

-   municipal wards
-   defect classifications
-   active tickets
-   repair budgets
-   SLA monitoring
-   contractor assignment
-   proof-of-work verification
-   work-order export

This creates the bridge from AI perception to actual civic action.

------------------------------------------------------------------------

# 44. Backend Architecture

The backend uses Python with FastAPI for application services.

The communication model is:

``` text
AI / Processing State
        |
        v
     FastAPI
      /   \
     /     \
  REST    WebSocket
    |         |
    v         v
 Control    Live State
    \         /
     \       /
       React GCS
```

### REST

Used for operations such as:

-   retrieving structured hazards
-   health/status information
-   configuration
-   control operations
-   geographic data
-   persistent records

### WebSocket

Used for rapidly changing state such as:

-   live hazard updates
-   stream state
-   telemetry
-   processing status

------------------------------------------------------------------------

# 45. Persistence

The system integrates Supabase/PostgreSQL-compatible storage for
structured records.

Persistent information can include:

-   incidents
-   hazard metadata
-   timestamps
-   evidence references
-   spatial information
-   risk information
-   maintenance status
-   historical mission information

The design separates immediate processing from long-term storage.

------------------------------------------------------------------------

# 46. Why Separate Processing and Storage?

A field inspection system should not depend completely on continuous
network availability.

A cloud-only design creates:

``` text
Camera
  ↓
Network
  ↓
Cloud Processing
  ↓
Network
  ↓
Result
```

A more resilient direction is:

``` text
Camera
  ↓
Edge Processing
  ↓
Local Incident
  ↓
GCS / Network
  ↓
Cloud Storage
```

This allows the system to continue generating useful local intelligence
even when connectivity becomes unreliable.

------------------------------------------------------------------------

# 47. Live Drone Deployment

The current implementation uses inspection video while keeping the processing
interfaces compatible with a future live source.

A production deployment could look like:

``` text
Drone Camera
      ↓
Onboard Edge Computer
      ↓
Optimized AI Inference
      ↓
Incident Event
      ↓
Telemetry Link
      ↓
Ground Control Station
      ↓
Municipal Backend
```

The drone would not necessarily need to continuously transmit the full
high-resolution video.

A compact event could contain:

``` text
Incident ID
Class
Confidence
Severity
Timestamp
Latitude
Longitude
Altitude
Evidence Reference
```

Full-resolution footage could remain locally recorded and synchronize
separately.

------------------------------------------------------------------------

# 48. Real-Time Performance

End-to-end latency depends on the complete pipeline:

\[ T\_{total}= T\_{capture}+ T\_{detect}+ T\_{track}+ T\_{depth}+
T\_{render}+ T\_{I/O} \]

Therefore:

\[ FPS\_{pipeline}`\approx`{=tex}`\frac{1}{T_{total}}`{=tex} \]

This is more useful than reporting detector-only FPS.

For example, a detector can be fast while the application still feels
slow because of video decoding, depth inference, rendering, storage or
network operations.

------------------------------------------------------------------------

# 49. Selective Computation

Expensive operations do not necessarily need to run on every frame.

A practical deployment strategy is:

``` text
Video Frame
    ↓
Perception / Tracking
    ↓
Relevant Observation
    ↓
Depth / Spatial Analysis
```

This can reduce computational load while preserving useful information.

The objective is not simply:

> maximum detector FPS

but:

> **stable end-to-end inspection throughput with useful information.**

------------------------------------------------------------------------

# 50. Reliability

The backend is designed around graceful failure.

  Situation                  Expected behaviour
  -------------------------- -----------------------------------
  Low-confidence detection   Filter or defer
  Temporary track loss       Continue / reinitialize
  Depth failure              Preserve detection result
  Missing GPS                Continue without geographic claim
  Corrupt frame              Skip frame
  Network interruption       Continue locally where possible
  No hazards                 Return a valid zero-hazard state

This is important because field systems must handle imperfect inputs
rather than assuming every frame and sensor is available.

------------------------------------------------------------------------

# 51. Testing Strategy

The IDEA uses three levels of validation.

### Model level

-   Precision
-   Recall
-   F1
-   mAP50
-   mAP50-95
-   Precision-Recall curve
-   Confidence curves
-   Confusion matrix

### Video level

-   Detection stability
-   Track continuity
-   Duplicate consolidation
-   Evidence generation
-   Timestamp consistency
-   Processing behaviour

### System level

-   API health
-   WebSocket behaviour
-   Frontend synchronization
-   GIS rendering
-   Persistence
-   Failure handling

A good model is not enough if the complete application cannot reliably
turn its outputs into usable incidents.

------------------------------------------------------------------------

# 52. Model Results at a Glance

### Dataset

  Metric                                  Value
  -------------------------------- ------------
  Original images                    **17,324**
  Final classes                           **5**
  Final bounding-box annotations     **22,099**

### YOLOv8s Base

  Metric                Value
  ------------- -------------
  Precision         **0.648**
  Recall            **0.547**
  F1 from P/R     **\~0.593**
  mAP50             **0.599**
  mAP50-95          **0.356**

### YOLOv8m Mixed

  Metric                            Value
  ------------------------- -------------
  Best Precision                **0.734**
  Best Recall                   **0.640**
  Best mAP50                    **0.646**
  Best mAP50-95                 **0.360**
  Peak F1                      **\~0.64**
  F1 operating confidence     **\~0.373**

------------------------------------------------------------------------

# 53. Target-Domain Results at a Glance

  -----------------------------------------------------------------------
  Test                                   Before                     After
  ------------------- ------------------------- -------------------------
  Pothole confidence                     \~0.27                **\~0.54**
  peak                                          

  Dry-earth                        \~0.76--0.81                **\<0.11**
  waterlogging                                  
  false-positive                                
  confidence                                    
  -----------------------------------------------------------------------

These values come from held-out organizer-style footage and are intended
as behavioural validation rather than a replacement for the formal
validation-set metrics.

------------------------------------------------------------------------

# 54. What Makes the IDEA Different

The differentiator is not simply using YOLO with a drone.

The IDEA connects:

``` text
Computer Vision
      +
Temporal Context
      +
Evidence
      +
Risk
      +
Spatial / Depth Context
      +
GIS
      +
Municipal Workflow
```

The intended output is therefore not just:

> "Object detected."

It is:

> **"A potential civic issue was observed, consolidated into an
> incident, supported by visual evidence, given operational context and
> made available for maintenance action."**

The public repository intentionally documents this concept without
publishing every internal implementation detail that forms the IDEA's
competitive advantage.

------------------------------------------------------------------------

# 55. Known Limitations

### Model generalization

Performance can change with city, camera, altitude, lighting, road
material and weather.

### Class imbalance

The final dataset is heavily dominated by potholes and waterlogging
compared with some minority classes.

### Difficult classes

Damaged Footpath and Waterlogging Area currently have substantially
lower mAP50 than Drainage Overflow and Open Manhole.

### Monocular depth

Depth Anything V2 provides relative depth cues but does not
automatically provide metric depth.

### Area measurement

Physical area requires camera and flight calibration.

### Geographic accuracy

Reliable geographic projection requires valid telemetry and camera-pose
information.

### Live edge deployment

Real-time onboard performance requires hardware-specific profiling and
optimization.

### Human verification

Safety-critical maintenance actions should retain a human verification
step.

------------------------------------------------------------------------

# 56. Future Roadmap

## Perception

-   Expand difficult-class data
-   Collect more city-specific footage
-   Improve small-object detection
-   Evaluate additional camera heights and viewpoints
-   Continue cross-domain validation

## Spatial Intelligence

-   Calibrated camera model
-   Reliable drone telemetry
-   Metric GSD
-   Improved ground-plane estimation
-   Stereo/LiDAR evaluation

## Edge Deployment

-   Jetson-class hardware evaluation
-   FP16 / optimized inference
-   TensorRT deployment
-   Local buffering
-   Low-bandwidth event transmission

## Autonomous Inspection

-   Risk-driven revisit planning
-   Waypoint generation
-   Multi-angle evidence capture
-   Human-supervised autonomous missions

## Municipal Integration

-   Existing civic ticketing systems
-   Ward databases
-   SLA engines
-   Contractor systems
-   Field-worker applications
-   Repair verification

------------------------------------------------------------------------

# 57. Repository Structure

``` text
hydro-vision-3D/
│
├── assets/
├── config/
├── data/
├── docs/
├── frontend/
├── models/
├── scripts/
├── src/
├── tests/
├── tools/
│
├── main.py
├── train.py
├── requirements.txt
├── TRAINING.md
├── README.md
└── .gitignore
```

Large generated videos, experiment outputs, temporary files and private
training artifacts are intentionally excluded from the public source
repository.

------------------------------------------------------------------------

# 58. Technology Stack

  Layer              Technology
  ------------------ -------------------------
  Language           Python
  Backend            FastAPI
  Computer Vision    OpenCV
  Object Detection   YOLOv8
  Depth              Depth Anything V2
  AI Runtime         PyTorch
  Frontend           React
  Build              Vite
  State              Zustand
  Mapping            Leaflet / React-Leaflet
  Spatial Data       WGS-84 / GeoJSON
  Realtime           WebSocket
  Database           PostgreSQL / Supabase
  Version Control    Git / GitHub

------------------------------------------------------------------------

# 59. Installation

## Requirements

Recommended development environment:

-   Python 3.10+
-   Node.js 18+
-   Git
-   NVIDIA GPU with CUDA for accelerated NVIDIA inference

Performance varies by hardware and configuration.

## Backend

``` bash
python -m venv .venv
```

Windows:

``` bash
.venv\Scripts\activate
```

Linux/macOS:

``` bash
source .venv/bin/activate
```

Install dependencies:

``` bash
pip install -r requirements.txt
```

Run the backend:

``` bash
python main.py
```

## Frontend

``` bash
cd frontend
npm install
npm run dev
```

------------------------------------------------------------------------

# 60. Reproducibility

For meaningful model comparisons, record:

``` text
Model version
Dataset version
Image size
Confidence threshold
IoU threshold
Validation split
Per-class metrics
Overall metrics
Hardware
Runtime
```

This prevents different experiments from being compared as though they
were performed under identical conditions.

The repository contains the software structure and development tooling
required to understand the IDEA. Private datasets, model checkpoints
and large generated mission artifacts are intentionally kept outside
normal source control.

------------------------------------------------------------------------

# 61. Repository and Security Hygiene

The public repository should not contain:

-   API keys
-   database passwords
-   service-role credentials
-   private tokens
-   large private datasets
-   private model checkpoints
-   generated mission dumps
-   temporary experiment artifacts

Deployment secrets should be supplied through environment variables or a
secret-management system.

------------------------------------------------------------------------

# 62. Engineering Principles

The IDEA follows several practical rules:

### 1. Measure before claiming

Model metrics should come from defined evaluation runs.

### 2. Separate confidence from risk

A detector confidence is not a civic severity score.

### 3. Separate pixels from metres

Physical measurements require spatial calibration.

### 4. Separate relative depth from metric depth

Monocular depth is useful for geometry, but absolute depth needs a scale
reference.

### 5. Do not fabricate location

Geographic coordinates should come from valid telemetry and projection.

### 6. Test across domains

Improving one visual domain should not silently break another.

### 7. Evaluate the whole system

Detector accuracy alone does not guarantee a reliable inspection
application.

------------------------------------------------------------------------

# 63. IDEA Summary

HYDRO-VISION-3D takes the following path:

\[ Video `\rightarrow`{=tex} Detection `\rightarrow`{=tex} Tracking
`\rightarrow`{=tex} Incident `\rightarrow`{=tex} Evidence
`\rightarrow`{=tex} Risk `\rightarrow`{=tex} Spatial Context
`\rightarrow`{=tex} Municipal Action \]

The IDEA is intended to provide a practical bridge between aerial
computer vision and civic infrastructure operations.

The long-term objective is not to replace municipal decision-makers.

It is to give them:

-   faster inspection
-   consistent hazard records
-   visual evidence
-   measurable context
-   clearer prioritization
-   a structured path from detection to maintenance

------------------------------------------------------------------------

# 64. Team

## Drone404

**HYDRO-VISION-3D**\
AI-Powered Ground Control Station for Monsoon, Roads & Civic
Infrastructure Intelligence

**GSFC University \| **

------------------------------------------------------------------------

## Attribution

This IDEA uses open-source software, models and datasets subject to
their respective licenses.

Third-party dataset licensing and attribution requirements should be
reviewed before redistribution.
