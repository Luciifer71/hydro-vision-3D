import React from 'react';
import { useStore } from '../store.js';
import VideoPlayer from './VideoPlayer.jsx';
import OSDOverlay from './OSDOverlay.jsx';
import AttitudeCard from './AttitudeCard.jsx';
import HazardFeed from './HazardFeed.jsx';
import MissionStatusPanel from './MissionStatusPanel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { useLiveHazards } from '../hooks/useLiveHazards';

export default function FlyView() {
  // 1. Extract telemetry and store state safely
  const store = useStore() || {};
  const telemetry = store.telemetry || { pitch: 0, roll: 0 };
  const currentState = store.currentState || {};
  const streamRunning = store.streamRunning || false;
  const videoPath = store.videoPath || '/sample-drone.mp4';
  const updateLocalVideoFrame = store.updateLocalVideoFrame;

  // 2. Extract live WebSocket telemetry from custom hook
  const liveHazards = useLiveHazards() || {};
  const hazards = liveHazards.hazards || [];
  const activeFrameHazards = liveHazards.activeFrameHazards || [];
  const totalMarkers = liveHazards.totalMarkers || 0;
  const totalVolume = liveHazards.totalVolume || 0;
  const wsStatus = liveHazards.wsStatus || 'offline';

  // 3. Derived UI metrics
  const displayHazards = activeFrameHazards.length > 0 ? activeFrameHazards : (hazards.length > 0 ? hazards : (store.hazards || []));
  const activeHazards = totalMarkers || displayHazards.length;
  const totalArea = Number(totalVolume) || 0;
  
  const riskLevel = (currentState.summary && currentState.summary.overall_risk) || 
    (totalArea > 2.0 ? 'CRITICAL' : 'LOW');
  
  const riskScore = (currentState.summary && currentState.summary.risk_score) 
    ? currentState.summary.risk_score * 25 
    : 50;
    
  const isCritical = riskLevel === 'CRITICAL';
  const frameId = (currentState && currentState.frame_id !== undefined) ? currentState.frame_id : 0;
  const isLive = wsStatus === 'online';

  return (
    <div className="fly-layout" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Video Feed & OSD Panel ── */}
      <div className="video-panel">
        <ErrorBoundary name="Video Player">
          {isLive ? (
            <img 
              src="http://localhost:8000/api/stream_video" 
              alt="Hydro-Vision 3D AI Dual Perception Stream" 
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          ) : (
            <VideoPlayer
              src={videoPath}
              onFrameUpdate={updateLocalVideoFrame}
            />
          )}
        </ErrorBoundary>

        <ErrorBoundary name="OSD Overlay">
          <OSDOverlay
            telemetry={telemetry}
            riskLevel={riskLevel}
            activeHazards={activeHazards}
            totalArea={totalArea}
            riskScore={riskScore}
            isCritical={isCritical}
            streamRunning={isLive || streamRunning}
            frameId={frameId}
          />
        </ErrorBoundary>
      </div>

      {/* ── Right Panel (Attitude, Hazard Feed, Mission Status) ── */}
      <div className="fly-right">
        <ErrorBoundary name="Attitude Card">
          <AttitudeCard 
            pitch={telemetry.pitch || 0} 
            roll={telemetry.roll || 0} 
          />
        </ErrorBoundary>

        <ErrorBoundary name="Hazard Feed">
          <HazardFeed 
            hazards={displayHazards} 
            activeHazards={activeHazards} 
          />
        </ErrorBoundary>

        <ErrorBoundary name="Mission Status Panel">
          <MissionStatusPanel
            streamRunning={isLive || streamRunning}
            hazards={displayHazards}
            totalArea={totalArea}
            currentState={currentState}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}