import React from 'react';
import { useStore } from '../store.js';

function OSDTag({ label, value, unit, valClass }) {
  const isDanger = valClass === 'danger';
  const isWarn = valClass === 'warn';

  return (
    <div 
      className="osd-tag" 
      style={
        isDanger ? { background: 'rgba(239, 68, 68, 0.25)', borderColor: 'rgba(239, 68, 68, 0.6)', color: '#ffffff' } :
        isWarn ? { background: 'rgba(245, 158, 11, 0.2)', borderColor: 'rgba(245, 158, 11, 0.5)' } :
        {}
      }
    >
      <span className="label">{label}</span>
      <span className={`val ${valClass || ''}`}>{value}</span>
      {unit && <span className="tele-unit">{unit}</span>}
    </div>
  );
}

export default function OSDOverlay({ telemetry, riskLevel, activeHazards, totalArea, riskScore, isCritical, streamRunning, frameId }) {
  const { connectionStatus } = useStore();
  const isConnected = connectionStatus === 'LIVE';
  const t = telemetry || {};
  
  const battPct = Math.round(t.battery || 85);
  const battClass = battPct > 40 ? 'good' : battPct > 20 ? 'warn' : 'danger';
  const rssiVal = t.rssi || -60;
  const rssiClass = rssiVal > -70 ? 'good' : rssiVal > -85 ? 'warn' : 'danger';

  const displayScore = riskScore !== undefined ? Math.min(100, Math.max(0, Math.round(riskScore))) : 25;

  return (
    <>
      {/* Tactical Corner HUD Brackets */}
      <div className="hud-bracket hud-bracket-tl" />
      <div className="hud-bracket hud-bracket-tr" />
      <div className="hud-bracket hud-bracket-bl" />
      <div className="hud-bracket hud-bracket-br" />

      {/* Rotating Radar Sweep Beam */}
      <div className="radar-sweep-beam" />

      {/* Critical Threat Flash */}
      {isCritical && <div className="severity-flash" />}

      {/* Avionics Artificial Horizon Pitch Line */}
      {isConnected && (
        <div className="horizon-box">
          <div className="horizon-line" style={{ transform: `rotate(${((t.roll || 0)) * 0.35}deg)` }} />
        </div>
      )}

      {/* Tactical Crosshair with Concentric Range Rings */}
      <div className="osd-crosshair" />

      {/* Heads-Up Tactical OSD Overlay Data */}
      <div className="osd">
        {/* Top Left: Mode / Link & Video Status */}
        <div className="osd-tl">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {isConnected ? (
              <div className="osd-tag" style={{ borderColor: 'var(--accent-cyan)', background: 'rgba(0, 229, 255, 0.12)' }}>
                <span className="label" style={{ color: 'var(--accent-cyan)' }}>LINK</span>
                <span className="val" style={{ color: '#fff', marginLeft: 4 }}>DRONE ONLINE</span>
              </div>
            ) : (
              <div className="osd-tag" style={{ borderColor: 'var(--amber)', background: 'rgba(255, 184, 0, 0.15)' }}>
                <span className="label" style={{ color: 'var(--amber)' }}>MODE</span>
                <span className="val" style={{ color: '#fff', marginLeft: 4 }}>OFFLINE ANALYSIS</span>
              </div>
            )}
            {streamRunning && (
              <div className="rec-badge">
                <div className="rec-dot" />
                <span>{isConnected ? 'LIVE MISSION REC' : 'VIDEO INGESTION'}</span>
              </div>
            )}
          </div>
          {isConnected && (
            <>
              <OSDTag label="LAT" value={(t.latitude || 22.3072).toFixed(5)} valClass="good" />
              <OSDTag label="LON" value={(t.longitude || 73.1812).toFixed(5)} valClass="good" />
              <OSDTag label="ALT" value={`${(t.altitude || 24.5).toFixed(1)}`} unit="m" />
              <OSDTag label="HDG" value={`${Math.round(t.heading || 245)}°`} />
            </>
          )}
        </div>

        {/* Top Right: System Health & Link Quality */}
        <div className="osd-tr">
          {isConnected && (
            <>
              <OSDTag label="BATT" value={`${battPct}%`} valClass={battClass} />
              <OSDTag label="RSSI" value={`${rssiVal}`} unit="dBm" valClass={rssiClass} />
              <OSDTag label="GNSS" value={`${t.satellites || 12} 🛰️`} valClass={(t.satellites || 12) >= 8 ? 'good' : 'warn'} />
            </>
          )}
        </div>

        {/* Top Center: Severity Threat Level */}
        <div className="osd-tc">
          <div 
            className="osd-tag" 
            style={{
              background: isCritical ? 'rgba(239, 68, 68, 0.9)' : 'rgba(10, 13, 19, 0.92)',
              border: isCritical ? '1px solid #ef4444' : '1px solid rgba(255, 184, 0, 0.4)',
              padding: '5px 16px',
              boxShadow: isCritical ? '0 0 16px rgba(239, 68, 68, 0.6)' : '0 4px 16px rgba(0,0,0,0.6)'
            }}
          >
            <span className="label" style={{ color: isCritical ? '#fff' : 'var(--text-faint)', letterSpacing: '1.5px' }}>
              RISK LEVEL
            </span>
            <span 
              className="val" 
              style={{ 
                color: isCritical ? '#ffffff' : 'var(--amber)', 
                fontWeight: 900, 
                fontSize: '0.92rem', 
                letterSpacing: '2px', 
                marginLeft: 4 
              }}
            >
              {riskLevel || 'LOW'}
            </span>
          </div>
        </div>

        {/* Bottom Left: Spatial Hazard Telemetry */}
        <div className="osd-bl">
          <OSDTag 
            label="HAZARDS" 
            value={activeHazards || 0} 
            valClass={activeHazards > 0 ? (isCritical ? 'danger' : 'warn') : 'good'} 
          />
          <OSDTag 
            label="FOOTPRINT" 
            value={totalArea !== undefined ? `${totalArea.toFixed(1)}` : '0.0'} 
            unit="m²" 
          />
        </div>

        {/* Bottom Right: Frame Telemetry & Risk Index */}
        <div className="osd-br">
          <OSDTag 
            label="RISK SCORE" 
            value={displayScore} 
            unit="/100" 
            valClass={displayScore >= 75 ? 'danger' : displayScore >= 40 ? 'warn' : 'good'} 
          />
          <OSDTag label="FRAME" value={`#${frameId || 0}`} />
        </div>
      </div>
    </>
  );
}