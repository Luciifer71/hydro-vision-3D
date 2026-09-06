import React, { useState } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

export default function DetectionsPage() {
  const { 
    hazards = [], 
    detectionSearch, 
    detectionTypeFilter, 
    setDetectionSearch, 
    setDetectionTypeFilter, 
    updateHazardStatus,
    streamRunning,
    syncHazardsToSupabase,
    currentState
  } = useStore();

  const [isSyncing, setIsSyncing] = useState(false);

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Detections Loaded" />;
  }

  // 1. Filter Logic
  const filtered = hazards.filter(h => {
    const hazardType = (h.class_name || h.type || '').toLowerCase();
    const filter = (detectionTypeFilter || 'all').toLowerCase();

    let matchType = false;
    if (filter === 'all') {
      matchType = true;
    } else if (filter === 'pothole') {
      matchType = hazardType.includes('pothole');
    } else {
      matchType = hazardType === filter || hazardType.replace('-', '_') === filter.replace('-', '_');
    }

    const q = (detectionSearch || '').toLowerCase();
    const typeLabel = (CONFIG.TYPE_LABELS[h.type] || CONFIG.TYPE_LABELS[h.class_name] || h.type || '').toLowerCase();
    
    const matchSearch = !q || 
      String(h.hazard_id || h.track_id).toLowerCase().includes(q) || 
      hazardType.includes(q) || 
      typeLabel.includes(q) || 
      (h.zone || '').toLowerCase().includes(q);
    
    return matchType && matchSearch;
  });

  // 2. Smart Sorting
  const severityWeight = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
  
  const sortedAndFiltered = [...filtered].sort((a, b) => {
    const sevA = severityWeight[(a.severity || 'LOW').toUpperCase()] || 1;
    const sevB = severityWeight[(b.severity || 'LOW').toUpperCase()] || 1;
    if (sevA !== sevB) return sevB - sevA;
    const areaA = Number(a.area_m2 ?? a.surface_area_m2 ?? a.area_px ?? 0);
    const areaB = Number(b.area_m2 ?? b.surface_area_m2 ?? b.area_px ?? 0);
    return areaB - areaA;
  });

  const displayLimit = 100;
  const displayList = sortedAndFiltered.slice(0, displayLimit);

  const handleSupabaseSync = async () => {
    setIsSyncing(true);
    const result = await syncHazardsToSupabase();
    setIsSyncing(false);
    
    if (result.success) {
      alert(`Successfully synced ${result.count} records to Supabase mission_detections table!`);
    } else {
      alert(`Sync failed: ${result.error || 'Check console for details.'}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div className="bf-fieldset" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Betaflight Embedded Pill Badge */}
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
          </svg>
          HAZARD INVENTORY ({filtered.length} RECORDS)
        </div>

        {/* Filter Controls & Cloud Sync Action */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10, flex: 1 }}>
            <input
              className="form-input"
              placeholder="Search by ID, class type, municipal zone..."
              value={detectionSearch || ''}
              onChange={e => setDetectionSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select 
              className="form-select" 
              style={{ width: 220 }} 
              value={detectionTypeFilter || 'all'} 
              onChange={e => setDetectionTypeFilter(e.target.value)}
            >
              <option value="all">All Classifications</option>
              <option value="potholes">Potholes</option>
              <option value="damaged_footpath">Damaged Footpath</option>
              <option value="drainage_overflow">Drainage Overflow</option>
              <option value="open_manhole">Open Manhole</option>
              <option value="waterlogging_area">Waterlogging Area</option>
            </select>
          </div>

          <button 
            onClick={handleSupabaseSync}
            disabled={isSyncing || hazards.length === 0}
            className="btn btn-primary"
            style={{ 
              fontSize: '0.75rem', 
              padding: '7px 14px',
              whiteSpace: 'nowrap',
              cursor: isSyncing ? 'wait' : 'pointer'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
            </svg>
            {isSyncing ? 'Syncing...' : 'Sync to Supabase Cloud'}
          </button>
        </div>

        {/* Live Table Area */}
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th>Hazard ID</th>
                <th>Classification</th>
                <th>Confidence</th>
                <th>Footprint</th>
                <th>Coordinates (WGS84)</th>
                <th>Threat Severity</th>
                <th>Risk Priority</th>
                <th>Municipal Zone</th>
                <th>Lifecycle Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 40 }}>
                    {hazards.length === 0 ? 'No detections yet — Run the video perception pipeline.' : 'No hazards match your filter query.'}
                  </td>
                </tr>
              ) : (
                displayList.map((h, idx) => {
                  const areaM2 = h.area_m2 ?? h.surface_area_m2;
                  const areaText = areaM2 != null ? `${Number(areaM2).toFixed(1)} m²` : (h.area_px != null ? `${Math.round(h.area_px)} px²` : '—');
                  const sev = (h.severity || 'LOW').toLowerCase();
                  const lat = h.location?.latitude ?? h.latitude;
                  const lon = h.location?.longitude ?? h.longitude;
                  const clsKey = h.class_name || h.type;
                  const typeLabel = CONFIG.TYPE_LABELS[clsKey] || CONFIG.TYPE_LABELS[h.type] || clsKey;
                  const uid = h.hazard_id || `HAZ-${idx}`;

                  return (
                    <tr key={uid}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--amber)', fontWeight: 800 }}>{uid}</td>
                      <td>
                        <span className="type-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          {typeLabel.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{((h.confidence ?? 1) * 100).toFixed(1)}%</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{areaText}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {typeof lat === 'number' ? lat.toFixed(5) : '—'}, {typeof lon === 'number' ? lon.toFixed(5) : '—'}
                      </td>
                      <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{h.priority_score ?? (areaM2 != null ? (areaM2 * 10).toFixed(0) : '—')}</td>
                      <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.zone || '—'}</td>
                      <td>
                        <span style={{ 
                          color: h.status === 'RESOLVED' ? 'var(--text-faint)' : h.status === 'IN_PROGRESS' ? 'var(--warning)' : 'var(--green)', 
                          fontSize: '0.72rem', 
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono)'
                        }}>
                          {h.status || 'OPEN'}
                        </span>
                      </td>
                      <td>
                        <select
                          className="form-select"
                          style={{ padding: '3px 6px', fontSize: '0.7rem', width: 'auto' }}
                          value={h.status || 'OPEN'}
                          onChange={e => updateHazardStatus(uid, e.target.value)}
                        >
                          <option value="OPEN">OPEN</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="RESOLVED">RESOLVED</option>
                        </select>
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