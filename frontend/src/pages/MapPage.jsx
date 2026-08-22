import HazardMap from '../components/HazardMap.jsx';
import { useStore } from '../store.js';

export default function MapPage() {
  const { hazards } = useStore();
  const totalArea = hazards.reduce((s, h) => s + (Number(h.surface_area_m2) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Total Markers', value: hazards.length },
          { label: 'Coverage Area', value: `${totalArea.toFixed(2)} m²` },
          { label: 'Last Updated', value: new Date().toLocaleTimeString('en-US', { hour12: false }) },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.2rem' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">GIS Hazard Map — Vadodara</span>
          <span className="card-badge badge-live">● Live</span>
        </div>
        <HazardMap fullpage />
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Map Legend</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>HAZARD TYPES</div>
            {[['#ef4444','Pothole'],['#00d4ff','Water Body'],['#f59e0b','Crack'],['#a855f7','Flooding']].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
                <span style={{ fontSize: '0.78rem' }}>{l}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>SEVERITY THRESHOLDS</div>
            {[['low','LOW','< 5 m²'],['moderate','MODERATE','5 – 25 m²'],['high','HIGH','25 – 75 m²'],['critical','CRITICAL','≥ 75 m²']].map(([cls, label, range]) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`sev-badge ${cls}`}>{label}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
