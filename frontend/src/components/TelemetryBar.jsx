import React from 'react';
import { useStore } from '../store.js';
import { computeSessionRisk } from '../lib/derive.js';

function fmtTime(secs) {
  const m = Math.floor((secs || 0) / 60).toString().padStart(2, '0');
  const s = Math.floor((secs || 0) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function getCardinal(deg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
  return directions[index];
}

export default function TelemetryBar() {
  const { telemetry, currentState, connectionStatus, feedMode, switchToLiveFeed, hazards } = useStore();
  const t = telemetry || {};
  const isConnected = connectionStatus === 'LIVE';
  const isLive = feedMode === 'live' && isConnected && (t.altitude != null || t.satellites != null);

  const { riskLevel } = computeSessionRisk(hazards || [], currentState?.summary || {});
  const riskColor = { LOW: 'good', MODERATE: 'warn', HIGH: 'warn', CRITICAL: 'danger' }[riskLevel] || 'good';

  const rssiVal = t.rssi || -62;
  const rssiClass = rssiVal > -70 ? 'good' : rssiVal > -85 ? 'warn' : 'danger';
  const vSpd = t.verticalSpeed || 0;

  if (!isLive) {
    return (
      <div className="tele-bar" style={{ justifyContent: 'space-between', background: 'rgba(12, 16, 24, 0.96)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ 
            color: 'var(--amber)', 
            fontWeight: 800, 
            fontSize: '0.72rem', 
            letterSpacing: '1px',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />
            OFFLINE REPLAY / ANALYZER ACTIVE
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem' }}>
            Processed video frames are being evaluated for infrastructure hazards
          </span>
        </div>

        <button
          className="btn"
          onClick={switchToLiveFeed}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#061e14',
            fontWeight: 800,
            fontSize: '0.72rem',
            padding: '4px 12px',
            borderRadius: 4,
            boxShadow: '0 0 10px rgba(16, 185, 129, 0.35)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#061e14' }} />
          Switch to Live Telemetry
        </button>
      </div>
    );
  }

  return (
    <div className="tele-bar">
      {!isConnected ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span style={{ color: 'var(--danger)', fontWeight: 800, fontSize: '0.72rem', letterSpacing: '1px' }}>
            TELEMETRY LINK: STANDBY
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.72rem' }}>
            Connect to live hardware stream or upload footage to begin telemetry acquisition
          </span>
        </div>
      ) : (
        <>
          {/* Altitude */}
          <div className="tele-item">
            <span className="tele-label">ALT</span>
            <span className="tele-value good">{t.altitude != null ? t.altitude.toFixed(1) : '—'}</span>
            <span className="tele-unit">m</span>
          </div>

          {/* Ground Speed */}
          <div className="tele-item">
            <span className="tele-label">SPD</span>
            <span className="tele-value">{t.speed != null ? t.speed.toFixed(1) : '—'}</span>
            <span className="tele-unit">m/s</span>
          </div>

          {/* Vertical Climb/Sink Rate */}
          <div className="tele-item">
            <span className="tele-label">V.SPD</span>
            <span className={`tele-value ${vSpd > 0.3 ? 'good' : vSpd < -0.3 ? 'warn' : ''}`}>
              {t.verticalSpeed != null ? `${vSpd >= 0 ? '↑ +' : '↓ '}${vSpd.toFixed(1)}` : '—'}
            </span>
            <span className="tele-unit">m/s</span>
          </div>

          {/* Heading with Compass Cardinal */}
          <div className="tele-item">
            <span className="tele-label">HDG</span>
            <span className="tele-value">{t.heading != null ? `${Math.round(t.heading)}°` : '—'}</span>
            {t.heading != null && (
              <span className="tele-unit" style={{ color: 'var(--amber)', fontWeight: 800 }}>
                {getCardinal(t.heading)}
              </span>
            )}
          </div>

          {/* Pitch & Roll */}
          <div className="tele-item">
            <span className="tele-label">ATT</span>
            <span className="tele-value" style={{ fontSize: '0.8rem' }}>
              {t.pitch != null && t.roll != null ? `P:${t.pitch.toFixed(1)}° R:${t.roll.toFixed(1)}°` : '—'}
            </span>
          </div>

          {/* Latitude */}
          <div className="tele-item">
            <span className="tele-label">LAT</span>
            <span className="tele-value" style={{ fontSize: '0.78rem' }}>
              {t.latitude != null ? t.latitude.toFixed(5) : '—'}
            </span>
          </div>

          {/* Longitude */}
          <div className="tele-item">
            <span className="tele-label">LON</span>
            <span className="tele-value" style={{ fontSize: '0.78rem' }}>
              {t.longitude != null ? t.longitude.toFixed(5) : '—'}
            </span>
          </div>

          {/* Satellites */}
          <div className="tele-item">
            <span className="tele-label">GNSS</span>
            <span className={`tele-value ${(t.satellites || 0) >= 8 ? 'good' : 'warn'}`}>
              {t.satellites != null ? `${t.satellites} 🛰️` : '—'}
            </span>
          </div>

          {/* RSSI Signal */}
          <div className="tele-item">
            <span className="tele-label">RSSI</span>
            <span className={`tele-value ${rssiClass}`}>
              {t.rssi != null ? `${t.rssi}` : '—'}
            </span>
            <span className="tele-unit">{t.rssi != null ? 'dBm' : ''}</span>
          </div>

          {/* Flight Time */}
          <div className="tele-item">
            <span className="tele-label">FLT</span>
            <span className="tele-value" style={{ color: 'var(--text-secondary)' }}>
              {fmtTime(t.flightTime || 0)}
            </span>
          </div>

          {/* Risk Badge */}
          <div className="tele-item" style={{ marginLeft: 'auto' }}>
            <span className="tele-label">RISK</span>
            <span className={`tele-value ${riskColor}`} style={{ fontWeight: 800 }}>
              {riskLevel}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
