# HYDRO-VISION-3D

### AI-Powered 3D Ground Control Station for Monsoon, Road and Civic Infrastructure Intelligence

**Team Drone404 | ELCIA Tech Summit 2026 Hackathon | GSFC University**

---

## 1. Problem Statement

### Monsoon, Roads & Civic Infrastructure Intelligence

Use road, drain and rainfall-condition videos to identify:

- Waterlogging
- Potholes
- Drainage overflow
- Damaged footpaths
- Road-surface and civic infrastructure risks

Each detected issue should be associated with:

- Zone
- Severity
- Time
- Visual evidence

and should support a:

**Maintenance-priority and closure-tracking dashboard.**

---

## 2. Project Overview

HYDRO-VISION-3D is an AI-powered Ground Control Station (GCS) designed to transform drone and inspection video into structured infrastructure intelligence.

The platform combines:

- AI-based hazard detection and tracking
- Monocular depth estimation
- 3D spatial and volumetric analysis
- Geospatial projection
- Real-time telemetry
- Risk and severity analysis
- GIS visualization
- Maintenance workflow management
- Cloud persistence

The system is designed to determine:

- What the hazard is
- Where it is located
- When it was detected
- How large it is
- Its estimated depth and volume
- How severe it is
- Its maintenance priority
- Supporting visual evidence
- Its maintenance status

The resulting information is presented through a real-time Ground Control Station and synchronized with persistent cloud storage.

---

## 3. System Pipeline

```text
Drone / Inspection Video
          |
          v
    Video Ingestion
          |
          v
 YOLO Detection & Tracking
          |
          +----------------------+
          |                      |
          v                      v
 Hazard Classification     Depth Anything V2
          |                      |
          +----------+-----------+
                     |
                     v
           Spatial Intelligence
                     |
          +----------+-----------+
          |                      |
          v                      v
     Area Estimation       Depth / Volume
          |                      |
          +----------+-----------+
                     |
                     v
          GPS / WGS84 Projection
                     |
                     v
          Severity + Risk Engine
                     |
                     v
            FastAPI Backend
                     |
              WebSocket / REST
                     |
                     v
             React GCS
                     |
       +-------------+-------------+
       |             |             |
       v             v             v
      GIS         Analytics       OSD
       |             |             |
       +-------------+-------------+
                     |
                     v
             Maintenance Workflow
                     |
                     v
             Supabase / PostgreSQL
```

---

## 4. How HYDRO-VISION-3D Solves the Problem

| Problem Statement Requirement | HYDRO-VISION-3D Implementation |
|---|---|
| Waterlogging | AI detection + spatial/depth analysis |
| Potholes | YOLO detection + persistent tracking |
| Drainage overflow | Hazard classification and monitoring |
| Damaged footpaths | AI-based infrastructure hazard detection |
| Surface risks | Detection + severity/risk engine |
| Zone | GPS/WGS84 + municipal zone mapping |
| Severity | LOW / MODERATE / HIGH / CRITICAL |
| Time | Frame timestamps + session timeline |
| Visual evidence | Automatic hazard snapshots |
| Maintenance priority | 1–100 risk/priority score |
| Closure tracking | OPEN → IN_PROGRESS → RESOLVED |
| Real-time monitoring | FastAPI + WebSocket |
| Spatial intelligence | GIS + GeoJSON |
| 3D intelligence | Depth Anything V2 + volumetric estimation |
| Persistent records | Supabase + PostgreSQL |

---

## 5. AI and Computer Vision

### 5.1 YOLO Detection

The perception pipeline uses trained YOLO models to detect and classify road and civic infrastructure hazards.

For each detection, the system can obtain:

- Hazard Class
- Confidence
- Bounding Box
- Track ID
- Frame ID
- Timestamp

Confidence filtering is applied to reduce low-confidence detections.

### 5.2 Object Tracking

Detection is combined with persistent object tracking so that the same physical hazard can be followed across consecutive frames.

Without tracking:

```
Frame 100 -> Pothole -> Detection 1
Frame 101 -> Pothole -> Detection 2
Frame 102 -> Pothole -> Detection 3
```

With tracking:

