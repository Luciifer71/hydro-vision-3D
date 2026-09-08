import React, { useState } from 'react';
import { useStore, CONFIG } from '../store.js';
import { formatAreaM2, getNumericAreaM2 } from '../lib/derive.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

export default function DetectionsPage() {
  const { 
    hazards: rawHazards = [], 
    detectionSearch, 
    detectionTypeFilter, 
    setDetectionSearch, 
    setDetectionTypeFilter, 
    updateHazardStatus,
    streamRunning,
    syncHazardsToSupabase,
    currentState,
    confidenceThreshold = 0.20
  } = useStore();
  const hazards = rawHazards.filter(h => (h.confidence ?? h.conf ?? 1) >= confidenceThreshold);

  const [isSyncing, setIsSyncing] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ACTIVE'); // 'ACTIVE' or 'ALL'

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Detections or Alerts Loaded" />;
  }

  // Active hazards count for KPI metrics
  const activeHazards = hazards.filter(h => h.status !== 'RESOLVED');
  const counts = {
    TOTAL: hazards.length,
    ACTIVE: activeHazards.length,
    CRITICAL: activeHazards.filter(h => (h.severity || '').toUpperCase() === 'CRITICAL').length,
    HIGH: activeHazards.filter(h => (h.severity || '').toUpperCase() === 'HIGH').length,
    MODERATE: activeHazards.filter(h => (h.severity || '').toUpperCase() === 'MODERATE').length,
  };

  // 1. Filter Logic
  const filtered = hazards.filter(h => {
    // Status filter
    if (statusFilter === 'ACTIVE' && h.status === 'RESOLVED') {
      return false;
    }

    // Severity filter
    if (severityFilter !== 'ALL') {
      if ((h.severity || 'LOW').toUpperCase() !== severityFilter) return false;
    }

    // Type filter
    const hazardType = (h.class_name || h.type || '').toLowerCase();
    const filter = (detectionTypeFilter || 'all').toLowerCase();

    let matchType = false;
    if (filter === 'all') {
      matchType = true;
    } else if (filter === 'potholes' || filter === 'pothole') {
      matchType = hazardType.includes('pothole');
    } else {
      matchType = hazardType === filter || hazardType.replace('-', '_') === filter.replace('-', '_');
    }

    // Free text search
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
    const areaA = getNumericAreaM2(a);
    const areaB = getNumericAreaM2(b);
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
      {/* Alert KPI Summary Cards (Interactive quick-filters) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, flexShrink: 0 }}>
        <div 
          className="kpi-card" 
          onClick={() => setSeverityFilter(severityFilter === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          style={{ 
            borderTopColor: 'var(--danger)', 
            cursor: 'pointer',
            background: severityFilter === 'CRITICAL' ? 'rgba(239, 68, 68, 0.12)' : undefined,
            border: severityFilter === 'CRITICAL' ? '1px solid var(--danger)' : undefined,
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Critical Threats"
        >
          <span className="kpi-label">CRITICAL THREATS</span>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{counts.CRITICAL}</div>
          <span className="kpi-trend up">Immediate response required</span>
        </div>

        <div 
          className="kpi-card" 
          onClick={() => setSeverityFilter(severityFilter === 'HIGH' ? 'ALL' : 'HIGH')}
          style={{ 
            borderTopColor: 'var(--orange)', 
            cursor: 'pointer',
            background: severityFilter === 'HIGH' ? 'rgba(249, 115, 22, 0.12)' : undefined,
            border: severityFilter === 'HIGH' ? '1px solid var(--orange)' : undefined,
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by High Severity"
        >
          <span className="kpi-label">HIGH SEVERITY</span>
          <div className="kpi-value" style={{ color: 'var(--orange)' }}>{counts.HIGH}</div>
          <span className="kpi-trend">Contractor crew dispatch</span>
        </div>

        <div 
          className="kpi-card" 
          onClick={() => setSeverityFilter(severityFilter === 'MODERATE' ? 'ALL' : 'MODERATE')}
          style={{ 
            borderTopColor: 'var(--warning)', 
            cursor: 'pointer',
            background: severityFilter === 'MODERATE' ? 'rgba(245, 158, 11, 0.12)' : undefined,
            border: severityFilter === 'MODERATE' ? '1px solid var(--warning)' : undefined,
            transition: 'all 0.15s ease'
          }}
          title="Click to filter by Moderate Hazards"
        >
          <span className="kpi-label">MODERATE HAZARDS</span>
          <div className="kpi-value" style={{ color: 'var(--warning)' }}>{counts.MODERATE}</div>
          <span className="kpi-trend">Scheduled maintenance</span>
        </div>

        <div 
          className="kpi-card" 
          onClick={() => { setSeverityFilter('ALL'); setStatusFilter('ALL'); }}
          style={{ 
            borderTopColor: 'var(--amber)', 
            cursor: 'pointer',
            background: severityFilter === 'ALL' && statusFilter === 'ALL' ? 'rgba(255, 184, 0, 0.12)' : undefined,
            border: severityFilter === 'ALL' && statusFilter === 'ALL' ? '1px solid var(--amber)' : undefined,
            transition: 'all 0.15s ease'
          }}
          title="Click to view all detections"
        >
          <span className="kpi-label">ACTIVE / TOTAL</span>
          <div className="kpi-value" style={{ color: 'var(--text-primary)' }}>
            {counts.ACTIVE} <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>/ {counts.TOTAL}</span>
          </div>
          <span className="kpi-trend">Tracked telemetry hazards</span>
        </div>
      </div>

      {/* Main Table Fieldset */}
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
          HAZARD INVENTORY & ALERTS ({filtered.length} MATCHING)
        </div>

        {/* Filter Controls & Cloud Sync Action */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8, flex: 1, minWidth: 320 }}>
            <input
              className="form-input"
              placeholder="Search by ID, classification, zone..."
              value={detectionSearch || ''}
              onChange={e => setDetectionSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select 
              className="form-select" 
              style={{ width: 190 }} 
              value={detectionTypeFilter || 'all'} 
              onChange={e => setDetectionTypeFilter(e.target.value)}
            >
              <option value="all">All Types</option>
              <option value="potholes">Potholes</option>
              <option value="damaged_footpath">Damaged Footpath</option>
              <option value="drainage_overflow">Drainage Overflow</option>
              <option value="open_manhole">Open Manhole</option>
              <option value="waterlogging_area">Waterlogging Area</option>
            </select>
          </div>

          {/* Severity & Status Quick Filters */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 2, borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
              {['ALL', 'CRITICAL', 'HIGH', 'MODERATE'].map(f => (
                <button 
                  key={f} 
                  onClick={() => setSeverityFilter(f)}
                  className={`filter-btn ${severityFilter === f ? 'active' : ''}`}
                  style={{ 
                    fontSize: '0.70rem', 
                    padding: '3px 8px',
                    color: severityFilter === f ? '#0b0e14' : f === 'CRITICAL' ? 'var(--danger)' : f === 'HIGH' ? 'var(--orange)' : f === 'MODERATE' ? 'var(--warning)' : undefined
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            <select
              className="form-select"
              style={{ width: 120, fontSize: '0.72rem', padding: '5px 8px' }}
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ACTIVE">Active Only</option>
              <option value="ALL">All (Inc. Resolved)</option>
            </select>

            <button 
              onClick={handleSupabaseSync}
              disabled={isSyncing || hazards.length === 0}
              className="btn btn-primary"
              style={{ 
                fontSize: '0.72rem', 
                padding: '5px 12px',
                whiteSpace: 'nowrap',
                cursor: isSyncing ? 'wait' : 'pointer'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
              {isSyncing ? 'Syncing...' : 'Sync Cloud'}
            </button>
          </div>
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
                  const areaText = formatAreaM2(h);
                  const numAreaM2 = getNumericAreaM2(h);
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
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{h.priority_score ?? (numAreaM2 > 0 ? (numAreaM2 * 10).toFixed(0) : '—')}</td>
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