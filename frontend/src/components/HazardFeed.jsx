import React from 'react';

export default function HazardFeed({ hazards = [], activeHazards = 0 }) {
  // Grab only the 15 most recent hazards to prevent UI rendering lag
  const displayList = [...hazards].reverse().slice(0, 15);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '50%', minHeight: 200, background: 'rgba(20, 20, 20, 0.9)', borderRadius: 6, border: '1px solid #333', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #333', background: '#1a1a1a' }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ccc' }}>Live Hazard Feed</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10b981', background: 'rgba(16,185,129,0.15)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(16,185,129,0.3)' }}>
          {activeHazards} ACTIVE
        </span>
      </div>

      {/* Feed List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {displayList.length === 0 ? (
          <div style={{ color: '#666', fontSize: '0.75rem', textAlign: 'center', marginTop: 20 }}>No hazards detected</div>
        ) : (
          displayList.map((h, i) => {
            const vol = Number(h.estimated_volume_m3 || h.surface_area_m2 || 0);
            const sev = (h.severity || 'LOW').toUpperCase();
            
            // Badge color coding
            const sevColor = 
              sev === 'CRITICAL' ? { color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.1)' } :
              sev === 'HIGH' ? { color: '#f97316', borderColor: 'rgba(249,115,22,0.3)', bg: 'rgba(249,115,22,0.1)' } :
              sev === 'MODERATE' ? { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.1)' } :
              { color: '#10b981', borderColor: 'rgba(16,185,129,0.3)', bg: 'rgba(16,185,129,0.1)' };

            return (
              <div key={`${h.hazard_id || i}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', padding: '6px 8px', background: '#121212', borderRadius: 4, border: '1px solid #262626' }}>
                <span style={{ fontFamily: 'monospace', color: '#aaa', display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{h.hazard_id || `HAZ-${i}`}</span> 
                  <span style={{ color: '#555' }}>|</span> 
                  <span style={{ color: '#ffbb00' }}>{vol.toFixed(2)} m³</span>
                </span>
                <span style={{ padding: '2px 6px', borderRadius: 3, fontSize: '0.65rem', fontWeight: 700, color: sevColor.color, background: sevColor.bg, border: `1px solid ${sevColor.borderColor}` }}>
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