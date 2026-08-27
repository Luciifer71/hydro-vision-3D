# 🌊 HYDRO-VISION-3D

### AI-Powered 3D Ground Control Station for Monsoon, Road & Civic Infrastructure Intelligence

<p align="center">

**Team Drone404 • ELCIA Tech Summit 2026 Hackathon • GSFC University**

</p>

<p align="center">

![Python](https://img.shields.io/badge/Python-3.11-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688)
![YOLO](https://img.shields.io/badge/YOLO-AI%20Detection-red)
![Depth Anything V2](https://img.shields.io/badge/Depth%20Anything%20V2-3D%20Depth-purple)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--Time-lightgrey)
![Leaflet](https://img.shields.io/badge/Leaflet-GIS-199900)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E)

</p>

---

## 🎯 Problem Statement

### Monsoon, Roads & Civic Infrastructure Intelligence

Use road, drain and rainfall-condition videos to identify:

- 💧 Waterlogging
- 🕳️ Potholes
- 🚰 Drainage overflow
- 🚶 Damaged footpaths
- ⚠️ Road-surface and civic infrastructure risks

Each detected issue should be associated with:

- 📍 Zone
- 🔴 Severity
- 🕐 Time
- 📸 Visual evidence

and should ultimately support a:

> **Maintenance-priority and closure-tracking dashboard.**

---

# 💡 Our Solution

**HYDRO-VISION-3D** is an end-to-end AI-powered Ground Control Station (GCS) that transforms drone and inspection video into **real-time, geo-located, quantified and actionable infrastructure intelligence**.

Instead of simply detecting a pothole or waterlogged area, the system is designed to answer:

> **What is the hazard, where is it, how large is it, how severe is it, how urgent is it, what evidence supports it, and what action should be taken?**

### Complete Pipeline

```text
🚁 Drone / Inspection Video
            │
            ▼
     Video Ingestion
            │
            ▼
   YOLO Detection + Tracking
            │
            ├───────────────┐
            ▼               ▼
   Hazard Classification   Depth Anything V2
            │               │
            └───────┬───────┘
                    ▼
          Spatial Intelligence
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
      Area (m²)          Depth / Volume (m³)
          │                   │
          └─────────┬─────────┘
                    ▼
          GPS / WGS84 Projection
                    │
                    ▼
          Severity + Risk Engine
                    │
                    ▼
          Real-Time WebSocket
                    │
                    ▼
            React GCS Dashboard
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
       GIS        Alerts       OSD
        │           │           │
        └───────────┼───────────┘
                    ▼
          Maintenance Workflow
                    │
                    ▼
           Supabase / PostgreSQL
```

---

# 🧩 How HYDRO-VISION-3D Solves the Problem

| Problem Statement | Our Implementation |
|---|---|
| Waterlogging | AI detection + spatial/depth analysis |
| Potholes | YOLO detection + persistent tracking |
| Drainage overflow | Hazard classification and monitoring |
| Damaged footpaths | AI-based infrastructure hazard detection |
| Surface risks | Detection + severity/risk engine |
| Zone | GPS/WGS84 + municipal zone mapping |
| Severity | LOW / MODERATE / HIGH / CRITICAL |
| Time | Frame timestamps + session timeline |
| Visual Evidence | Automatic hazard snapshots |
| Maintenance Priority | 1–100 risk/priority score |
| Closure Tracking | OPEN → IN_PROGRESS → RESOLVED |
| Real-Time Monitoring | FastAPI + WebSocket |
| Spatial Intelligence | GIS + GeoJSON |
| 3D Intelligence | Depth Anything V2 + volumetric estimation |
| Persistent Records | Supabase + PostgreSQL |

---

# ✨ Key Features

## 🎯 AI Hazard Detection & Tracking

The perception pipeline uses trained YOLO models to detect and classify road and civic infrastructure hazards.

Each detection can contain:

```text
Hazard Class
Confidence
Bounding Box
Track ID
Frame ID
Timestamp
```

Persistent `track_id` values allow the system to track the same physical hazard across consecutive frames, reducing duplicate counting and improving temporal consistency.

---

## 🧊 3D & Depth Intelligence

HYDRO-VISION-3D integrates **Depth Anything V2** for dense monocular depth estimation.

The depth pipeline allows the system to move beyond simple 2D bounding boxes toward spatial and volumetric understanding.

```text
RGB Drone Frame
       │
       ▼
Depth Anything V2
       │
       ▼
Dense Depth Map
       │
       ▼
Hazard Region
       │
       ▼
Depth-Aware Geometry
       │
       ▼
Estimated Volume (m³)
```

This is especially useful for:

- Waterlogging
- Road depressions
- Potholes
- Surface-level infrastructure damage

where volume can provide more information than area alone.

---

## 📐 Real-World Area Estimation

Image-space detections are converted into estimated physical dimensions using camera geometry and Ground Sample Distance (GSD).

```text
Pixel Detection
      ↓
Camera Geometry
      ↓
GSD / Spatial Scaling
      ↓
Estimated Real-World Area
      ↓
m²
```

The measurements are engineering estimates and can be further calibrated for production-grade surveying.

---

## 🌍 Geospatial Intelligence

The system combines image coordinates with drone telemetry and camera parameters to estimate geographic locations.

Inputs include:

- Latitude
- Longitude
- Altitude
- Heading
- Camera orientation
- Camera intrinsics
- Pixel coordinates

```text
Image Detection
      +
Drone Telemetry
      +
Camera Geometry
      ↓
Geospatial Projection
      ↓
WGS84 Coordinates
      ↓
Municipal Zone
      ↓
GIS Hazard Record
```

Hazards can also be exported as standard **GeoJSON** data.

---

## 📉 EMA-Based Stabilization

Computer-vision measurements naturally fluctuate between frames.

HYDRO-VISION-3D uses Exponential Moving Average (EMA) smoothing to stabilize measurements:

```text
Smoothed Value =
0.7 × Previous Value +
0.3 × Current Value
```

This reduces:

- Detection jitter
- Measurement fluctuations
- Risk-score instability
- Severity flickering
- Unstable analytics graphs

---

# 🚦 Risk & Severity Engine

Every detected hazard receives a severity classification.

| Severity | Affected Area | Recommended Action |
|---|---:|---|
| 🟢 LOW | `< 5 m²` | Monitor |
| 🟡 MODERATE | `5–25 m²` | Schedule maintenance |
| 🟠 HIGH | `25–75 m²` | Dispatch maintenance crew |
| 🔴 CRITICAL | `≥ 75 m²` | Emergency response / traffic reroute |

The system also calculates a normalized **1–100 risk/maintenance priority score**.

Priority can consider:

- Hazard type
- Affected area
- Severity
- Safety implications

For example, a waterlogged road or open manhole can receive a higher operational priority than an equivalent-area low-risk surface defect.

---

# 🛰️ Ground Control Station

The React-based GCS is the central interface for operating and monitoring the inspection mission.

## Live Drone Feed

The Live Feed provides:

- Live video
- GPS
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

### Live OSD

The on-screen display provides mission-critical information directly over the video feed.

```text
LAT / LON
ALT / HDG
BATT / RSSI / SAT
SPD / V.SPD
TIME
HAZARDS
AREA
RISK
SCORE
FRAME
```

---

# 🎥 Dual Video Modes

## Recorded Video Analysis

Used for:

- Demonstrations
- Post-monsoon assessment
- Offline inspection
- Testing
- Repeatable evaluation
- Mission analysis

## Live Drone Feed

Used for:

- Real-time inspection
- Live telemetry
- Real-time hazard monitoring
- Operator decision support

The GCS can switch between recorded and live inspection workflows.

---

# 📊 Analytics Dashboard

The dashboard provides a centralized view of the current mission.

### Infrastructure Overview

Displays:

- Total hazards
- Active alerts
- Cumulative affected area
- Estimated cumulative volume
- Session risk level
- Active alerts
- Detection timeline
- Severity distribution
- Hazard classification
- Risk score gauge

### Live Hazard Feed

Continuously displays detected hazards with:

- Hazard classification
- Track ID
- Severity
- Area
- Status
- Relevant measurements

### Mission Status

Provides a quick operational summary:

```text
Mode
Total Hazards Found
Affected Area
Current Risk
Recommended Action
```

---

# 🗺️ GIS & Spatial Dashboard

The platform includes an interactive Leaflet-based GIS interface.

It visualizes:

- Hazard locations
- Severity markers
- Municipal zones
- Drone position
- Flight information
- Spatial context

The backend provides GeoJSON export for interoperability with external GIS systems.

```text
GET /api/hazards/geojson
```

---

# ⚡ Real-Time WebSocket Architecture

The system uses **FastAPI + WebSocket** for real-time communication between the AI pipeline and GCS.

```text
AI Pipeline
     │
     ▼
FastAPI Backend
     │
     │ WebSocket
     ▼
Zustand Central State
     │
 ┌───┼─────────┬─────────┐
 ▼   ▼         ▼         ▼
OSD Charts   Alerts     GIS
```

This enables the dashboard to update continuously without page refreshes or traditional polling.

Real-time updates can include:

- Hazard detections
- Telemetry
- Risk score
- Hazard count
- Detection timeline
- Mission status
- GIS information

---

# 📸 Visual Evidence Capture

When a new hazard is detected, the system can generate a visual evidence snapshot.

```text
New Hazard
    ↓
Track ID
    ↓
Detection Region
    ↓
Evidence Crop
    ↓
Saved Snapshot
    ↓
Linked to Hazard Record
```

This gives maintenance personnel visual confirmation before dispatching resources.

---

# 🎫 Maintenance & Closure Tracking

HYDRO-VISION-3D connects AI detection with an operational maintenance workflow.

```text
DETECTED
   ↓
OPEN
   ↓
IN_PROGRESS
   ↓
RESOLVED
```

Each hazard record can include:

```text
Hazard Type
Track ID
Confidence
Area
Estimated Volume
Severity
Priority Score
GPS Location
Municipal Zone
Timestamp
Visual Evidence
Maintenance Status
```

This creates a complete:

> **Detect → Assess → Prioritize → Dispatch → Resolve**

workflow.

---

# ☁️ Supabase & PostgreSQL

HYDRO-VISION-3D integrates **Supabase with PostgreSQL** for persistent cloud storage.

The architecture separates immediate real-time processing from long-term data persistence.

```text
Real-Time AI Processing
          │
          ▼
      Local State
          │
          ├──────────→ WebSocket → GCS
          │
          ▼
      Supabase
          │
          ▼
     PostgreSQL
```

Persistent storage enables:

- Mission history
- Hazard records
- Spatial information
- Evidence references
- Maintenance status
- Municipal auditing
- Historical analysis
- Future predictive maintenance

---

# 🏗️ System Architecture

```text
                         ┌──────────────────────┐
                         │ 🚁 DRONE / VIDEO FEED│
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   VIDEO INGESTION    │
                         └──────────┬───────────┘
                                    │
                                    ▼
              ┌─────────────────────────────────────┐
              │             AI PERCEPTION            │
              │                                     │
              │ YOLO Detection + Tracking           │
              │ Depth Anything V2                   │
              └─────────────────┬───────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────────┐
              │       SPATIAL INTELLIGENCE          │
              │                                     │
              │ Area • Depth • Volume               │
              │ GPS • WGS84 • GeoJSON               │
              └─────────────────┬───────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────────┐
              │             RISK ENGINE              │
              │                                     │
              │ EMA • Severity • Priority • Risk    │
              └─────────────────┬───────────────────┘
                                │
                                ▼
                         ┌──────────────────┐
                         │  FASTAPI CORE    │
                         │ REST + WebSocket │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │    REACT GCS     │
                         │                  │
                         │ Video • OSD      │
                         │ Analytics • GIS  │
                         │ Alerts • Mission │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ SUPABASE /       │
                         │ POSTGRESQL       │
                         └──────────────────┘
```

---

# 🛠️ Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Programming | Python 3.11 | AI + backend |
| Backend | FastAPI + Uvicorn | REST + WebSocket |
| AI Detection | YOLO | Hazard detection |
| Tracking | Ultralytics Tracking | Persistent hazard IDs |
| Depth | Depth Anything V2 | Monocular depth estimation |
| Computer Vision | OpenCV | Video processing |
| Acceleration | PyTorch + CUDA | GPU inference |
| Frontend | React 18 + Vite | GCS |
| State Management | Zustand | Central frontend state |
| Styling | Tailwind CSS / Custom CSS | Dashboard UI |
| Charts | Recharts / Chart.js | Analytics |
| Mapping | Leaflet / React-Leaflet | GIS |
| Geospatial | WGS84 / GeoJSON | Spatial interoperability |
| Realtime | WebSocket | Live communication |
| Database | PostgreSQL | Persistent storage |
| Cloud | Supabase | Cloud synchronization |

---

# 📂 Repository Structure

```text
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
│   ├── perception/              # YOLO detection + tracking
│   ├── geometry/                # Area + geospatial projection
│   ├── analytics/               # Severity + risk engine
│   └── run_perception.py        # Standalone pipeline
│
├── frontend/
│   └── src/
│       ├── components/          # GCS components
│       ├── pages/               # Dashboard pages
│       ├── hooks/               # Realtime/data hooks
│       ├── lib/                 # Supabase/utilities
│       └── store.js             # Zustand central state
│
├── static/
│   └── snapshots/               # Hazard evidence
│
├── config/
│   └── camera_intrinsics.json
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

# 🔌 API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | System health and stream status |
| `GET` | `/api/stream/start` | Start inspection pipeline |
| `GET` | `/api/stream/stop` | Stop and reset inspection |
| `GET` | `/api/hazards` | Retrieve current hazards |
| `GET` | `/api/hazards/geojson` | Export hazards as GeoJSON |
| `POST` | `/api/hazards/status` | Update maintenance status |
| `GET` | `/api/config` | Retrieve system configuration |
| `WS` | `/ws/live-stream` | Real-time hazard and telemetry stream |

FastAPI documentation:

```text
http://localhost:8000/docs
```

---

# 🚀 Quick Start

## Prerequisites

- Python 3.10+
- Python 3.11 recommended
- Node.js 18+
- Git
- NVIDIA GPU + CUDA recommended for accelerated inference

---

## 1. Clone Repository

```bash
git clone https://github.com/Luciifer71/hydro-vision-3D.git
cd hydro-vision-3D
```

---

## 2. Backend Setup

### Create Virtual Environment

```bash
python -m venv .venv
```

### Windows

```bash
.venv\Scripts\activate
```

### Linux / macOS

```bash
source .venv/bin/activate
```

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Start Backend

```bash
python main.py
```

Alternatively:

```bash
python -m uvicorn src.backend.app:app --host 0.0.0.0 --port 8000
```

Backend:

```text
http://localhost:8000
```

---

## 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Dashboard:

```text
http://localhost:5173
```

---

## 4. Add Inspection Video

Place source footage inside:

```text
data/raw_videos/
```

Example:

```text
data/raw_videos/master_video.mp4
```

---

# 🧪 Standalone Perception Pipeline

The AI pipeline can also be tested without the dashboard:

```bash
python src/run_perception.py data/raw_videos/master_video.mp4
```

Useful for:

- AI model testing
- Detection validation
- Pipeline debugging
- Performance testing

---

# 💻 Development Hardware

Primary development/demo environment:

| Component | Specification |
|---|---|
| GPU | NVIDIA RTX 4060 |
| CPU | Intel Core i9-14900HX |
| RAM | 16 GB+ recommended |
| OS | Windows 11 |
| Python | 3.11 |

CUDA acceleration is used when a compatible NVIDIA GPU and PyTorch/CUDA environment are available.

---

# 📈 Observed Performance

During development, the complete local AI + FastAPI + WebSocket + dashboard pipeline achieved approximately:

| Metric | Observed |
|---|---:|
| Processing Rate | ~30 FPS |
| Input | 1080p footage |
| Detection Confidence | 0.25 |
| Dashboard Latency | Sub-second |

Performance varies depending on:

- GPU configuration
- Video resolution
- Model workload
- Number of hazards per frame
- Depth processing
- System resources

---

# ✅ Current Implementation

## AI & Computer Vision

- [x] YOLO hazard detection
- [x] Custom hazard classification
- [x] Persistent object tracking
- [x] Confidence filtering
- [x] OpenCV video processing
- [x] Depth Anything V2
- [x] CUDA-accelerated inference
- [x] Depth-based spatial analysis
- [x] Volumetric estimation

## Spatial Intelligence

- [x] Pixel-to-real-world area estimation
- [x] Camera geometry
- [x] GSD-based measurement
- [x] GPS/WGS84 representation
- [x] Geospatial projection
- [x] Municipal zone assignment
- [x] GeoJSON export
- [x] GIS visualization

## Analytics & Risk

- [x] EMA smoothing
- [x] Severity classification
- [x] Risk/priority scoring
- [x] Session timeline
- [x] Severity distribution
- [x] Hazard classification analytics
- [x] Cumulative area/volume metrics

## Ground Control Station

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

## Operations & Cloud

- [x] Real-time WebSocket communication
- [x] REST API
- [x] Visual evidence snapshots
- [x] Maintenance ticket lifecycle
- [x] Supabase integration
- [x] PostgreSQL persistence
- [x] Asynchronous cloud synchronization

---

# 🔮 Future Scope

The platform can be extended toward a city-scale infrastructure intelligence system with:

- Multi-drone simultaneous monitoring
- Persistent PostGIS infrastructure database
- Historical hazard intelligence
- Predictive road deterioration
- Automated municipal work-order generation
- Mobile application for field crews
- Follow-up drone-based repair verification
- Multi-zone concurrent monitoring
- Infrastructure digital twins

---

# 🏆 Why HYDRO-VISION-3D?

A conventional computer-vision system might simply report:

```text
"Pothole detected."
```

HYDRO-VISION-3D aims to produce:

```text
WHAT
Pothole / Waterlogging / Infrastructure Hazard

WHERE
GPS + Municipal Zone

WHEN
Timestamp + Mission Timeline

HOW LARGE
Estimated Area (m²)

HOW DEEP / EXTENSIVE
Depth + Estimated Volume (m³)

HOW SEVERE
Severity Level

HOW URGENT
Priority / Risk Score

EVIDENCE
Visual Snapshot

WHAT NEXT
Maintenance Recommendation

STATUS
OPEN → IN_PROGRESS → RESOLVED
```

The core philosophy is:

# **DETECT → QUANTIFY → LOCATE → ASSESS → PRIORITIZE → ACT**

This transforms inspection video from passive visual information into a **real-time infrastructure intelligence and maintenance decision-support system**.

---

# 🌆 Real-World Applications

### 🚧 Municipal Road Maintenance

Automatically identify and prioritize road hazards for maintenance teams.

### 🌧️ Post-Monsoon & Flood Assessment

Rapidly identify waterlogged and damaged road sections after heavy rainfall.

### 🚰 Drainage Monitoring

Identify drainage overflow and recurring water accumulation zones.

### 🏙️ Smart City Planning

Build spatial and historical intelligence around recurring infrastructure failures.

### 👷 Maintenance Dispatch

Provide crews with:

```text
Location
+
Severity
+
Area
+
Volume
+
Priority
+
Evidence
+
Recommended Action
```

instead of requiring manual interpretation of raw footage.

---

# 🌍 Long-Term Vision

Our long-term objective is to create a continuously updated **digital infrastructure intelligence layer for cities**.

```text
Drone Missions
      ↓
AI Perception
      ↓
Persistent Hazard Database
      ↓
GIS Infrastructure Intelligence
      ↓
Historical Risk Analysis
      ↓
Predictive Maintenance
      ↓
Automated Work Orders
      ↓
Field Crew Action
      ↓
Repair Verification
      ↓
Updated Infrastructure State
```

This enables a transition from:

**Reactive → Preventive**

**Manual → Autonomous**

**Subjective → Quantified**

**Disconnected → Geo-Spatial**

**Detection → Action**

---

# 👥 Team

## Team Drone404

**ELCIA Tech Summit 2026 Hackathon**  
**GSFC University**

**Lead Developer:** Krishay Mayur Shah

---

<p align="center">

# 🌊 HYDRO-VISION-3D

### **See the hazard. Quantify the impact. Locate the problem. Prioritize the response.**

**AI-Powered Infrastructure Intelligence for Smarter, Safer Cities.**

</p>

<p align="center">

Built by **Team Drone404** for the **ELCIA Tech Summit 2026 Hackathon**.

</p>