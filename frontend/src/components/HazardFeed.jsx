import { CONFIG } from '../store.js';

/**
 * HazardFeed — Live hazard detection list panel.
 * Shows the top hazards sorted by area with type badges and severity.
 */
export default function HazardFeed({ hazards, activeHazards }) {
  return (
    <div className="card" style={{ flex: 1, minHeight: 0 }}>
      <div className="card-header">
        <span className="card-title">Live Hazard Feed</span>
        <span className="card-badge badge-live">{activeHazards} ACTIVE</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 280 }}>
        {hazards.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#555', fontSize: '0.85rem' }}>
            No hazards detected
          </div>
        ) : (
          [...hazards]
            .sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0))
            .slice(0, 8)
            .map((h) => {
              const area = Number(h.surface_area_m2) || 0;
              const sev = (h.severity || 'LOW').toLowerCase();
              return (
                <div key={h.track_id} style={{ padding: '7px 12px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className={`type-badge ${h.type}`}>
                      {CONFIG.TYPE_ICONS[h.type]} {CONFIG.TYPE_LABELS[h.type] || h.type}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#666' }}>
                      #{h.track_id} | {area.toFixed(1)} m²
                    </span>
                  </div>
                  <span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}
