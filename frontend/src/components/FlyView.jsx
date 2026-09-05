import React from 'react';
import { useStore } from '../store.js';
import VideoPlayer from './VideoPlayer.jsx';
import OSDOverlay from './OSDOverlay.jsx';
import AttitudeCard from './AttitudeCard.jsx';
import HazardFeed from './HazardFeed.jsx';
import MissionStatusPanel from './MissionStatusPanel.jsx';
import VideoExportCard from './VideoExportCard.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import ConfidenceSlider from './ConfidenceSlider.jsx';
import { computeSessionRisk } from '../lib/derive.js';

export default function FlyView() {
  // 1. Extract telemetry and store state safely
  const store = useStore() || {};
  const telemetry = store.telemetry || { pitch: 0, roll: 0 };
  const currentState = store.currentState || {};
  const streamRunning = store.streamRunning || false;
  const videoPath = store.videoPath || '/sample-drone.mp4';
  const updateLocalVideoFrame = store.updateLocalVideoFrame;

  // 2. State mapped from store
  const hazards = store.hazards || [];
  const activeFrameHazards = hazards; // Use store's latest hazards since tracking handles persistence
  const displayHazards = hazards;
  const activeHazards = displayHazards.length;
  
  const totalArea = hazards.reduce((sum, h) => sum + (Number(h.surface_area_m2) || 0), 0);
  const { riskScore, riskLevel } = computeSessionRisk(displayHazards, currentState.summary || {});
    
  const isCritical = riskLevel === 'CRITICAL';
  const frameId = (currentState && currentState.frame_id !== undefined) ? currentState.frame_id : 0;
  const isLive = store.connectionStatus === 'LIVE';

  return (
    <div className="fly-layout" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Video Feed & OSD Panel ── */}
      <div className="video-panel">
        <ErrorBoundary name="Video Player">
          {isLive ? (
            <img 
              src="/api/stream_video" 
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

        <ErrorBoundary name="Video Export Card">
          <VideoExportCard streamRunning={isLive || streamRunning} />
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

        <ErrorBoundary name="Confidence Slider">
          <ConfidenceSlider />
        </ErrorBoundary>
      </div>
    </div>
  );
}