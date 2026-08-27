import React from 'react';
import { useStore } from '../store.js';

function OSDTag({ label, value, unit, valClass }) {
  const isDanger = valClass === 'danger';
  return (
    <div className="osd-tag" style={isDanger ? { background: '#cc0000', border: '1px solid #ff4444', color: '#ffffff' } : {}}>
      <span className="label" style={{ color: isDanger ? '#ffffff' : '#888888', fontWeight: isDanger ? 800 : 700 }}>{label}</span>
      <span className={`val ${valClass || ''}`} style={{ color: isDanger ? '#ffffff' : undefined, fontWeight: 900 }}>{value}</span>
      {unit && <span className="tele-unit" style={{ color: isDanger ? '#ffffff' : '#666666' }}>{unit}</span>}
    </div>
  );
}

export default function OSDOverlay({ telemetry, riskLevel, activeHazards, totalArea, riskScore, isCritical, streamRunning, frameId }) {
  const { feedMode, connectionStatus } = useStore();
  const isLiveFeed = feedMode === 'live';
  const isOffline = connectionStatus === 'OFFLINE' || connectionStatus === 'RECONNECTING' || connectionStatus === 'CONNECTING';
  const t = telemetry || {};
  const battPct = Math.round(t.battery || 85);
  const battClass = battPct > 40 ? 'good' : battPct > 20 ? 'warn' : 'danger';
  const rssiVal = t.rssi || -60;
  const rssiClass = rssiVal > -70 ? 'good' : rssiVal > -85 ? 'warn' : 'danger';

  function fmtTime(s) {
    const sec = Number(s) || 0;
    return `${Math.floor(sec / 60).toString().padStart(2, '0')}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
  }

  // Ensure risk score displays properly between 0 and 100 without legacy multipliers
  const displayScore = riskScore !== undefined ? Math.min(100, Math.max(0, Math.round(riskScore))) : 25;

  return (
    <>
      {/* Scan overlay */}
      <div className="scan-overlay" />

      {/* Critical flash */}
      {isCritical && <div className="severity-flash" />}

      {/* REC Badge */}
      {streamRunning && (
        <div className="rec-badge" style={{ top: 12, left: isLiveFeed ? 130 : 185, transform: 'none' }}>
          <div className="rec-dot" />
          {isLiveFeed ? 'LIVE REC' : 'VIDEO ANALYZER'}
        </div>
      )}

      {/* Artificial Horizon — Only in Live Drone Feed when connected */}
      {isLiveFeed && !isOffline && (
        <div className="horizon-box">
          <div className="horizon-line" style={{ transform: `rotate(${((t.roll || 0)) * 0.3}deg)` }} />
        </div>
      )}

      {/* Crosshair — Only show when stream is active and online */}
      {!isOffline && <div className="osd-crosshair" />}

      {/* OSD Data */}
      <div className="osd">
        {/* Top Left — GPS & Flight Telemetry (Only in Live Drone Feed) */}
        <div className="osd-tl">
          {isLiveFeed ? (
            <>
              <OSDTag label="LAT" value={(t.latitude || 22.3072).toFixed(5)} valClass="good" />
              <OSDTag label="LON" value={(t.longitude || 73.1812).toFixed(5)} valClass="good" />
              <OSDTag label="ALT" value={`${(t.altitude || 24.5).toFixed(1)}`} unit="m" />
              <OSDTag label="HDG" value={`${Math.round(t.heading || 245)}°`} />
            </>
          ) : (
            <div className="osd-tag" style={{ background: 'rgba(255, 187, 0, 0.2)', border: '1px solid var(--amber)', padding: '4px 10px' }}>
              <span className="label" style={{ color: 'var(--amber)', fontWeight: 800 }}>MODE</span>
              <span className="val" style={{ color: '#ffffff', fontWeight: 900, marginLeft: 4 }}>RECORDED VIDEO</span>
            </div>
          )}
        </div>

        {/* Top Right — Battery & Signal (Only in Live Drone Feed) */}
        <div className="osd-tr">
          {isLiveFeed && (
            <>
              <OSDTag label="BATT" value={`${battPct}%`} valClass={battClass} />
              <OSDTag label="RSSI" value={`${rssiVal}`} unit="dBm" valClass={rssiClass} />
              <OSDTag label="SAT" value={t.satellites || 12} valClass={(t.satellites || 12) >= 8 ? 'good' : 'warn'} />
            </>
          )}
        </div>

        {/* Top Center — Risk */}
        <div className="osd-tc">
          <div className="osd-tag" style={{
            background: isCritical ? '#cc0000' : 'rgba(0,0,0,0.85)',
            border: isCritical ? '1px solid #ff4444' : '1px solid rgba(255,187,0,0.35)',
            padding: '5px 14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.7)'
          }}>
            <span className="label" style={{ color: '#ffffff', fontWeight: 800, fontSize: '0.72rem', letterSpacing: '1.5px' }}>RISK</span>
            <span className="val" style={{ color: '#ffffff', fontWeight: 900, fontSize: '0.88rem', letterSpacing: '2px', marginLeft: 4 }}>
              {riskLevel || 'LOW'}
            </span>
          </div>
        </div>

        {/* Bottom Left — Speed & Time */}
        <div className="osd-bl">
          {isLiveFeed && (
            <>
              <OSDTag label="SPD" value={`${(t.speed || 0).toFixed(1)}`} unit="m/s" />
              <OSDTag label="V.SPD" value={`${(t.verticalSpeed || 0) >= 0 ? '+' : ''}${(t.verticalSpeed || 0).toFixed(1)}`} unit="m/s" valClass={(t.verticalSpeed || 0) < -1 ? 'danger' : ''} />
            </>
          )}
          <OSDTag label="TIME" value={fmtTime(t.flightTime || 0)} />
        </div>

        {/* Bottom Right — Detections */}
        <div className="osd-br">
          <OSDTag label="HAZARDS" value={activeHazards} valClass={activeHazards > 5 ? 'warn' : 'good'} />
          <OSDTag label="AREA" value={`${(totalArea || 0).toFixed(1)}`} unit="m²" valClass={totalArea > 75 ? 'danger' : totalArea > 25 ? 'warn' : 'good'} />
          {isCritical && (
            <div className="osd-tag" style={{ background: '#cc0000', border: '1px solid #ff4444', animation: 'pulse 1s infinite', padding: '5px 12px' }}>
              <span className="val" style={{ color: '#ffffff', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '1px' }}>! CRITICAL HAZARD</span>
            </div>
          )}
          {isLiveFeed && battPct < 20 && isCritical && (
            <div className="osd-tag" style={{ background: '#cc0000', border: '1px solid #ff4444', padding: '5px 12px' }}>
              <span className="val" style={{ color: '#ffffff', fontWeight: 900, fontSize: '0.75rem', letterSpacing: '1px' }}>RTL ADVISED</span>
            </div>
          )}
        </div>

        {/* Bottom Center — Score & Frame */}
        <div className="osd-bc">
          <div style={{ display: 'flex', gap: 6 }}>
            <OSDTag label="SCORE" value={displayScore} unit="/100" />
            {frameId > 0 && <OSDTag label="FRAME" value={`#${frameId}`} />}
          </div>
        </div>
      </div>
    </>
  );
}