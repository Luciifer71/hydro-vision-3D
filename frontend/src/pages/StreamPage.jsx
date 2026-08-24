import { useStore } from '../store.js';

const ENDPOINTS = [
  { method: 'GET', path: '/api/health', desc: 'System health & stream status' },
  { method: 'GET', path: '/api/hazards', desc: 'Current hazard detections' },
  { method: 'GET', path: '/api/hazards/geojson', desc: 'Hazards as GeoJSON FeatureCollection' },
  { method: 'GET', path: '/api/stream/start', desc: 'Start video processing pipeline' },
  { method: 'GET', path: '/api/stream/stop', desc: 'Stop stream and reset state' },
  { method: 'GET', path: '/api/config', desc: 'Camera intrinsics & system config' },
  { method: 'POST', path: '/api/hazards/status', desc: 'Update hazard status (OPEN/IN_PROGRESS/RESOLVED)' },
  { method: 'WS', path: '/ws/live-stream', desc: 'Real-time WebSocket hazard stream' },
];

export default function StreamPage() {
  const {
    connectionStatus, streamRunning, currentState, telemetry,
    connect, disconnect, startStream, stopStream, resetStream,
    videoPath, setVideoPath, logs, feedMode, setFeedMode, switchToLiveFeed
  } = useStore();

  const fps = currentState ? Math.round(Math.random() * 5 + 10) : 0;
  const isLive = feedMode === 'live';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Feed Mode & Control Panel</span>
          <span className={`card-badge ${isLive ? 'badge-live' : ''}`} style={!isLive ? { background: 'rgba(255,187,0,0.2)', color: 'var(--amber)', border: '1px solid var(--amber)' } : {}}>
            {isLive ? 'LIVE FEED ACTIVE' : 'RECORDED VIDEO MODE'}
          </span>
        </div>
        <div className="card-body">
          {/* Feed Mode Switcher */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, padding: '10px 14px', background: 'rgba(0,0,0,0.3)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              className={`btn ${isLive ? 'btn-primary' : 'btn-outline'}`}
              onClick={switchToLiveFeed}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: isLive ? 'linear-gradient(135deg, #10b981, #059669)' : undefined,
                color: isLive ? '#1a1a1a' : '#10b981',
                borderColor: '#10b981'
              }}
            >
              <span>🔴</span> Live Drone Feed
            </button>
            <button
              className={`btn ${!isLive ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFeedMode('video')}
              style={{
                flex: 1,
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                background: !isLive ? 'var(--amber)' : undefined,
                color: !isLive ? '#1a1a1a' : 'var(--amber)',
                borderColor: 'var(--amber)'
              }}
            >
              <span>🎬</span> Recorded Video Analysis
            </button>
          </div>

          <div className="status-grid">
            {[
              { label: 'Active Mode', value: isLive ? 'LIVE DRONE FEED' : 'RECORDED VIDEO' },
              { label: 'Connection', value: connectionStatus },
              { label: 'Stream Status', value: streamRunning ? 'STREAMING' : 'IDLE' },
              { label: 'Current Frame', value: `#${currentState?.frame_id ?? 0}` },
            ].map(({ label, value }) => (
              <div className="status-item" key={label}>
                <div className="status-item-label">{label}</div>
                <div className="status-item-value">{value}</div>
              </div>
            ))}
          </div>
          <div className="btn-group" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={startStream}>Start Stream</button>
            <button className="btn btn-danger" onClick={stopStream}>Stop Stream</button>
            <button className="btn btn-outline" onClick={resetStream}>Reset</button>
            {connectionStatus === 'DISCONNECTED' || connectionStatus === 'ERROR'
              ? <button className="btn btn-outline" onClick={connect}>Connect WS</button>
              : <button className="btn btn-outline" onClick={disconnect}>Disconnect WS</button>
            }
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Video Source</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Video File Path / URL</label>
            <input className="form-input" type="text" value={videoPath || ''} onChange={e => setVideoPath(e.target.value)} placeholder="data/raw_videos/sample_drone.mp4" />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Path is relative to backend directory or server URL. Setting a custom video file automatically switches to Recorded Video Analysis mode.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">API Endpoints</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
            <tbody>
              {ENDPOINTS.map(({ method, path, desc }) => (
                <tr key={path}>
                  <td><span className={`method-badge ${method}`}>{method}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{path}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Connection Log</span></div>
        <div className="card-body">
          <div className="conn-log">
            {logs.map((log, i) => (
              <div key={i} style={{ color: i === 0 ? 'var(--cyan)' : 'var(--text-muted)' }}>{log}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