```
Frame 100 ─┐
Frame 101 ─┤
Frame 102 ─┼──> Track ID 27
Frame 103 ─┤
Frame 104 ─┘
```

This reduces duplicate counting and provides temporal continuity for individual hazards.

### 5.3 Depth Anything V2

HYDRO-VISION-3D integrates Depth Anything V2 for monocular depth estimation from RGB imagery.

The depth pipeline extends the system beyond 2D object detection toward spatial and volumetric analysis.

```
RGB Frame
    |
    v
Depth Anything V2
    |
    v
Dense Depth Map
    |
    v
Hazard Region
    |
    v
Depth-Aware Geometry
    |
    v
Estimated Spatial Volume
```

This is particularly relevant to:

- Waterlogging
- Road depressions
- Potholes
- Surface-level infrastructure damage

where depth and volume provide additional information beyond surface area.

---

## 6. Spatial and 3D Intelligence

### 6.1 Real-World Area Estimation

Image-space measurements are converted into estimated physical dimensions using camera geometry and Ground Sample Distance (GSD).

```
Pixel Measurement
       |
       v
Camera Geometry
       |
       v
Ground Sample Distance
       |
       v
Estimated Physical Area
       |
       v
m²
```

These measurements are engineering estimates and can be further calibrated for deployment-specific accuracy.

### 6.2 Volumetric Estimation

Depth information can be combined with the estimated spatial footprint of a hazard to calculate approximate volume.

```
Estimated Area
      +
Estimated Depth
      |
      v
Depth-Aware Spatial Model
      |
      v
Estimated Volume
      |
      v
m³
```

For waterlogging and road depressions, this provides a more informative measurement than area alone.

---

## 7. Geospatial Intelligence

HYDRO-VISION-3D uses drone telemetry and camera parameters to associate image detections with geographic coordinates.

The projection layer can use:

- Latitude
- Longitude
- Altitude
- Heading
- Camera orientation
- Camera intrinsics
- Pixel coordinates

```
Image Coordinates
        +
Drone Telemetry
        +
Camera Parameters
        |
        v
Geospatial Projection
        |
        v
WGS84 Coordinates
        |
        v
Municipal Zone
```

Hazards can subsequently be represented as GeoJSON features for use in GIS systems.

---

## 8. Risk and Severity Engine

The system assigns each detected hazard a severity level based primarily on its estimated affected area and risk characteristics.

| Severity | Affected Area | Recommended Response |
|---|---|---|
| LOW | < 5 m² | Monitor |
| MODERATE | 5–25 m² | Schedule maintenance |
| HIGH | 25–75 m² | Dispatch maintenance crew |
| CRITICAL | ≥ 75 m² | Emergency response / traffic reroute |

A separate normalized priority/risk score is represented on a 1–100 scale.

The priority calculation can incorporate:

- Hazard type
- Affected area
- Severity
- Safety implications

This separates the physical severity of a hazard from its operational maintenance priority.

---

## 9. EMA Metric Stabilization

Video-based measurements can fluctuate between consecutive frames because of camera movement, detection variation and changing image conditions.

HYDRO-VISION-3D uses Exponential Moving Average (EMA) smoothing to stabilize continuously changing measurements.

```
Smoothed Value =
0.7 × Previous Value +
0.3 × Current Value
```

EMA smoothing helps reduce:

- Measurement jitter
- Risk-score fluctuations
- Severity flickering
- Unstable analytical graphs

---

## 10. Ground Control Station

The React-based Ground Control Station provides a unified interface for operating and monitoring inspection missions.

### 10.1 Live Drone Feed

The live interface provides:

- Video feed
- Latitude
- Longitude
- Altitude
- Heading
- Battery
- RSSI
- Satellite count
- Speed
- Vertical speed
- Flight time
- Active hazards
- Affected area
- Risk level
- Risk score
- Frame information

### 10.2 Recorded Video Analysis

Recorded inspection footage can be processed for:

- Post-monsoon assessment
- Offline analysis
- Demonstration
- Testing
- Mission review
- Repeatable evaluation

### 10.3 On-Screen Display

The OSD overlays operational information directly on the video feed.

Typical information includes:

