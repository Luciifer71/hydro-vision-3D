import { useStore, CONFIG } from '../store.js';

export default function DetectionsPage() {
  const { hazards, detectionSearch, detectionTypeFilter, setDetectionSearch, setDetectionTypeFilter, updateHazardStatus } = useStore();

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

    const q = detectionSearch.toLowerCase();
    const typeLabel = (CONFIG.TYPE_LABELS[h.type] || CONFIG.TYPE_LABELS[h.class_name] || h.type || '').toLowerCase();
    const matchSearch = !q || String(h.track_id).includes(q) || hazardType.includes(q) || typeLabel.includes(q) || (h.zone || '').toLowerCase().includes(q);
    
    return matchType && matchSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title">All Detections</span>
          <span className="card-badge badge-info">{filtered.length} records</span>
        </div>
        <div className="card-body" style={{ paddingBottom: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <input
              className="form-input"
              placeholder="Search by track ID, type, zone..."
              value={detectionSearch}
              onChange={e => setDetectionSearch(e.target.value)}
            />
            <select className="form-select" style={{ width: 220 }} value={detectionTypeFilter} onChange={e => setDetectionTypeFilter(e.target.value)}>
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
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Track ID</th><th>Type</th><th>Confidence</th><th>Area (m²)</th>
                <th>Location</th><th>Severity</th><th>Priority</th><th>Zone</th><th>Status</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 24 }}>No detections yet — start the stream to begin detection</td></tr>
              )}
              {[...filtered].sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0)).map(h => {
                const area = Number(h.surface_area_m2) || 0;
                const sev = (h.severity || 'LOW').toLowerCase();
                const lat = h.location?.latitude, lon = h.location?.longitude;
                const clsKey = h.class_name || h.type;
                const typeIcon = CONFIG.TYPE_ICONS[clsKey] || CONFIG.TYPE_ICONS[h.type] || 'DEFECT';
                const typeLabel = CONFIG.TYPE_LABELS[clsKey] || CONFIG.TYPE_LABELS[h.type] || clsKey;
                return (
                  <tr key={h.track_id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>#{h.track_id}</td>
                    <td><span className={`type-badge ${clsKey}`}>{typeIcon} {typeLabel}</span></td>
                    <td>{((h.confidence ?? 1) * 100).toFixed(1)}%</td>
                    <td>{area.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                      {typeof lat === 'number' ? lat.toFixed(5) : '—'}, {typeof lon === 'number' ? lon.toFixed(5) : '—'}
                    </td>
                    <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{h.priority_score ?? '—'}</td>
                    <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{h.zone || '—'}</td>
                    <td>
                      <span style={{ color: h.status === 'RESOLVED' ? 'var(--text-muted)' : h.status === 'IN_PROGRESS' ? 'var(--warning)' : 'var(--green)', fontSize: '0.72rem', fontWeight: 700 }}>
                        {h.status || 'OPEN'}
                      </span>
                    </td>
                    <td>
                      <select
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, padding: '3px 6px', fontSize: '0.7rem', cursor: 'pointer' }}
                        value={h.status || 'OPEN'}
                        onChange={e => updateHazardStatus(h.hazard_id, e.target.value)}
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                      </select>
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
