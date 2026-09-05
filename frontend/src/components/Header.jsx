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
    telemetry, uploadVideo, feedMode, switchToLiveFeed,
    currentUser, switchUserRole 
  } = useStore();
  
  const [time, setTime] = useState(new Date());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const fileInputRef = useRef(null);
  const userMenuRef = useRef(null);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserMenu]);

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
        headers: {
          'X-User-Role': currentUser?.role || 'admin'
        },
        body: formData,
      });

      if (response.status === 403) {
        alert('Access Denied: Municipal Administrator authorization is required to ingest raw drone video.');
        return;
      }

      if (response.ok) {
        uploadVideo(file);
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
        {isDashboard && isAdmin && (
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
        {isAdmin && currentPage !== 'municipal' && (
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

            {/* Video File Upload (Admin Privilege Enforced) */}
            <input
              type="file"
              ref={fileInputRef}
              accept="video/*"
              style={{ display: 'none' }}
              onChange={handleVideoUpload}
            />
            
            <button
              className="btn btn-outline"
              onClick={() => {
                if (!isAdmin) {
                  alert('Permission Denied: Video file ingestion is restricted to Municipal Administrators.');
                  return;
                }
                fileInputRef.current?.click();
              }}
              disabled={isProcessing}
              title={isAdmin ? "Upload an inspection video for AI hazard extraction" : "Upload restricted to Municipal Administrator"}
              style={{
                borderColor: isAdmin ? 'var(--amber)' : 'var(--border-subtle)',
                color: isAdmin ? 'var(--amber)' : 'var(--text-faint)',
                background: isAdmin ? 'rgba(255, 184, 0, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                padding: '4px 12px',
                fontSize: '0.72rem',
                opacity: isAdmin ? 1 : 0.6,
                cursor: isAdmin ? 'pointer' : 'not-allowed'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              {isProcessing ? 'Analyzing...' : !isAdmin ? 'Upload (Admin)' : 'Upload Video'}
            </button>
          </>
        )}

        {/* Municipal User Identity & Access Switcher Widget */}
        <div style={{ position: 'relative' }} ref={userMenuRef}>
          <div 
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              background: isAdmin ? 'rgba(255, 184, 0, 0.08)' : 'rgba(0, 229, 255, 0.08)',
              border: `1px solid ${isAdmin ? 'rgba(255, 184, 0, 0.4)' : 'rgba(0, 229, 255, 0.4)'}`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: isAdmin ? '0 0 10px rgba(255, 184, 0, 0.15)' : '0 0 10px rgba(0, 229, 255, 0.15)'
            }}
            title="Click to Switch Municipal Access Role (Admin vs Field Inspector)"
          >
            {/* Avatar Pill */}
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: isAdmin ? 'linear-gradient(135deg, #ffb800, #d97706)' : 'linear-gradient(135deg, #00e5ff, #0284c7)',
              color: '#06080c',
              fontWeight: 900,
              fontSize: '0.62rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)'
            }}>
              {currentUser?.avatar || 'U'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <span style={{ 
                fontSize: '0.68rem', 
                fontWeight: 900, 
                color: isAdmin ? '#ffb800' : '#00e5ff',
                lineHeight: 1.1,
                letterSpacing: 0.5
              }}>
                {isAdmin ? 'COMMISSIONER (ADMIN)' : 'FIELD INSPECTOR'}
              </span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-faint)', lineHeight: 1.1 }}>
                {currentUser?.name?.split(' ')?.[0] || 'User'} · {isAdmin ? 'FULL ACCESS' : 'RESTRICTED'}
              </span>
            </div>

            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--text-muted)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {/* Role Switcher Popover */}
          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: 290,
                background: 'rgba(10, 14, 22, 0.98)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.85)',
                zIndex: 300,
                padding: '14px',
                fontFamily: 'var(--font-mono)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 8, marginBottom: 10 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--amber)', letterSpacing: 0.8 }}>
                  MUNICIPAL ACCESS PROFILE
                </span>
                <span style={{ 
                  fontSize: '0.58rem', 
                  fontWeight: 900, 
                  padding: '2px 6px', 
                  borderRadius: 3,
                  background: isAdmin ? 'rgba(255,184,0,0.15)' : 'rgba(0,229,255,0.15)',
                  color: isAdmin ? '#ffb800' : '#00e5ff'
                }}>
                  {isAdmin ? 'ROOT ADMIN' : 'EMPLOYEE'}
                </span>
              </div>

              {/* Active User Details */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '8px 10px', marginBottom: 12 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff' }}>
                  {currentUser?.name}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {currentUser?.designation}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: 2 }}>
                  {currentUser?.department}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: 1 }}>
                  Jurisdiction: <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{currentUser?.ward}</span>
                </div>
              </div>

              {/* Permissions scope */}
              <div style={{ fontSize: '0.62rem', color: 'var(--text-faint)', marginBottom: 12 }}>
                <div style={{ fontWeight: 800, color: 'var(--text-muted)', marginBottom: 5 }}>ACTIVE PERMISSIONS:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {isAdmin ? (
                    <>
                      <span className="badge-perm good">✔ Drone Stream Control</span>
                      <span className="badge-perm good">✔ Sensor Calibration</span>
                      <span className="badge-perm good">✔ Contractor Dispatch</span>
                      <span className="badge-perm good">✔ Final Audit Sign-Off</span>
                    </>
                  ) : (
                    <>
                      <span className="badge-perm cyan">✔ View Assigned Tickets</span>
                      <span className="badge-perm cyan">✔ Upload Proof Photos</span>
                      <span className="badge-perm warn">✖ Calibration Locked</span>
                      <span className="badge-perm warn">✖ Dispatch Locked</span>
                    </>
                  )}
                </div>
              </div>

              {/* Quick Role Switcher Buttons */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    switchUserRole(isAdmin ? 'employee' : 'admin');
                    setShowUserMenu(false);
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    padding: '8px 12px',
                    borderColor: isAdmin ? '#00e5ff' : 'var(--amber)',
                    color: isAdmin ? '#00e5ff' : 'var(--amber)',
                    background: isAdmin ? 'rgba(0, 229, 255, 0.08)' : 'rgba(255, 184, 0, 0.08)'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <polyline points="17 11 19 13 23 9" />
                  </svg>
                  {isAdmin ? 'Switch to Field Inspector Account' : 'Switch to Municipal Admin Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}