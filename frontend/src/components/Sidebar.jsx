import { useStore } from '../store.js';

const NAV = [
  { id: 'dashboard', label: 'Setup' },
  { id: 'stream', label: 'Stream Control' },
  { section: 'Detection' },
  { id: 'detections', label: 'Detections', badge: 'detection' },
  { id: 'alerts', label: 'Alerts', badge: 'alert' },
  { section: 'Analysis' },
  { id: 'risk', label: 'Risk Engine' },
  { id: 'volumetric', label: 'Area Analytics' },
  { id: 'depth', label: 'Depth Analysis' },
  { section: 'Navigation' },
  { id: 'map', label: 'GPS / Map' },
];

export default function Sidebar() {
  const { currentPage, setPage, connectionStatus, currentState, hazards, telemetry, feedMode } = useStore();
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

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if (item.section) return <div key={i} className="nav-section">{item.section}</div>;
          const count = item.badge ? getBadgeCount(item.badge) : 0;
          return (
            <div
              key={item.id}
              className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.label}</span>
              {count > 0 && <span className="nav-badge">{count}</span>}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <div className="status-row">
          <div className={`status-dot ${connectionStatus === 'LIVE' ? 'live' : connectionStatus === 'CONNECTING' || connectionStatus === 'RECONNECTING' ? 'connecting' : 'error'}`} />
          <span>{connectionStatus}</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.6rem', color: isLive ? '#10b981' : 'var(--amber)', fontWeight: 800 }}>
            {isLive ? 'LIVE' : 'VIDEO'}
          </span>
        </div>
        <div className="status-row" style={{ marginTop: 4, fontSize: '0.65rem', color: '#555' }}>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{isLive ? `${telemetry.satellites} SAT` : 'RECORDED'}</span>
          <span style={{ marginLeft: 'auto' }}>FRAME #{currentState?.frame_id ?? 0}</span>
        </div>
      </div>
    </aside>
  );
}
