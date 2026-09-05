import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store.js';

const SENSOR_INFO = {
  Gyro: '3-Axis Gyroscope — Angular velocity & stability tracking',
  Accel: '3-Axis Accelerometer — Dynamic G-force & tilt measurement',
  Mag: 'Magnetometer Compass — Geomagnetic absolute heading',
  Baro: 'Barometric Altimeter — Atmospheric pressure MSL altitude',
  GPS: 'WGS-84 GNSS Receiver — Multi-constellation 3D fix',
  Sonar: 'Ultrasonic / LiDAR Rangefinder — AGL terrain following',
};

function SensorAnnunciator({ label, active }) {
  const desc = SENSOR_INFO[label] || label;
  const statusText = active ? 'ONLINE // CALIBRATED' : 'STANDBY // OFFLINE';
  
  return (
    <div
      title={`${label.toUpperCase()}: ${desc}\nStatus: ${statusText}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 7px',
        borderRadius: 4,
        background: active ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.02)',
        border: `1px solid ${active ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)'}`,
        cursor: 'help',
        transition: 'all 0.16s ease'
      }}
    >
      <span 
        style={{ 
          width: 5, 
          height: 5, 
          borderRadius: '50%', 
          background: active ? '#10b981' : '#475569',
          boxShadow: active ? '0 0 6px #10b981' : 'none'
        }} 
      />
      <span 
        style={{ 
          fontSize: '0.62rem', 
          fontFamily: 'var(--font-mono)',
          fontWeight: 800, 
          letterSpacing: 0.8, 
          color: active ? '#34d399' : '#64748b' 
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function Header() {
  const { 
    currentPage, viewMode, setViewMode, connectionStatus, 
    telemetry, connect, uploadVideo, feedMode, switchToLiveFeed 
  } = useStore();
  
  const [time, setTime] = useState(new Date());
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const isDashboard = currentPage === 'dashboard';
  const isLive = feedMode === 'live';
  const isConnected = connectionStatus === 'LIVE';

  const battPct = Math.round(telemetry?.battery || 85);
  const battVoltage = (13.6 + (battPct / 100) * 3.2).toFixed(1);
  const battColor = battPct > 40 ? '#10b981' : battPct > 20 ? '#f59e0b' : '#ef4444';

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload-video', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        uploadVideo(file);
        connect(); 
      } else {
        console.error('[ERROR] Backend rejected video file.');
      }
    } catch (error) {
      console.error('[NETWORK ERROR] Video upload failed:', error);
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        {/* Betaflight-Style Tactical Brand */}
        <div className="header-brand">
          <div className="header-brand-logo">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <polygon points="12 2 15 8 22 9 17 14 18 21 12 17 6 21 7 14 2 9 9 8 12 2" fill="none" stroke="#ffb800" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="12" cy="12" r="3" fill="#ffb800" />
            </svg>
          </div>
          <div>
            <div className="header-brand-title">
              HYDRO-VISION <span style={{ color: '#fff', fontSize: '0.72rem', opacity: 0.8 }}>// 3D</span>
            </div>
            <div className="header-brand-subtitle">
              TACTICAL GCS · ELCIA HACKATHON 2026
            </div>
          </div>
        </div>

        {/* Fly / Analyze Segmented View Switcher */}
        {isDashboard && (
          <div className="view-switcher" style={{ marginLeft: 10 }}>
            <button 
              className={`view-btn ${viewMode === 'fly' ? 'active' : ''}`} 
              onClick={() => setViewMode('fly')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18" />
                <path d="M3 12h18" />
              </svg>
              FLY HUD
            </button>
            <button 
              className={`view-btn ${viewMode === 'analyze' ? 'active' : ''}`} 
              onClick={() => setViewMode('analyze')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              ANALYZE
            </button>
          </div>
        )}

        {/* Avionics Annunciator Sensor Bank */}
        <div style={{ display: 'flex', gap: 6, paddingLeft: 12, borderLeft: '1px solid var(--border-medium)' }}>
          <SensorAnnunciator label="Gyro" active={isConnected} />
          <SensorAnnunciator label="Accel" active={isConnected} />
          <SensorAnnunciator label="Mag" active={isConnected} />
          <SensorAnnunciator label="Baro" active={isConnected} />
          <SensorAnnunciator label="GPS" active={isConnected && (telemetry?.satellites || 0) >= 4} />
          <SensorAnnunciator label="Sonar" active={isConnected} />
        </div>
      </div>

      <div className="header-right">
        {/* Mission Clock (Local Time) */}
        <div 
          className="header-time"
          title={`Local Station Time: ${time.toLocaleTimeString()}\nUTC: ${time.toUTCString().slice(17, 25)}`}
        >
          <span style={{ color: 'var(--amber)', marginRight: 6 }}>TIME</span>
          {time.toLocaleTimeString('en-US', { hour12: false })}
        </div>

        {/* Battery Telemetry Widget */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '3px 9px',
            borderRadius: 4,
            background: 'rgba(18, 24, 36, 0.7)',
            border: '1px solid var(--border-subtle)'
          }}
          title={`Battery Level: ${battPct}%\nVoltage: ${battVoltage}V (4S LIPO)`}
        >
          <div className="batt-bar">
            <div className="batt-bar-fill" style={{ width: `${battPct}%`, background: battColor }} />
            <div className="batt-tip" />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 800, color: battColor }}>
            {battPct}%
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-faint)' }}>
            {battVoltage}V
          </span>
        </div>

        {/* Feed Mode Indicator / Switcher */}
        {currentPage !== 'municipal' && (
          <>
            {!isLive ? (
              <button
                className="btn btn-outline"
                onClick={switchToLiveFeed}
                style={{
                  padding: '4px 10px',
                  fontSize: '0.72rem',
                  borderColor: '#10b981',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.08)'
                }}
                title="Switch back to real-time live drone flight"
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                Switch to Live Feed
              </button>
            ) : (
              <div 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  borderRadius: 4,
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)'
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s infinite' }} />
                LIVE FEED
              </div>
            )}

            {/* Video File Upload */}
            <input
              type="file"
              ref={fileInputRef}
              accept="video/*"
              style={{ display: 'none' }}
              onChange={handleVideoUpload}
            />
            
            <button
              className="btn btn-outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              title="Upload an inspection video for AI hazard extraction"
              style={{
                borderColor: 'var(--amber)',
                color: 'var(--amber)',
                background: 'rgba(255, 184, 0, 0.08)',
                padding: '4px 12px',
                fontSize: '0.72rem'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isProcessing ? 'Analyzing...' : 'Upload Video'}
            </button>
          </>
        )}
      </div>
    </header>
  );
}