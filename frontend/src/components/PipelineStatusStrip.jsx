import React from 'react';
import { useStore } from '../store.js';

const STAGES = [
  { key: 'ingest', label: 'INGEST' },
  { key: 'perception', label: 'PERCEPTION' },
  { key: 'geo', label: 'GEO-MAPPING' },
  { key: 'sink', label: 'SINK' },
  { key: 'ws', label: 'WEBSOCKET' }
];

export default function PipelineStatusStrip() {
  const { stage_status = {}, connectionStatus } = useStore();

  const isOffline = connectionStatus === 'OFFLINE' || connectionStatus === 'RECONNECTING' || connectionStatus === 'CONNECTING';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '4px 16px',
      background: '#0a0a0c',
      borderTop: '1px solid #1f1f23',
      fontSize: '0.65rem',
      fontFamily: 'var(--font-mono)',
      color: '#888'
    }}>
      <div style={{ display: 'flex', gap: 16 }}>
        <span style={{ fontWeight: 800, color: '#aaa', letterSpacing: '1px' }}>PIPELINE HEALTH</span>
        {STAGES.map((stage, idx) => {
          const status = isOffline ? 'offline' : (stage_status[stage.key] || 'ok');
          
          let color = '#333';
          if (status === 'ok') color = '#10b981'; // green
          else if (status === 'warn') color = '#f59e0b'; // yellow
          else if (status === 'error') color = '#ef4444'; // red
          else if (status === 'offline') color = '#444';
          
          return (
            <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {idx > 0 && <span style={{ color: '#333' }}>→</span>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: color,
                  boxShadow: status === 'ok' ? '0 0 5px rgba(16, 185, 129, 0.4)' : 'none'
                }} />
                <span style={{ color: status === 'offline' ? '#666' : '#eee', fontWeight: 600 }}>{stage.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div>
        <span>HV3D CORE v1.4.0-stable</span>
      </div>
    </div>
  );
}
