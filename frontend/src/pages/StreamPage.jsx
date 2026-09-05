import React from 'react';
import { useStore } from '../store.js';

const ENDPOINTS = [
  { method: 'GET', path: '/api/health', desc: 'System health & stream telemetry status' },
  { method: 'GET', path: '/api/hazards', desc: 'Active consolidated hazard registry' },
  { method: 'GET', path: '/api/hazards/geojson', desc: 'WGS-84 Hazards as GeoJSON FeatureCollection' },
  { method: 'GET', path: '/api/stream/start', desc: 'Initialize video perception pipeline' },
  { method: 'GET', path: '/api/stream/stop', desc: 'Halt stream and isolate current mission' },
  { method: 'GET', path: '/api/config', desc: 'Camera sensor intrinsics & GSD parameters' },
  { method: 'POST', path: '/api/hazards/status', desc: 'Update hazard state (OPEN/IN_PROGRESS/RESOLVED)' },
  { method: 'WS', path: '/ws/live-stream', desc: 'Dual perception WebSocket binary telemetry' },
];

export default function StreamPage() {
  const {
    connectionStatus, streamRunning, currentState,
    connect, disconnect, startStream, stopStream, resetStream,
    videoPath, setVideoPath, logs, feedMode, setFeedMode, switchToLiveFeed
  } = useStore();

  const fps = currentState?.summary?.fps || 0;
  const isLive = feedMode === 'live';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Feed Mode & Control Panel */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          FEED CONTROL & HARDWARE LINK
        </div>

        <div style={{ marginTop: 8 }}>
          {/* Feed Mode Switcher */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, padding: '8px 12px', background: 'rgba(10,14,22,0.85)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <button
              className={`btn ${isLive ? 'btn-primary' : 'btn-outline'}`}
              onClick={switchToLiveFeed}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontSize: '0.8rem',
                justifyContent: 'center',
                background: isLive ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
                color: isLive ? '#061e14' : 'var(--green)',
                borderColor: '#10b981'
              }}
            >
              <span>●</span> Live Drone Feed
            </button>
            <button
              className={`btn ${!isLive ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFeedMode('video')}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontSize: '0.8rem',
                justifyContent: 'center',
                background: !isLive ? 'linear-gradient(135deg, var(--amber), #e5a800)' : undefined,
                color: !isLive ? '#0b0e14' : 'var(--amber)',
                borderColor: 'var(--amber)'
              }}
            >
              Recorded Video Analysis
            </button>
          </div>

          <div className="status-grid">
            {[
              { label: 'Active Pipeline Mode', value: isLive ? 'LIVE DRONE FEED' : 'RECORDED FOOTAGE' },
              { label: 'WebSocket Link', value: connectionStatus },
              { label: 'Stream Ingestion', value: streamRunning ? 'ACTIVE' : 'IDLE' },
              { label: 'Ingested Frame', value: `#${currentState?.frame_id ?? 0}` },
              { label: 'Inference Throughput', value: `${fps.toFixed(1)} FPS` },
            ].map(({ label, value }) => (
              <div className="status-item" key={label}>
                <div className="status-item-label">{label}</div>
                <div className="status-item-value">{value}</div>
              </div>
            ))}
          </div>

          <div className="btn-group" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={startStream}>
              ▶ Start Ingestion Stream
            </button>
            <button className="btn btn-danger" onClick={stopStream}>
              ■ Stop Stream
            </button>
            <button className="btn btn-outline" onClick={resetStream}>
              ↻ Reset Pipeline
            </button>
            {connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR'
              ? <button className="btn btn-outline" style={{ borderColor: 'var(--green)', color: 'var(--green)' }} onClick={connect}>Connect WebSocket</button>
              : <button className="btn btn-outline" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={disconnect}>Disconnect WebSocket</button>
            }
          </div>
        </div>
      </div>

      {/* Video Source Configuration */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">INSPECTION FOOTAGE SOURCE</div>
        <div style={{ marginTop: 8 }}>
          <div className="form-group">
            <label className="form-label">Video File Path or Remote Stream URL</label>
            <input 
              className="form-input" 
              type="text" 
              value={videoPath || ''} 
              onChange={e => setVideoPath(e.target.value)} 
              placeholder="data/raw_videos/master_video.mp4" 
            />
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Path is relative to backend storage. Changing this auto-switches feed mode to Recorded Video Analysis.
          </p>
        </div>
      </div>

      {/* API Endpoints */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">BACKEND REST & WS SERVICES</div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Route</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map(({ method, path, desc }) => (
                <tr key={path}>
                  <td><span className={`method-badge ${method}`}>{method}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--amber)' }}>{path}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Real-time Connection Log */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">SYSTEM EVENT TELEMETRY LOG</div>
        <div className="conn-log" style={{ marginTop: 8 }}>
          {logs.map((log, i) => (
            <div key={i} style={{ color: i === 0 ? 'var(--green)' : 'var(--text-muted)' }}>
              <span className="log-time">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span> {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
