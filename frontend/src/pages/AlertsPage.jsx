import React, { useState } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

export default function AlertsPage() {
  const { hazards = [], updateHazardStatus, currentState } = useStore();
  const [filter, setFilter] = useState('ALL');

  if (!currentState) return <EmptySessionState message="No Alerts Available" />;

  // Filter for alerts (usually you only want to see actionable items, not 'RESOLVED' ones)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* Alert KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, flexShrink: 0 }}>
        <div className="card" style={{ borderTop: '3px solid #ef4444' }}>
          <div className="card-body">
            <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>CRITICAL</div>
            <div style={{ fontSize: '2rem', color: '#ef4444', fontWeight: 900 }}>{counts.CRITICAL}</div>
          </div>
        </div>
        <div className="card" style={{ borderTop: '3px solid #f97316' }}>
          <div className="card-body">
            <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>HIGH</div>
            <div style={{ fontSize: '2rem', color: '#f97316', fontWeight: 900 }}>{counts.HIGH}</div>
          </div>
        </div>
        <div className="card" style={{ borderTop: '3px solid #f59e0b' }}>
          <div className="card-body">
            <div style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>MODERATE</div>
            <div style={{ fontSize: '2rem', color: '#f59e0b', fontWeight: 900 }}>{counts.MODERATE}</div>
          </div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="card-title">Active Alerts</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {['ALL', 'CRITICAL', 'HIGH', 'MODERATE'].map(f => (
              <button 
                key={f} 
                onClick={() => setFilter(f)}
                style={{ 
                  background: filter === f ? '#333' : 'transparent', 
                  color: filter === f ? '#fff' : '#888', 
                  border: '1px solid #444', borderRadius: 4, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer' 
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e', zIndex: 10 }}>
              <tr>
                <th>Track ID</th><th>Type</th><th>Area (m²)</th><th>Severity</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayAlerts.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#666' }}>No active alerts for this severity level.</td></tr>
              ) : (
                displayAlerts.map((h, i) => {
                  const area = Number(h.surface_area_m2) || 0;
                  const sev = (h.severity || 'LOW').toLowerCase();
                  const clsKey = h.class_name || h.type;
                  const typeIcon = CONFIG.TYPE_ICONS[clsKey] || CONFIG.TYPE_ICONS[h.type] || '⚠️';
                  const typeLabel = CONFIG.TYPE_LABELS[clsKey] || CONFIG.TYPE_LABELS[h.type] || clsKey;
                  const uid = h.hazard_id || `HAZ-${i}`;

                  return (
                    <tr key={uid}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#ffbb00' }}>{uid}</td>
                      <td><span className="type-badge" style={{ background: '#222' }}>{typeIcon} {typeLabel}</span></td>
                      <td style={{ fontWeight: 600 }}>{area.toFixed(1)}</td>
                      <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                      <td>
                        <button 
                          onClick={() => updateHazardStatus(uid, 'RESOLVED')}
                          style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, padding: '4px 10px', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700 }}
                        >
                          Acknowledge
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