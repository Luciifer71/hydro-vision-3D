import { useStore, CONFIG } from '../store.js';

function severityFromArea(a) {
  a = Number(a) || 0;
  if (a >= 75) return 'CRITICAL'; if (a >= 25) return 'HIGH'; if (a >= 5) return 'MODERATE'; return 'LOW';
}

export default function AlertsPage() {
  const { hazards, alertFilter, setAlertFilter, updateHazardStatus, telemetry } = useStore();

  const withSev = hazards.map(h => ({
    ...h,
    _sev: (h.severity || severityFromArea(h.surface_area_m2)).toLowerCase(),
  }));

  const counts = { critical: 0, high: 0, moderate: 0 };
  withSev.forEach(h => { if (counts[h._sev] !== undefined) counts[h._sev]++; });

  const filtered = alertFilter === 'all' ? withSev : withSev.filter(h => h._sev === alertFilter);
  const sorted = [...filtered].sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0));

  const battPct = Math.round(telemetry.battery);
  const criticalHazard = hazards.find(h => (h.severity || severityFromArea(h.surface_area_m2)) === 'CRITICAL');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* RTL Advisory Banner */}
      {criticalHazard && battPct < 30 && (
        <div className="rtl-alert">
          <span className="rtl-icon">!!</span>
          <div>
            <strong style={{ color: 'var(--danger)' }}>RTL ADVISORY</strong>
            <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
              Battery at {battPct}% with CRITICAL hazard detected. Insufficient power to map perimeter — consider Return to Launch.
            </span>
          </div>
        </div>
      )}

      {/* Counts */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Critical', count: counts.critical, color: '#ef4444' },
          { label: 'High', count: counts.high, color: '#f97316' },
          { label: 'Moderate', count: counts.moderate, color: '#f59e0b' },
        ].map(({ label, count, color }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ color }}>{count}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active Alerts</span>
          <span className="card-badge badge-info">{sorted.length}</span>
        </div>
        <div className="filter-bar">
          {['all','critical','high','moderate'].map(f => (
            <button key={f} className={`filter-btn ${alertFilter === f ? 'active' : ''}`} onClick={() => setAlertFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Time</th><th>Track ID</th><th>Type</th><th>Area m²</th><th>Confidence</th><th>Severity</th><th>Zone</th><th>Action</th></tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-faint)' }}>No alerts — all clear</td></tr>
              )}
              {sorted.map(h => {
                const area = Number(h.surface_area_m2) || 0;
                const ts = h.timestamp ? new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--:--:--';
                return (
                  <tr key={h.track_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ts}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>#{h.track_id}</td>
                    <td><span className={`type-badge ${h.type}`}>{CONFIG.TYPE_ICONS[h.type]} {CONFIG.TYPE_LABELS[h.type]}</span></td>
                    <td>{area.toFixed(2)}</td>
                    <td>{((h.confidence ?? 1) * 100).toFixed(1)}%</td>
                    <td><span className={`sev-badge ${h._sev}`}>{h._sev.toUpperCase()}</span></td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.zone || '—'}</td>
                    <td>
                      <button
                        className="btn btn-outline"
                        style={{ padding: '3px 10px', fontSize: '0.68rem' }}
                        onClick={() => updateHazardStatus(h.hazard_id, 'IN_PROGRESS')}
                      >
                        Acknowledge
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