- LAT / LON
- ALT / HDG
- BATT / RSSI / SAT
- SPD / V.SPD
- TIME
- HAZARDS
- AREA
- RISK
- SCORE
- FRAME

The GCS supports both recorded-video analysis and live drone-feed operation.

---

## 11. Analytics Dashboard

The dashboard provides a real-time summary of the current inspection session.

**Overview**

Displays:

- Total hazards detected
- Cumulative affected area
- Cumulative estimated volume
- Session risk level
- Active alerts
- Detection timeline
- Severity distribution
- Hazard classification
- Risk score gauge

**Hazard Feed**

Provides continuously updated information about detected hazards, including:

- Classification
- Track ID
- Confidence
- Severity
- Area
- Status
- Relevant spatial information

**Mission Status**

Provides an operational summary of:

- Mode
- Total Hazards Found
- Affected Area
- Current Risk
- Recommended Action

---

## 12. GIS Interface

The GCS contains an interactive Leaflet-based GIS interface.

It provides visualization of:

- Hazard locations
- Severity
- Municipal zones
- Drone position
- Flight information
- Geographic context

The backend provides GeoJSON output through:

```
GET /api/hazards/geojson
```

This allows hazard information to be consumed by external GIS applications.

---

## 13. Real-Time Communication

The system uses FastAPI WebSockets to provide real-time communication between the backend processing pipeline and the GCS.

```
AI Pipeline
     |
     v
FastAPI Backend
     |
     | WebSocket
     v
Zustand State
     |
     +----> Hazard Feed
     +----> OSD
     +----> Analytics
     +----> Alerts
     +----> GIS
     +----> Mission Status
```

This allows the frontend to receive updates as processing occurs without relying on page refreshes or conventional polling.

REST APIs are used for control, retrieval and maintenance operations.

---

## 14. Visual Evidence

When a new hazard is identified, the system can capture a visual snapshot of the relevant detection region.

```
New Hazard
    |
    v
Track ID
    |
    v
Detection Region
    |
    v
Evidence Snapshot
    |
    v
Hazard Record
```

This provides visual evidence that can be used for verification and maintenance decisions.

---

## 15. Maintenance Workflow

HYDRO-VISION-3D connects AI detection with an operational maintenance lifecycle.

```
DETECTED
    |
    v
OPEN
    |
    v
IN_PROGRESS
    |
    v
RESOLVED
```

A hazard record can contain:

- Hazard Type
- Track ID
- Confidence
- Area
- Estimated Volume
- Severity
- Priority Score
- GPS Location
- Municipal Zone
- Timestamp
- Visual Evidence
- Maintenance Status

This creates a complete workflow:

**Detection → Assessment → Prioritization → Dispatch → Resolution**

---

## 16. Supabase and PostgreSQL

The system integrates Supabase with PostgreSQL for persistent cloud storage.

Real-time processing is handled by the local AI and FastAPI pipeline, while relevant mission and spatial information can be synchronized to the cloud.

The persistence layer supports:

- Mission history
- Hazard records
- Spatial information
- Evidence references
- Maintenance status
- Municipal auditing
- Historical analysis

The architecture combines:

```
Real-Time Edge Processing
          +
Persistent Cloud Storage
```

---

## 17. System Architecture

```
                         +----------------------+
                         |   DRONE / VIDEO FEED |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |   VIDEO INGESTION    |
                         +----------+-----------+
                                    |
                                    v
              +-------------------------------------------+
              |              AI PERCEPTION                |
              |                                           |
              | YOLO Detection + Tracking                 |
              | Depth Anything V2                         |
              +---------------------+---------------------+
                                    |
                                    v
              +-------------------------------------------+
              |          SPATIAL INTELLIGENCE             |
              |                                           |
              | Area • Depth • Volume                     |
              | GPS • WGS84 • GeoJSON                     |
              +---------------------+---------------------+
                                    |
                                    v
              +-------------------------------------------+
              |              RISK ENGINE                  |
              |                                           |
              | EMA • Severity • Priority • Risk          |
              +---------------------+---------------------+
                                    |
                                    v
                         +----------------------+
                         |    FASTAPI CORE      |
                         |   REST + WebSocket   |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         |       REACT GCS      |
                         |                      |
                         | Video • OSD • GIS    |
                         | Analytics • Alerts   |
                         +----------+-----------+
                                    |
                                    v
                         +----------------------+
                         | SUPABASE / POSTGRES  |
                         +----------------------+
```

