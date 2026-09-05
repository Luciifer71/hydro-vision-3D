import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store.js';

// Crisp, inline tactical SVG icons matching Betaflight & aerospace GCS
const NavIcon = ({ type }) => {
  switch (type) {
    case 'setup':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      );
    case 'stream':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      );
    case 'detection':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="22" y1="12" x2="18" y2="12" />
          <line x1="6" y1="12" x2="2" y2="12" />
          <line x1="12" y1="6" x2="12" y2="2" />
          <line x1="12" y1="22" x2="12" y2="18" />
        </svg>
      );
    case 'alert':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'risk':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'volumetric':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'depth':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h20" />
          <path d="M20 12v8H4v-8" />
          <path d="M4 4v4h16V4" />
          <path d="M9 12v4" />
          <path d="M15 12v4" />
        </svg>
      );
    case 'map':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      );
    case 'municipal':
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
          <path d="M15 3v18" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
        </svg>
      );
    default:
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
};

const NAV = [
  { id: 'dashboard', label: 'Setup', icon: 'setup' },
  { id: 'stream', label: 'Stream Control', icon: 'stream' },
  { section: 'Detection' },
  { id: 'detections', label: 'Detections', icon: 'detection', badge: 'detection' },
  { id: 'alerts', label: 'Alerts', icon: 'alert', badge: 'alert' },
  { section: 'Analysis' },
  { id: 'risk', label: 'Risk Engine', icon: 'risk' },
  { id: 'volumetric', label: 'Area Analytics', icon: 'volumetric' },
  { id: 'depth', label: 'Depth Analysis', icon: 'depth' },
  { section: 'Navigation' },
  { id: 'map', label: 'GPS / Map', icon: 'map' },
  { section: 'Municipal' },
  { id: 'municipal', label: 'Civic Command', icon: 'municipal' },
];

