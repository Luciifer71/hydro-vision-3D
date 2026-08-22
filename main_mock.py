import asyncio
import json
import random
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Hydro-Vision 3D Mock Backend")

# Enable CORS for React frontend (Vite defaults to port 5173 or 3000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "online", "system": "Hydro-Vision 3D GCS Mock Server"}


@app.websocket("/ws/live-stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[INFO] React Frontend Connected to Telemetry Stream")

    frame_count = 0
    try:
        while True:
            frame_count += 1

            # Generate realistic mock telemetry and hazard counts
            mock_payload = {
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "frame_id": frame_count,
                "telemetry": {
                    "altitude": round(random.uniform(24.5, 26.2), 1),
                    "battery": max(100 - (frame_count // 10), 15),
                    "satellites": random.randint(10, 14),
                    "mode": "MAPPING",
                },
                "hazards_summary": {
                    "total_count": 3,
                    "active_risk": "CRITICAL",
                    "total_area_m2": 129.5,
                },
                "detections": [
                    {
                        "track_id": 101,
                        "type": "Pothole",
                        "confidence": 0.94,
                        "area_m2": 82.5,
                        "severity": "CRITICAL",
                    },
                    {
                        "track_id": 102,
                        "type": "Waterlogging",
                        "confidence": 0.88,
                        "area_m2": 34.2,
                        "severity": "HIGH",
                    },
                    {
                        "track_id": 103,
                        "type": "Crack",
                        "confidence": 0.91,
                        "area_m2": 12.8,
                        "severity": "MODERATE",
                    },
                ],
            }

            await websocket.send_text(json.dumps(mock_payload))
            await asyncio.sleep(1.5)  # Stream update rate

    except WebSocketDisconnect:
        print("[INFO] React Frontend Disconnected")