---

## 18. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Programming | Python 3.11 | Backend and AI pipeline |
| Backend | FastAPI + Uvicorn | REST API and WebSocket server |
| Detection | YOLO | Hazard detection |
| Tracking | Ultralytics Tracking | Persistent hazard IDs |
| Depth | Depth Anything V2 | Monocular depth estimation |
| Computer Vision | OpenCV | Video processing |
| AI Acceleration | PyTorch + CUDA | GPU inference |
| Frontend | React 18 + Vite | Ground Control Station |
| State Management | Zustand | Central application state |
| UI | Tailwind CSS / Custom CSS | Interface |
| Charts | Recharts / Chart.js | Analytics |
| GIS | Leaflet / React-Leaflet | Spatial visualization |
| Geospatial | WGS84 / GeoJSON | Location representation |
| Realtime | WebSocket | Live communication |
| Database | PostgreSQL | Persistent storage |
| Cloud | Supabase | Cloud synchronization |

---

## 19. Repository Structure

```
hydro-vision-3D/
│
├── data/
│   └── raw_videos/              # Drone / inspection footage
│
├── models/
│   └── checkpoints/             # AI model weights
│
├── src/
│   ├── backend/                 # FastAPI backend
│   ├── ingestion/               # Video/frame ingestion
│   ├── perception/              # YOLO detection and tracking
│   ├── geometry/                # Area and geospatial projection
│   ├── analytics/               # Severity and risk engine
│   └── run_perception.py        # Standalone perception pipeline
│
├── frontend/
│   └── src/
│       ├── components/          # GCS components
│       ├── pages/               # Dashboard pages
│       ├── hooks/               # Realtime/data hooks
│       ├── lib/                 # Supabase and utilities
│       └── store.js             # Zustand central state
│
├── static/
│   └── snapshots/               # Hazard evidence
│
├── config/
│   └── camera_intrinsics.json   # Camera parameters
│
├── docs/
│   ├── screenshots/
│   └── architecture/
│
├── tests/
├── requirements.txt
├── main.py
└── README.md
```

---

## 20. API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | System health and stream status |
| GET | `/api/stream/start` | Start inspection pipeline |
| GET | `/api/stream/stop` | Stop and reset inspection |
| GET | `/api/hazards` | Retrieve current hazards |
| GET | `/api/hazards/geojson` | Export hazards as GeoJSON |
| POST | `/api/hazards/status` | Update maintenance status |
| GET | `/api/config` | Retrieve system configuration |
| WS | `/ws/live-stream` | Real-time hazard and telemetry stream |

Interactive API documentation:

```
http://localhost:8000/docs
```

---

## 21. Quick Start

### Prerequisites

- Python 3.10+ (Python 3.11 recommended)
- Node.js 18+
- Git
- NVIDIA GPU and CUDA recommended for accelerated inference

### Clone the Repository

```bash
git clone https://github.com/Luciifer71/hydro-vision-3D.git
cd hydro-vision-3D
```

### Backend Setup

Create a virtual environment:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

Linux / macOS:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the backend:

```bash
python main.py
```

Alternatively:

```bash
python -m uvicorn src.backend.app:app --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The dashboard is typically available at:

```
http://localhost:5173
```

### Add Inspection Video

Place source footage inside:

```
data/raw_videos/
```

Example:

```
data/raw_videos/master_video.mp4
```

---

## 22. Development Hardware

Primary development and demonstration environment:

| Component | Specification |
|---|---|
| GPU | NVIDIA RTX 4060 |
| CPU | Intel Core i9-14900HX |
| RAM | 16 GB+ recommended |
| OS | Windows 11 |
| Python | 3.11 |

CUDA acceleration is used when a compatible NVIDIA GPU and PyTorch/CUDA environment are available.

---

## 23. Observed Performance

During development, the complete local AI + FastAPI + WebSocket + dashboard pipeline achieved approximately:

| Metric | Observed |
|---|---|
| Processing Rate | ~30 FPS |
| Input Resolution | 1080p |
| Detection Confidence Threshold | 0.25 |
| Dashboard Latency | Sub-second |

Actual performance depends on:

- GPU configuration
- Video resolution
- Detection workload
- Number of hazards
- Depth processing
- Available system resources

---

## 24. Current Implementation Status

**AI and Computer Vision**

- [x] YOLO hazard detection
- [x] Hazard classification
- [x] Persistent object tracking
- [x] Confidence filtering
- [x] OpenCV video processing
- [x] Depth Anything V2
- [x] CUDA-accelerated inference
- [x] Depth-based spatial analysis
- [x] Volumetric estimation

**Spatial Intelligence**

- [x] Pixel-to-real-world area estimation
- [x] Camera geometry
- [x] GSD-based measurement
- [x] GPS/WGS84 representation
- [x] Geospatial projection
- [x] Municipal zone assignment
- [x] GeoJSON export
- [x] GIS visualization

**Analytics and Risk**

- [x] EMA smoothing
- [x] Severity classification
- [x] Risk/priority scoring
- [x] Session timeline
- [x] Severity distribution
- [x] Hazard classification analytics
- [x] Cumulative area and volume metrics

**Ground Control Station**

- [x] React/Vite GCS
- [x] Recorded Video Analysis Mode
- [x] Live Drone Feed Mode
- [x] Live OSD
- [x] Hazard Feed
- [x] Mission Status
- [x] Risk Score Gauge
- [x] Analytics Dashboard
- [x] GIS Map
- [x] Alerts
- [x] Stream Control
- [x] Session reset handling

**Operations and Cloud**

- [x] Real-time WebSocket communication
- [x] REST API
- [x] Visual evidence snapshots
- [x] Maintenance ticket lifecycle
- [x] Supabase integration
- [x] PostgreSQL persistence
- [x] Asynchronous cloud synchronization

---

## 25. Future Scope

The architecture can be extended toward a city-scale infrastructure intelligence platform.

Potential future developments include:

- Multi-drone simultaneous monitoring
- Persistent PostGIS infrastructure database
- Historical infrastructure degradation analysis
- Predictive maintenance
- Automated municipal work-order generation
- Mobile application for field crews
- Follow-up drone-based repair verification
- Multi-zone concurrent monitoring
- Infrastructure digital twins
- Long-term infrastructure risk forecasting

---

## 26. Project Impact

**Traditional Workflow**

```
Manual Inspection
       |
       v
Manual Reporting
       |
       v
Manual Verification
       |
       v
Delayed Prioritization
       |
       v
Maintenance
```

**HYDRO-VISION-3D Workflow**

```
Drone / Video Inspection
       |
       v
AI Detection
       |
       v
Measurement
       |
       v
Geolocation
       |
       v
Severity Assessment
       |
       v
Priority Scoring
       |
       v
Visual Evidence
       |
       v
Maintenance Dispatch
       |
       v
Closure Tracking
```

This enables a transition from reactive inspection toward data-driven infrastructure management.

---

## 27. Long-Term Vision

The long-term objective is to create a continuously updated infrastructure intelligence layer for cities.

```
Drone Missions
      |
      v
AI Perception
      |
      v
Persistent Hazard Database
      |
      v
GIS Infrastructure Intelligence
      |
      v
Historical Risk Analysis
      |
      v
Predictive Maintenance
      |
      v
Automated Work Orders
      |
      v
Field Crew Action
      |
      v
Repair Verification
      |
      v
Updated Infrastructure State
```

The intended transition is:

- Manual → Automated
- Reactive → Preventive
- Subjective → Quantified
- Disconnected → Geo-Spatial
- Detection → Action

---

## 28. Team

**Team Drone404**

ELCIA Tech Summit 2026 Hackathon
GSFC University

Lead Developer: Krishay Mayur Shah

---

**HYDRO-VISION-3D**

*Detect. Quantify. Locate. Assess. Prioritize. Act.*

AI-powered infrastructure intelligence for safer and smarter urban environments.