export default function Sidebar() {
  const { 
    currentPage, setPage, connectionStatus, currentState, hazards, 
    telemetry, feedMode, connect, disconnect, currentUser
  } = useStore();
  
  const [showPortMenu, setShowPortMenu] = useState(false);
  const portMenuRef = useRef(null);

  const isEmployee = currentUser?.role === 'employee';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (portMenuRef.current && !portMenuRef.current.contains(e.target)) {
        setShowPortMenu(false);
      }
    };
    if (showPortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPortMenu]);

  const detCount = hazards.length || currentState?.summary?.active_hazards || 0;
  const alertCount = hazards.filter(h => {
    const s = (h.severity || 'LOW').toUpperCase();
    return s === 'CRITICAL' || s === 'HIGH' || s === 'MODERATE';
  }).length || currentState?.summary?.alert_count || 0;

  const getBadgeCount = (badge) => {
    if (badge === 'detection') return detCount;
    if (badge === 'alert') return alertCount;
    return 0;
  };

  const isLive = feedMode === 'live';
  const isConnected = connectionStatus === 'LIVE';

  const handleConnectToggle = () => {
    if (isConnected) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <aside className="sidebar">
      {/* Betaflight-Style Connect Header Slot */}
      <div className="sidebar-connect-slot">
        <div style={{ position: 'relative' }} ref={portMenuRef}>
          <button 
            className={`bf-connect-btn ${isConnected ? 'connected' : ''}`}
            onClick={handleConnectToggle}
            title={isConnected ? 'Click to Disconnect Stream' : 'Click to Connect to Live Drone Stream (Port 8000)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M7 17l9.2-9.2M17 17V7H7" />
              </svg>
              <span>{isConnected ? 'Disconnect' : 'Connect'}</span>
            </div>
            <div 
              style={{ padding: '2px 4px', cursor: 'pointer', opacity: 0.8 }}
              onClick={(e) => {
                e.stopPropagation();
                setShowPortMenu(!showPortMenu);
              }}
              title="Select Communications Port or Terminate Stream"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {/* Port Dropdown Menu with ONLY Connect and Disconnect Options */}
          {showPortMenu && (
            <div 
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 6,
                background: 'rgba(18, 24, 36, 0.98)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
                zIndex: 200,
                padding: '6px',
                fontFamily: 'var(--font-mono)',
                display: 'flex',
                flexDirection: 'column',
                gap: 5
              }}
            >
              {/* Option 1: Connect */}
              <div
                onClick={() => {
                  setShowPortMenu(false);
                  connect();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease'
                }}
                title="Connect to Drone Video Stream"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" fill="#10b981" />
                  </svg>
                  <span style={{ fontWeight: 800, fontSize: '0.78rem' }}>Connect</span>
                </div>
                {isConnected && (
                  <span style={{ fontSize: '0.58rem', color: '#10b981', fontWeight: 800, background: 'rgba(16,185,129,0.2)', padding: '2px 6px', borderRadius: 3 }}>
                    ACTIVE
                  </span>
                )}
              </div>

              {/* Option 2: Disconnect */}
              <div
                onClick={() => {
                  setShowPortMenu(false);
                  disconnect();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.15s ease'
                }}
                title="Disconnect & Terminate Session"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="5" y="5" width="14" height="14" rx="2" fill="#ef4444" />
                  </svg>
                  <span style={{ fontWeight: 800, fontSize: '0.78rem' }}>Disconnect</span>
                </div>
                {!isConnected && (
                  <span style={{ fontSize: '0.58rem', color: '#ef4444', fontWeight: 800, background: 'rgba(239,68,68,0.2)', padding: '2px 6px', borderRadius: 3 }}>
                    OFFLINE
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Status & Municipal Scope Subtext */}
        <div style={{ 
          marginTop: 6, 
          fontSize: '0.62rem', 
          fontFamily: 'var(--font-mono)', 
          color: 'var(--text-faint)', 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 2px',
          letterSpacing: 0.5 
        }}>
          <span>LINK: <strong style={{ color: isConnected ? 'var(--green)' : 'var(--text-muted)' }}>{connectionStatus}</strong></span>
          <span style={{ 
            color: isEmployee ? 'var(--cyan)' : 'var(--amber)',
            fontWeight: 800
          }}>
            {isEmployee ? 'FIELD WORKER' : 'ROOT ADMIN'}
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.section) return <div key={i} className="nav-section">{item.section}</div>;
          const count = item.badge ? getBadgeCount(item.badge) : 0;
          const isActive = currentPage === item.id;
          const isRestricted = isEmployee && ['dashboard', 'stream', 'risk', 'volumetric', 'depth'].includes(item.id);

          return (
            <div
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
              style={isRestricted ? { opacity: 0.65 } : {}}
            >
              <span className="nav-icon">
                <NavIcon type={item.icon} />
              </span>
              <span>{item.label}</span>
              {isRestricted && (
                <span style={{ 
                  marginLeft: 'auto', 
                  fontSize: '0.54rem', 
                  color: '#ef4444', 
                  fontWeight: 800,
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  padding: '1px 5px',
                  borderRadius: 3
                }}>
                  🔒 LOCKED
                </span>
              )}
              {count > 0 && !isRestricted && <span className="nav-badge">{count}</span>}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer with Live Hardware Annunciators */}
      <div className="sidebar-footer">
        <div className="status-row">
          <div className={`status-dot ${connectionStatus === 'LIVE' ? 'live' : connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING' ? 'connecting' : 'error'}`} />
          <span style={{ fontWeight: 700, letterSpacing: 0.5 }}>{connectionStatus}</span>
          <span style={{ 
            marginLeft: 'auto', 
            fontSize: '0.62rem', 
            color: isLive ? '#10b981' : 'var(--amber)', 
            fontWeight: 800,
            padding: '1px 6px',
            borderRadius: 3,
            background: isLive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 184, 0, 0.12)',
            border: `1px solid ${isLive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 184, 0, 0.3)'}`
          }}>
            {isLive ? 'LIVE' : 'VIDEO'}
          </span>
        </div>

        <div className="status-row" style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>
            {isLive ? `${telemetry.satellites || 12} SAT` : 'RECORDED'}
          </span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', color: 'var(--amber)' }}>
            FR #{currentState?.frame_id ?? 0}
          </span>
        </div>
      </div>
    </aside>
  );
}
