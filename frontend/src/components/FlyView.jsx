import { useStore } from '../store.js';
import VideoPlayer from './VideoPlayer.jsx';
import OSDOverlay from './OSDOverlay.jsx';
import AttitudeCard from './AttitudeCard.jsx';
import HazardFeed from './HazardFeed.jsx';
import MissionStatusPanel from './MissionStatusPanel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';

export default function FlyView() {
  const {
    telemetry,
    currentState,
    hazards,
    connectionStatus,
    streamRunning,
    videoPath,
    updateLocalVideoFrame,
  } = useStore();

  const riskLevel = currentState?.summary?.overall_risk || 'MODERATE';
  const activeHazards = currentState?.summary?.active_hazards || hazards.length || 3;
  const totalArea = currentState?.summary?.total_area_m2 || 18.4;
  const riskScore = currentState?.summary?.risk_score ? currentState.summary.risk_score * 25 : 50;
  const isCritical = riskLevel === 'CRITICAL';
  const frameId = currentState?.frame_id ?? 0;

  return (
    <div className="fly-layout" style={{ flex: 1, minHeight: 0 }}>
      {/* ── Video Feed & OSD Panel ── */}
      <div className="video-panel">
        <ErrorBoundary name="Video Player">
          <VideoPlayer
            src={videoPath || '/sample-drone.mp4'}
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
            streamRunning={streamRunning || true}
            frameId={frameId}
          />
        </ErrorBoundary>
      </div>

      {/* ── Right Panel (Attitude, Hazard Feed, Mission Status) ── */}
      <div className="fly-right">
        <ErrorBoundary name="Attitude Card">
          <AttitudeCard pitch={telemetry.pitch} roll={telemetry.roll} />
        </ErrorBoundary>

        <ErrorBoundary name="Hazard Feed">
          <HazardFeed hazards={hazards} activeHazards={activeHazards} />
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
