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
      } catch { /* backend down; leave last known state */ }
    };
    poll();
    const t = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(t); };
  }, []);

const ready = status.file_ready && !status.recording;

  return (
    <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kpi-label">Annotated Video Export</span>
        {status.recording && (
          <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 700,
                         display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%',
                           background: '#ef4444', animation: 'pulse 1s infinite' }} />
            RECORDING
          </span>
        )}
      </div>

      <div style={{ fontSize: '0.7rem', color: '#888', lineHeight: 1.5 }}>
        {status.recording
          ? 'Recording automatically — download available when processing finishes.'
          : status.file_ready
            ? `Ready${status.size_mb ? ` · ${status.size_mb} MB` : ''}`
            : 'No processed video yet. Upload a video to begin.'}
      </div>

      <button
        onClick={() => window.open('/api/record/download', '_blank')}
        disabled={!ready}
        className="btn"
        style={{
          background: ready ? 'rgba(16,185,129,0.15)' : 'transparent',
          border: `1px solid ${ready ? '#10b981' : '#444'}`,
          color: ready ? '#10b981' : '#666',
          padding: 8, fontSize: '0.78rem', fontWeight: 600,
          cursor: ready ? 'pointer' : 'not-allowed',
        }}
      >
        Download Annotated MP4
      </button>
    </div>
  );
}