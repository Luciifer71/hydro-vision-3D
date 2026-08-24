/**
 * MissionStatusPanel — Displays real-time mission parameters and status.
 */
export default function MissionStatusPanel({ streamRunning, hazards, totalArea, currentState }) {
  const mode = streamRunning ? 'MAPPING' : 'STANDBY';
  const modeColor = streamRunning ? '#10b981' : '#666';
  const totalHazards = currentState?.summary?.total_cumulative_hazards || hazards.length;
  const actionText = currentState?.summary?.action || 'Monitor routine conditions.';

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
