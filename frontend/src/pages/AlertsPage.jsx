import React, { useState } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

export default function AlertsPage() {
  const { hazards = [], updateHazardStatus, currentState } = useStore();
  const [filter, setFilter] = useState('ALL');

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Alerts Available" />;
  }

  const activeAlerts = hazards.filter(h => h.status !== 'RESOLVED');
  
  const displayAlerts = activeAlerts.filter(h => {
    if (filter === 'ALL') return true;
    return (h.severity || 'LOW').toUpperCase() === filter;
  });

  const counts = {
    CRITICAL: activeAlerts.filter(h => (h.severity || '').toUpperCase() === 'CRITICAL').length,
    HIGH: activeAlerts.filter(h => (h.severity || '').toUpperCase() === 'HIGH').length,
    MODERATE: activeAlerts.filter(h => (h.severity || '').toUpperCase() === 'MODERATE').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      {/* Alert KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, flexShrink: 0 }}>
        <div className="kpi-card" style={{ borderTopColor: 'var(--danger)' }}>
          <span className="kpi-label">CRITICAL THREATS</span>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{counts.CRITICAL}</div>
          <span className="kpi-trend up">Requires immediate action</span>
        </div>

        <div className="kpi-card" style={{ borderTopColor: 'var(--orange)' }}>
          <span className="kpi-label">HIGH SEVERITY</span>
          <div className="kpi-value" style={{ color: 'var(--orange)' }}>{counts.HIGH}</div>
          <span className="kpi-trend">Contractor crew dispatch</span>
        </div>

        <div className="kpi-card" style={{ borderTopColor: 'var(--warning)' }}>
          <span className="kpi-label">MODERATE HAZARDS</span>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{counts.MODERATE}</div>
          <span className="kpi-trend">Scheduled inspection</span>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bf-fieldset" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          ACTIVE INCIDENT ALERTS ({displayAlerts.length})
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8, marginBottom: 10 }}>
          {['ALL', 'CRITICAL', 'HIGH', 'MODERATE'].map(f => (
            <button 
              key={f} 
              onClick={() => setFilter(f)}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            >
              {f}
            </button>
          ))}
        </div>
        
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Hazard ID</th>
                <th>Classification</th>
                <th>Surface Footprint</th>
                <th>Severity</th>
                <th>Resolution Action</th>
              </tr>
            </thead>
            <tbody>
              {displayAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--text-faint)' }}>
                    No active alerts matching filter. All infrastructure hazards acknowledged.
                  </td>
                </tr>
              ) : (
                displayAlerts.map((h, i) => {
                  const areaM2 = h.area_m2 ?? h.surface_area_m2;
                  const areaText = areaM2 != null ? `${Number(areaM2).toFixed(1)} m²` : (h.area_px != null ? `${Math.round(h.area_px)} px²` : '—');
                  const sev = (h.severity || 'LOW').toLowerCase();
                  const clsKey = h.class_name || h.type;
                  const typeLabel = CONFIG.TYPE_LABELS[clsKey] || CONFIG.TYPE_LABELS[h.type] || clsKey;
                  const uid = h.hazard_id || `HAZ-${i}`;

                  return (
                    <tr key={uid}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 800 }}>{uid}</td>
                      <td>
                        <span className="type-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          {typeLabel.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{areaText}</td>
                      <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                      <td>
                        <button 
                          onClick={() => updateHazardStatus(uid, 'RESOLVED')}
                          className="btn btn-outline"
                          style={{ borderColor: 'var(--green)', color: 'var(--green)', padding: '4px 12px', fontSize: '0.72rem' }}
                        >
                          ✔ Acknowledge & Resolve
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}