import React, { useState, useEffect } from 'react';

export default function VideoExportCard({ streamRunning }) {
  const [status, setStatus] = useState({ file_ready: false, size_mb: null });

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/record/status');
        const data = await res.json();
        if (alive) setStatus(data);
      } catch { /* backend down */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const ready = status.file_ready && !status.recording;

  return (
    <div className="bf-fieldset">
      <div className="bf-badge-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        MISSION VIDEO RECORDER
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {status.recording
              ? 'Real-time annotated video recording in progress...'
              : status.file_ready
                ? `Artifact Ready (${status.size_mb || '—'} MB)`
                : 'No recording saved yet'}
          </span>

          {status.recording && (
            <span style={{ 
              color: 'var(--danger)', 
              fontSize: '0.65rem', 
              fontWeight: 800,
              display: 'flex', 
              alignItems: 'center', 
              gap: 4,
              fontFamily: 'var(--font-mono)' 
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s infinite' }} />
              REC ACTIVE
            </span>
          )}
        </div>

        <button
          onClick={() => window.open('/api/record/download', '_blank')}
          disabled={!ready}
          className="btn"
          style={{
            width: '100%',
            justifyContent: 'center',
            background: ready ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${ready ? '#34d399' : 'var(--border-subtle)'}`,
            color: ready ? '#061e14' : 'var(--text-faint)',
            padding: '7px 12px',
            fontSize: '0.75rem',
            fontWeight: 800,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: ready ? '0 0 12px rgba(16, 185, 129, 0.4)' : 'none'
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export Annotated MP4
        </button>
      </div>
    </div>
  );
}