import { useStore } from '../store.js';

function fmtTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function TelemetryBar() {
  const { telemetry, currentState, connectionStatus, feedMode, switchToLiveFeed } = useStore();
  const t = telemetry;
  const riskLevel = currentState?.summary?.overall_risk || 'LOW';
  const riskColor = { LOW: 'good', MODERATE: 'warn', HIGH: 'warn', CRITICAL: 'danger' }[riskLevel] || 'good';

  const isLive = feedMode === 'live';
  const battPct = Math.round(t.battery);
  const battColor = battPct > 40 ? '#10b981' : battPct > 20 ? '#f59e0b' : '#ef4444';
  const battClass = battPct > 40 ? 'good' : battPct > 20 ? 'warn' : 'danger';
  const rssiClass = t.rssi > -70 ? 'good' : t.rssi > -85 ? 'warn' : 'danger';

  if (!isLive) {
    return (
      <div className="tele-bar" style={{ justifyContent: 'space-between', background: 'rgba(20, 20, 25, 0.95)', borderBottom: '1px solid rgba(255, 187, 0, 0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(255, 187, 0, 0.15)', border: '1px solid var(--amber)',
            color: 'var(--amber)', padding: '3px 10px', borderRadius: 4,
            fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.5px'
          }}>
            <span>🎬 RECORDED VIDEO ANALYSIS MODE</span>
            <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>(Live Telemetry Hidden)</span>
          </div>

          <div className="tele-item">
            <span className="tele-label">VIDEO TIME</span>
            <span className="tele-value">{fmtTime(t.flightTime)}</span>
          </div>

          <div className="tele-item">
            <span className="tele-label">RISK LEVEL</span>
            <span className={`tele-value ${riskColor}`}>{riskLevel}</span>
          </div>

          <div className="tele-item">
            <span className="tele-label">HAZARDS</span>
            <span className="tele-value good">{currentState?.summary?.active_hazards || 0}</span>
          </div>
        </div>

        <button
          className="btn"
          onClick={switchToLiveFeed}
          style={{
            background: 'linear-gradient(135deg, #00cc00, #009900)',
            color: '#1a1a1a',
            fontWeight: 800,
            fontSize: '0.75rem',
            padding: '5px 14px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 10px rgba(0, 204, 0, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>🔴</span>
          Switch to Live Drone Feed
        </button>
      </div>
    );
  }

  return (
    <div className="tele-bar">
      <div className="tele-item">
        <span className="tele-label">ALT</span>
        <span className={`tele-value ${connectionStatus === 'LIVE' ? 'good' : ''}`}>
          {t.altitude.toFixed(1)}
        </span>
        <span className="tele-unit">m</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">SPD</span>
        <span className="tele-value">{t.speed.toFixed(1)}</span>
        <span className="tele-unit">m/s</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">V.SPD</span>
        <span className={`tele-value ${t.verticalSpeed >= 0 ? '' : 'warn'}`}>
          {t.verticalSpeed >= 0 ? '+' : ''}{t.verticalSpeed.toFixed(1)}
        </span>
        <span className="tele-unit">m/s</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">HDG</span>
        <span className="tele-value">{Math.round(t.heading)}°</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">LAT</span>
        <span className="tele-value" style={{ fontSize: '0.72rem' }}>{t.latitude.toFixed(5)}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">LON</span>
        <span className="tele-value" style={{ fontSize: '0.72rem' }}>{t.longitude.toFixed(5)}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">BATT</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="batt-bar">
            <div className="batt-bar-fill" style={{ width: `${battPct}%`, background: battColor }} />
            <div className="batt-tip" />
          </div>
          <span className={`tele-value ${battClass}`}>{battPct}%</span>
        </div>
      </div>

      <div className="tele-item">
        <span className="tele-label">RSSI</span>
        <span className={`tele-value ${rssiClass}`}>{t.rssi}</span>
        <span className="tele-unit">dBm</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">SAT</span>
        <span className={`tele-value ${t.satellites >= 8 ? 'good' : 'warn'}`}>{t.satellites}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">TIME</span>
        <span className="tele-value">{fmtTime(t.flightTime)}</span>
      </div>

      <div className="tele-item">
        <span className="tele-label">RISK</span>
        <span className={`tele-value ${riskColor}`}>{riskLevel}</span>
      </div>

      {/* RTL Warning if battery < 20% and there's a critical hazard */}
      {battPct < 20 && currentState?.summary?.overall_risk === 'CRITICAL' && (
        <div className="tele-item" style={{ background: 'rgba(239,68,68,0.15)', borderRadius: 4, padding: '2px 10px' }}>
          <span style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700, animation: 'pulse 1s infinite' }}>
            !! RTL ADVISED
          </span>
        </div>
      )}
    </div>
  );
}
