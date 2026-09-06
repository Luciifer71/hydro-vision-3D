import React from 'react';

export default function HazardFeed({ hazards = [], activeHazards = 0 }) {
  const displayList = [...hazards].reverse().slice(0, 15);

  return (
    <div className="bf-fieldset" style={{ display: 'flex', flexDirection: 'column', minHeight: 220 }}>
      {/* Betaflight Embedded Pill Badge */}
      <div className="bf-badge-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        LIVE HAZARD LOG ({activeHazards})
      </div>

      {/* Feed List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4, maxHeight: 200 }}>
        {displayList.length === 0 ? (
          <div style={{ color: 'var(--text-faint)', fontSize: '0.75rem', textAlign: 'center', marginTop: 24, fontStyle: 'italic' }}>
            No active hazards in detection gate
          </div>
        ) : (
          displayList.map((h, i) => {
            const areaM2 = h.area_m2 ?? h.surface_area_m2;
            const areaText = areaM2 != null ? `${Number(areaM2).toFixed(1)} m²` : (h.area_px != null ? `${Math.round(h.area_px)} px²` : '—');
            const sev = (h.severity || 'LOW').toUpperCase();
            const className = (h.class_name || h.type || 'HAZARD').replace(/_/g, ' ');

            const sevClass = 
              sev === 'CRITICAL' ? 'critical' :
              sev === 'HIGH' ? 'high' :
              sev === 'MODERATE' ? 'moderate' : 'low';

            return (
              <div 
                key={`${h.hazard_id || i}-${i}`} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  fontSize: '0.75rem', 
                  padding: '7px 10px', 
                  background: 'rgba(10, 14, 22, 0.75)', 
                  borderRadius: 'var(--radius-xs)', 
                  border: '1px solid var(--border-subtle)',
                  transition: 'border-color 0.16s ease'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.75rem' }}>
                      {h.hazard_id || `HAZ-${i}`}
                    </span>
                    <span style={{ color: 'var(--text-faint)' }}>·</span>
                    <span style={{ color: 'var(--amber)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 600 }}>
                      {areaText}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                    {className}
                  </span>
                </div>

                <span className={`sev-badge ${sevClass}`}>
                  {sev}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}