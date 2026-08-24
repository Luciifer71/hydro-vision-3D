import { useStore } from '../store.js';

export default function BottomBar() {
  const { connectionStatus, currentState, telemetry, streamRunning } = useStore();
  const frameId = currentState?.frame_id ?? 0;
  const uptime = streamRunning ? `${Math.floor(telemetry.flightTime / 60)}:${Math.floor(telemetry.flightTime % 60).toString().padStart(2, '0')}` : '00:00';

  return (
    <div className="bottom-bar">
      <div className="bottom-bar-item">
        <span className="label">Status:</span>
        <span className="value" style={{ color: connectionStatus === 'LIVE' ? '#10b981' : '#cc0000' }}>
          {connectionStatus}
        </span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">Connection:</span>
        <span className="value">{uptime}</span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">Frame:</span>
        <span className="value">#{frameId}</span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">Hazards:</span>
        <span className="value">{currentState?.summary?.active_hazards ?? 0}</span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">Risk:</span>
        <span className="value">{currentState?.summary?.overall_risk ?? 'LOW'}</span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">SAT:</span>
        <span className="value">{telemetry.satellites}</span>
      </div>
      <div className="bottom-bar-item">
        <span className="label">BATT:</span>
        <span className="value" style={{ color: telemetry.battery > 40 ? '#10b981' : telemetry.battery > 20 ? '#ffbb00' : '#cc0000' }}>
          {Math.round(telemetry.battery)}%
        </span>
      </div>
      <div className="bottom-bar-item" style={{ marginLeft: 'auto' }}>
        <span className="value" style={{ color: '#555' }}>Hydro-Vision 3D v2.1.0</span>
      </div>
    </div>
  );
}
