import React from 'react';
import AttitudeIndicator from './AttitudeIndicator.jsx';
import { useStore } from '../store.js';

export default function AttitudeCard({ pitch = 0, roll = 0 }) {
  const { connectionStatus } = useStore();
  const isDroneLive = connectionStatus === 'LIVE';

  return (
    <div className="bf-fieldset">
      <div className="bf-badge-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18" />
        </svg>
        ATTITUDE / HORIZON
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <AttitudeIndicator width={130} height={130} pitch={isDroneLive ? pitch : 0} roll={isDroneLive ? roll : 0} />
        
        {isDroneLive ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', fontSize: '0.8rem' }}>
            <div style={{ 
              background: 'rgba(10, 14, 22, 0.8)', 
              borderRadius: 4, 
              padding: '6px 10px', 
              borderLeft: '3px solid var(--amber)',
              borderTop: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div style={{ color: 'var(--text-faint)', fontSize: '0.62rem', fontWeight: 800 }}>PITCH</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 800 }}>
                {pitch.toFixed(1)}°
              </div>
            </div>

            <div style={{ 
              background: 'rgba(10, 14, 22, 0.8)', 
              borderRadius: 4, 
              padding: '6px 10px', 
              borderLeft: '3px solid var(--amber)',
              borderTop: '1px solid var(--border-subtle)',
              borderRight: '1px solid var(--border-subtle)',
              borderBottom: '1px solid var(--border-subtle)'
            }}>
              <div style={{ color: 'var(--text-faint)', fontSize: '0.62rem', fontWeight: 800 }}>ROLL</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 800 }}>
                {roll.toFixed(1)}°
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', textAlign: 'center' }}>
            Simulated attitude offline
          </div>
        )}
      </div>
    </div>
  );
}
