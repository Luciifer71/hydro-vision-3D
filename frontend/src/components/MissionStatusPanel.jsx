import React from 'react';

export default function MissionStatusPanel({ streamRunning, hazards, totalArea, currentState }) {
  let mode = 'STANDBY';
  let modeColor = 'var(--text-faint)';

  if (streamRunning) {
    mode = 'ACTIVE PIPELINE';
    modeColor = 'var(--green)';
  } else if (currentState?.session_id) {
    mode = 'MISSION COMPLETE';
    modeColor = 'var(--cyan)';
  }

  const totalHazards = currentState?.summary?.total_cumulative_hazards || hazards.length;
  const actionText = currentState?.summary?.action || 'Monitor routine conditions.';
  const fps = currentState?.summary?.fps || 0;
  const currentFrame = currentState?.frame_id || 0;
  const totalFrames = currentState?.summary?.total_frames || 0;
  const progress = totalFrames > 0 ? Math.min(100, Math.round((currentFrame / totalFrames) * 100)) : 0;

  const items = [
    { label: 'Pipeline Mode', value: mode, color: modeColor },
    { label: 'Cumulative Hazards', value: totalHazards },
    { label: 'Affected Footprint', value: `${totalArea.toFixed(2)} m²` },
    { label: 'Recommended Action', value: actionText, small: true },
  ];

  return (
    <div className="bf-fieldset">
      <div className="bf-badge-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        MISSION DIAGNOSTICS
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {/* Progress Bar Row */}
        {streamRunning && totalFrames > 0 && (
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Frame {currentFrame} / {totalFrames}</span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>{fps.toFixed(1)} FPS</span>
            </div>
            <div style={{ width: '100%', height: 5, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', transition: 'width 0.2s linear' }} />
            </div>
          </div>
        )}
        
        {items.map(({ label, value, color, small }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '5px 0',
              borderBottom: '1px solid var(--border-subtle)',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {label}
            </span>
            <span
              style={{
                fontFamily: small ? 'inherit' : 'var(--font-mono)',
                fontSize: small ? '0.72rem' : '0.84rem',
                fontWeight: 700,
                color: color || 'var(--amber)',
                textAlign: 'right',
              }}
            >
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
