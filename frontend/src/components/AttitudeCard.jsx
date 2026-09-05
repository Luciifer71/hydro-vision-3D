import AttitudeIndicator from './AttitudeIndicator.jsx';
import { useStore } from '../store.js';

/**
 * AttitudeCard — Visual horizon card displaying pitch and roll telemetry.
 */
export default function AttitudeCard({ pitch = 0, roll = 0 }) {
  const { connectionStatus } = useStore();
  const isDroneLive = connectionStatus === 'LIVE';

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Attitude / Horizon</span>
        <span className={`card-badge ${isDroneLive ? 'badge-live' : ''}`} style={!isDroneLive ? { background: 'rgba(255,187,0,0.2)', color: 'var(--amber)', border: '1px solid var(--amber)' } : {}}>
          {isDroneLive ? 'LIVE' : 'VIDEO MODE'}
        </span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <AttitudeIndicator width={130} height={130} pitch={isDroneLive ? pitch : 0} roll={isDroneLive ? roll : 0} />
        {isDroneLive && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', fontSize: '0.8rem' }}>
            <div style={{ background: '#333', borderRadius: 4, padding: '6px 10px', borderLeft: '3px solid #ffbb00' }}>
              <div style={{ color: '#888', fontSize: '0.65rem', marginBottom: 2 }}>PITCH</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: '#ffbb00', fontWeight: 'bold' }}>
                {pitch.toFixed(1)}°
              </div>
            </div>
            <div style={{ background: '#333', borderRadius: 4, padding: '6px 10px', borderLeft: '3px solid #ffbb00' }}>
              <div style={{ color: '#888', fontSize: '0.65rem', marginBottom: 2 }}>ROLL</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: '#ffbb00', fontWeight: 'bold' }}>
                {roll.toFixed(1)}°
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
