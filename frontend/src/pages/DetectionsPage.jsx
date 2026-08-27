import React, { useState } from 'react';
import { useStore, CONFIG } from '../store.js';

export default function DetectionsPage() {
  const { 
    hazards = [], 
    detectionSearch, 
    detectionTypeFilter, 
    setDetectionSearch, 
    setDetectionTypeFilter, 
    updateHazardStatus,
    streamRunning,
    syncHazardsToSupabase
  } = useStore();

  const [isSyncing, setIsSyncing] = useState(false);

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
    
    // Search tracks ID, Type, and Zone
    const matchSearch = !q || 
      String(h.hazard_id || h.track_id).toLowerCase().includes(q) || 
      hazardType.includes(q) || 
      typeLabel.includes(q) || 
      (h.zone || '').toLowerCase().includes(q);
    
    return matchType && matchSearch;
  });

  // 2. Smart Sorting (Severity First, then Volume)
  const severityWeight = { CRITICAL: 4, HIGH: 3, MODERATE: 2, LOW: 1 };
  
  const sortedAndFiltered = [...filtered].sort((a, b) => {
    const sevA = severityWeight[(a.severity || 'LOW').toUpperCase()] || 1;
    const sevB = severityWeight[(b.severity || 'LOW').toUpperCase()] || 1;
    
    if (sevA !== sevB) {
      return sevB - sevA; // Highest severity first
    }
    // If severity is the same, sort by volume/area
    const volA = Number(a.estimated_volume_m3 || a.surface_area_m2 || 0);
    const volB = Number(b.estimated_volume_m3 || b.surface_area_m2 || 0);
    return volB - volA;
  });

  // 3. Performance Protection: Only render top 100 rows to prevent DOM lag during live video stream
  const displayLimit = 100;
  const displayList = sortedAndFiltered.slice(0, displayLimit);

  // Real Supabase Sync Handler
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        
        {/* Header Area */}
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span className="card-title">All Detections</span>
            <span className="card-badge badge-info" style={{ marginLeft: 10 }}>{filtered.length} records</span>
          </div>
          
          <button 
            onClick={handleSupabaseSync}
            disabled={isSyncing || streamRunning || hazards.length === 0}
            style={{ 
              background: streamRunning ? '#333' : '#10b981', 
              color: streamRunning ? '#888' : '#fff', 
              border: 'none', padding: '6px 12px', borderRadius: 4, fontSize: '0.75rem', fontWeight: 600, cursor: streamRunning ? 'not-allowed' : 'pointer' 
            }}
          >
            {streamRunning ? 'Streaming (Sync Locked)' : isSyncing ? 'Syncing...' : 'Sync to Supabase'}
          </button>
        </div>

        {/* Filters Area */}
        <div className="card-body" style={{ paddingBottom: 0, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Search by ID, type, zone..."
              value={detectionSearch || ''}
              onChange={e => setDetectionSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select className="form-select" style={{ width: 220 }} value={detectionTypeFilter || 'all'} onChange={e => setDetectionTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              <option value="pothole">Pothole (All Types)</option>
              <option value="pothole_dry">Pothole (Dry)</option>
              <option value="pothole_waterlogged">Pothole (Waterlogged)</option>
              <option value="waterlogging_area">Waterlogging Area</option>
              <option value="open_manhole">Open Manhole</option>
              <option value="crack">Crack</option>
              <option value="drainage_overflow">Drainage Overflow</option>
              <option value="damaged_footpath">Damaged Footpath</option>
            </select>
          </div>
        </div>

        {/* Live Table Area */}
        <div className="table-wrap" style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid #333' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#1e1e1e', zIndex: 10 }}>
              <tr>
                <th>Track ID</th><th>Type</th><th>Confidence</th><th>Volume (m³)</th>
                <th>Location (Lat, Lon)</th><th>Severity</th><th>Priority</th><th>Zone</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {displayList.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 40 }}>
                    {hazards.length === 0 ? 'No detections yet — Start the video pipeline.' : 'No hazards match your filter criteria.'}
                  </td>
                </tr>
              ) : (
                displayList.map((h, idx) => {
                  const vol = Number(h.estimated_volume_m3 || h.surface_area_m2) || 0;
                  const sev = (h.severity || 'LOW').toLowerCase();
                  const lat = h.location?.latitude ?? h.latitude;
                  const lon = h.location?.longitude ?? h.longitude;
                  const clsKey = h.class_name || h.type;
                  const typeIcon = CONFIG.TYPE_ICONS[clsKey] || CONFIG.TYPE_ICONS[h.type] || '⚠️';
                  const typeLabel = CONFIG.TYPE_LABELS[clsKey] || CONFIG.TYPE_LABELS[h.type] || clsKey;
                  const uid = h.hazard_id || `HAZ-${idx}`;

                  return (
                    <tr key={uid}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#ffbb00' }}>{uid}</td>
                      <td><span className="type-badge" style={{ background: '#222' }}>{typeIcon} {typeLabel}</span></td>
                      <td>{((h.confidence ?? 1) * 100).toFixed(1)}%</td>
                      <td style={{ fontWeight: 600 }}>{vol.toFixed(2)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#888' }}>
                        {typeof lat === 'number' ? lat.toFixed(5) : '—'}, {typeof lon === 'number' ? lon.toFixed(5) : '—'}
                      </td>
                      <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{h.priority_score ?? (vol * 10).toFixed(0)}</td>
                      <td style={{ fontSize: '0.72rem', color: '#888' }}>{h.zone || '—'}</td>
                      <td>
                        <span style={{ 
                          color: h.status === 'RESOLVED' ? '#666' : h.status === 'IN_PROGRESS' ? '#f59e0b' : '#10b981', 
                          fontSize: '0.72rem', fontWeight: 700 
                        }}>
                          {h.status || 'OPEN'}
                        </span>
                      </td>
                      <td>
                        <select
                          style={{ background: '#111', border: '1px solid #333', color: '#ccc', borderRadius: 4, padding: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
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