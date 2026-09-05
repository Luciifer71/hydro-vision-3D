import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store.js';

const PAGE_TITLES = {
  dashboard: 'Setup',
  map: 'GPS / Map',
  detections: 'Detections',
  alerts: 'Alerts',
  risk: 'Risk Engine',
  volumetric: 'Volumetrics',
  depth: 'Depth Analysis',
  stream: 'Stream Control',
  settings: 'Configuration',
};

const SENSOR_INFO = {
  Gyro: 'Gyroscope Sensor — Measures rotational rates (roll, pitch, yaw) for flight stabilization',
  Accel: 'Accelerometer Sensor — Measures linear acceleration and tilt angles',
  Mag: 'Magnetometer / Compass — Measures magnetic direction for heading orientation',
  Baro: 'Barometer Sensor — Measures atmospheric pressure for altitude hold',
  GPS: 'Global Positioning System — Provides 3D satellite positioning, speed & coordinates',
  Sonar: 'Ultrasonic / LiDAR Sensor — Measures low-altitude ground distance for precise hovering',
};

function SensorIcon({ label, active }) {
  const desc = SENSOR_INFO[label] || label;
  const statusText = active ? 'ONLINE / HEALTHY' : 'OFFLINE / UNCONNECTED';
  return (
    <div
      title={`${label.toUpperCase()}: ${desc} [${statusText}]`}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        opacity: active ? 1 : 0.3, cursor: 'help',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <circle cx="9" cy="9" r="7" stroke={active ? '#10b981' : '#555'} strokeWidth="1.5" fill="none" />
        <circle cx="9" cy="9" r="2.5" fill={active ? '#10b981' : '#555'} />
      </svg>
      <span style={{ fontSize: '0.5rem', color: active ? '#10b981' : '#555', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

export default function Header() {
  const { 
    currentPage, viewMode, setViewMode, connectionStatus, currentState, 
    telemetry, connect, disconnect, uploadVideo, feedMode, switchToLiveFeed 
  } = useStore();
  
  const [time, setTime] = useState(new Date());
  const [isProcessing, setIsProcessing] = useState(false); // Failsafe lock
  const fileInputRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const hazards = useStore(state => state.hazards) || [];
  const alertCount = hazards.filter(h => {
    const s = (h.severity || 'LOW').toUpperCase();
    return s === 'CRITICAL' || s === 'HIGH' || s === 'MODERATE';
  }).length || currentState?.summary?.alert_count || 0;
  
  const isDashboard = currentPage === 'dashboard';
  const isLive = feedMode === 'live';
  const battPct = Math.round(telemetry?.battery || 0);
  const battColor = battPct > 40 ? '#10b981' : battPct > 20 ? '#ffbb00' : '#cc0000';

  // --- HARDWARE CONTROL API HANDLERS ---

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 1. Push file to FastAPI backend
      const response = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log('[SYSTEM] Video uploaded and AI Pipeline initialized.');
        // 2. Update frontend store
        uploadVideo(file);
        // 3. Force connect state since the backend automatically starts the stream on upload
        connect(); 
      } else {
        console.error('[ERROR] Backend rejected the video file.');
      }
    } catch (error) {
      console.error('[NETWORK ERROR] Failed to upload video:', error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = ''; // Reset input
    }
  };

  const handleConnectStream = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/stream/start', { method: 'POST' });
      if (response.ok) {
        console.log('[SYSTEM] Hardware stream activated.');
        connect(); // Update UI
      }
    } catch (error) {
      console.error('[NETWORK ERROR] Failed to start stream:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDisconnectStream = async () => {
    setIsProcessing(true);
    try {
      const response = await fetch('/api/stream/stop', { method: 'POST' });
      if (response.ok) {
        console.log('[SYSTEM] Hardware stream halted. Entering standby.');
        disconnect(); // Update UI
      }
    } catch (error) {
      console.error('[NETWORK ERROR] Failed to stop stream:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#ffbb00" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffbb00', letterSpacing: 1 }}>HYDRO-VISION</div>
            <div style={{ fontSize: '0.55rem', color: '#666', letterSpacing: 1 }}>v3.0.0 · 3D GCS</div>
          </div>
        </div>

        {/* Schema Version Warning */}
        {currentState?.context?.schema_version && currentState.context.schema_version !== '1.0' && (
          <div style={{ marginLeft: 8, padding: '4px 8px', background: '#cc0000', color: '#fff', fontSize: '0.65rem', fontWeight: 700, borderRadius: 4 }}>
            ⚠️ SCHEMA {currentState.context.schema_version} MISMATCH (EXPECTED 1.0)
          </div>
        )}

        {/* Battery indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px', borderLeft: '1px solid #3a3a3a' }}>
          <div style={{ width: 22, height: 10, border: '1px solid #555', borderRadius: 2, overflow: 'hidden', position: 'relative' }}>
            <div style={{ width: `${battPct}%`, height: '100%', background: battColor, borderRadius: 1 }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: battColor }}>{battPct}%</span>
        </div>

        {/* Sensor status icons */}
        <div style={{ display: 'flex', gap: 10, padding: '0 8px', borderLeft: '1px solid #3a3a3a' }}>
          <SensorIcon label="Gyro" active={connectionStatus === 'LIVE'} />
          <SensorIcon label="Accel" active={connectionStatus === 'LIVE'} />
          <SensorIcon label="Mag" active={connectionStatus === 'LIVE'} />
          <SensorIcon label="Baro" active={connectionStatus === 'LIVE'} />
          <SensorIcon label="GPS" active={telemetry?.satellites >= 4 && isLive} />
          <SensorIcon label="Sonar" active={false} />
        </div>

        {isDashboard && (
          <div className="view-switcher" style={{ marginLeft: 8 }}>
            <button className={`view-btn ${viewMode === 'fly' ? 'active' : ''}`} onClick={() => setViewMode('fly')}>
              FLY
            </button>
            <button className={`view-btn ${viewMode === 'analyze' ? 'active' : ''}`} onClick={() => setViewMode('analyze')}>
              ANALYZE
            </button>
          </div>
        )}
      </div>

      <div className="header-right">
        <div className="header-time">
          {time.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
          &nbsp;&nbsp;
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </div>

        {currentPage !== 'municipal' && (
          <>
            {/* Feed Mode Controls */}
            {!isLive ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', 
                  borderRadius: 4, background: 'rgba(255, 187, 0, 0.12)', border: '1px solid rgba(255, 187, 0, 0.3)', 
                  color: '#ffbb00', fontSize: '0.68rem', fontWeight: 800
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffbb00', display: 'inline-block' }} />
                  VIDEO PROCESSING
                </div>
                <button
                  className="btn"
                  onClick={switchToLiveFeed}
                  title="Return to real-time live drone flight feed and restore telemetry"
                  style={{
                    background: 'transparent', color: '#10b981',
                    fontWeight: 800, padding: '4px 12px', fontSize: '0.72rem', borderRadius: 4,
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: '1px solid #10b981',
                  }}
                >
                  <span>●</span>
                  Switch to Live Feed
                </button>
              </div>
            ) : (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', 
                borderRadius: 4, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', 
                color: '#10b981', fontSize: '0.68rem', fontWeight: 800
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                LIVE DRONE FEED
              </div>
            )}

            <div className={`conn-badge ${connectionStatus.toLowerCase()}`}>
              {connectionStatus === 'LIVE' ? '● LIVE' : connectionStatus === 'CONNECTING' ? '◌ CONNECTING' : connectionStatus === 'RECONNECTING' ? '↻ RECONNECTING' : '○ OFFLINE'}
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="video/mp4"
              style={{ display: 'none' }}
              onChange={handleVideoUpload}
            />

            {/* Upload Video Button */}
            <button
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              title="Upload a pre-recorded drone flight video for AI analysis"
              style={{
                background: 'rgba(255,187,0,0.12)', border: '1px solid var(--amber)', color: 'var(--amber)',
                padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: 4, cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 5, opacity: isProcessing ? 0.5 : 1
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {isProcessing ? 'UPLOADING...' : 'Upload Video'}
            </button>

            {connectionStatus === 'LIVE' ? (
              <button 
                className="btn" 
                onClick={handleDisconnectStream}
                disabled={isProcessing}
                style={{ background: '#cc0000', color: '#fff', padding: '4px 12px', fontSize: '0.7rem', borderRadius: 4, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.5 : 1 }}
              >
                Disconnect
              </button>
            ) : (
              <button 
                className="btn" 
                onClick={handleConnectStream}
                disabled={isProcessing}
                style={{ background: '#10b981', color: '#1a1a1a', padding: '4px 12px', fontSize: '0.7rem', borderRadius: 4, cursor: isProcessing ? 'not-allowed' : 'pointer', opacity: isProcessing ? 0.5 : 1 }}
              >
                Connect
              </button>
            )}
          </>
        )}
      </div>
    </header>
  );
}