/**
 * MissionStatusPanel — Displays real-time mission parameters and status.
 */
export default function MissionStatusPanel({ streamRunning, hazards, totalArea, currentState }) {
  let mode = 'STANDBY';
  let modeColor = '#666';

  if (streamRunning) {
    mode = 'LIVE PROCESSING';
    modeColor = '#10b981';
  } else if (currentState?.session_id) {
    mode = 'MISSION COMPLETE';
    modeColor = '#3b82f6';
  }

  const totalHazards = currentState?.summary?.total_cumulative_hazards || hazards.length;
  const actionText = currentState?.summary?.action || 'Monitor routine conditions.';
  const fps = currentState?.summary?.fps || 0;
  const currentFrame = currentState?.frame_id || 0;
  const totalFrames = currentState?.summary?.total_frames || 0;
  const progress = totalFrames > 0 ? Math.min(100, Math.round((currentFrame / totalFrames) * 100)) : 0;

  const items = [
    { label: 'Mode', value: mode, color: modeColor },
    { label: 'Total Hazards Found', value: totalHazards },
    { label: 'Affected Area', value: `${totalArea.toFixed(2)} m²` },
    { label: 'Action', value: actionText, small: true },
  ];

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mission Status</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Progress Bar Row */}
        {streamRunning && totalFrames > 0 && (
          <div style={{ marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>
              <span>Frame {currentFrame} / {totalFrames}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{fps.toFixed(1)} FPS</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#10b981', transition: 'width 0.2s linear' }}></div>
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
              padding: '6px 0',
              borderBottom: '1px solid #333',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '0.8rem', color: '#aaa', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
            <span
              style={{
                fontFamily: small ? 'inherit' : 'var(--font-mono)',
                fontSize: small ? '0.75rem' : '0.88rem',
                fontWeight: 700,
                color: color || '#ffbb00',
                textAlign: 'right',
                wordBreak: 'break-word',
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
