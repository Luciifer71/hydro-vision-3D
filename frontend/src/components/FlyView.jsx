import { useStore } from '../store.js';
import VideoPlayer from './VideoPlayer.jsx';
import OSDOverlay from './OSDOverlay.jsx';
import AttitudeCard from './AttitudeCard.jsx';
import HazardFeed from './HazardFeed.jsx';
import MissionStatusPanel from './MissionStatusPanel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { useLiveHazards } from '../hooks/useLiveHazards';

export default function FlyView() {
  // 🟢 1. Extract telemetry and video controls from store
  const {
    telemetry = { pitch: 0, roll: 0 },
    currentState = {},
    streamRunning = false,
    videoPath = '/sample-drone.mp4',
    updateLocalVideoFrame,
  } = useStore() || {};

  // 🟢 2. Extract live database hazards and volume metrics
  const { hazards = [], totalMarkers = 0, totalVolume = 0 } = useLiveHazards() || {};

  // 🟢 3. Derived UI metrics with safe fallbacks
  const riskLevel = currentState?.summary?.overall_risk || (totalVolume > 2.0 ? 'CRITICAL' : 'LOW');
  const activeHazards = totalMarkers || hazards.length;
  const totalArea = Number(totalVolume) || 0;
  const riskScore = currentState?.summary?.risk_score ? currentState.summary.risk_score * 25 : 50;
  const isCritical = riskLevel === 'CRITICAL';
  const frameId = currentState?.frame_id ?? 0;

  return (
    <div className="fly-layout" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Video Feed & OSD Panel ── */}
      <div className="video-panel">
        <ErrorBoundary name="Video Player">
          <VideoPlayer
            src={videoPath}
            onFrameUpdate={updateLocalVideoFrame}
          />
        </ErrorBoundary>

        <ErrorBoundary name="OSD Overlay">
          <OSDOverlay
            telemetry={telemetry}
            riskLevel={riskLevel}
            activeHazards={activeHazards}
            totalArea={totalArea}
            riskScore={riskScore}
            isCritical={isCritical}
            streamRunning={streamRunning}
            frameId={frameId}
          />
        </ErrorBoundary>
      </div>

      {/* ── Right Panel (Attitude, Hazard Feed, Mission Status) ── */}
      <div className="fly-right">
        <ErrorBoundary name="Attitude Card">
          <AttitudeCard 
            pitch={telemetry?.pitch || 0} 
            roll={telemetry?.roll || 0} 
          />
        </ErrorBoundary>

        <ErrorBoundary name="Hazard Feed">
          <HazardFeed 
            hazards={hazards} 
            activeHazards={activeHazards} 
          />
        </ErrorBoundary>

        <ErrorBoundary name="Mission Status Panel">
          <MissionStatusPanel
            streamRunning={streamRunning}
            hazards={hazards}
            totalArea={totalArea}
            currentState={currentState}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}