import React, { useState, useMemo } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

// Mock data for municipal rates (per cubic meter or sq meter)
const MUNICIPAL_RATES = {
  potholes: { material: 'Asphalt', costPerM2: 1200 },
  damaged_footpath: { material: 'Concrete', costPerM2: 1800 },
  drainage_overflow: { material: 'Plumbing/Silt', costPerM2: 3000 },
  open_manhole: { material: 'Iron Cover', costPerM2: 4500 },
  waterlogging_area: { material: 'Pump/Drainage', costPerM2: 800 },
};

const CONTRACTORS = ['Unassigned', 'PWD (Internal)', 'L&T Infrastructure', 'Alpha Roadways'];
const WARDS = ['All Wards', 'Ward 1 (North)', 'Ward 2 (South)', 'Ward 3 (East)', 'Ward 4 (West)'];

export default function MunicipalOperations() {
  const { hazards = [], currentState, updateHazardStatus } = useStore();
  const [selectedWard, setSelectedWard] = useState('All Wards');
  
  // Local state for assignments and proof of work to mock backend logic
  const [assignments, setAssignments] = useState({});
  const [uploadedPhotos, setUploadedPhotos] = useState({});

  // 1. Weather Integration Mock
  const weatherAlert = true; // Simulating heavy rain prediction
  
  const handleAssign = (id, contractor) => {
    setAssignments(prev => ({ ...prev, [id]: contractor }));
  };

  const handleUploadProof = (id) => {
    // In a real app, this would open a file picker
    alert('Simulating Photo Upload to Ticket...');
    setUploadedPhotos(prev => ({ ...prev, [id]: true }));
    updateHazardStatus(id, 'VERIFIED_CLOSED');
  };

  const handleGenerateReport = () => {
    if (displayHazards.length === 0) {
      alert("No tickets available to export.");
      return;
    }

    const headers = ['Ticket ID', 'Hazard Type', 'Location (Lat, Lon)', 'Ward', 'SLA Hours', 'Est. Cost (INR)', 'Material', 'Contractor', 'Status'];
    const rows = displayHazards.map(h => [
      h.hazard_id || h.track_id,
      h.class_name || 'unknown',
      `"${h.location?.latitude}, ${h.location?.longitude}"`,
      h.ward,
      h.slaHours,
      h.estimatedCost,
      h.material,
      h.contractor,
      h.status
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `municipal_report_${selectedWard.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enhance hazards with Municipal Data
  const enrichedHazards = useMemo(() => {
    return hazards.map(h => {
      const type = h.class_name || h.type || 'unknown';
      const rateInfo = MUNICIPAL_RATES[type] || { material: 'Misc', costPerM2: 1000 };
      const area = h.surface_area_m2 || 0;
      
      // Calculate Budget
      const estimatedCost = (area * rateInfo.costPerM2).toFixed(2);
      
      // Randomly assign a ward for demonstration if none exists
      const ward = h.zone && h.zone !== '—' ? h.zone : WARDS[(h.track_id || 1) % 4 + 1];

      // SLA Logic: Critical gets 48 hrs, High 72 hrs, etc.
      let slaHours = 72;
      let isCriticalSLA = false;
      const sev = (h.severity || 'LOW').toUpperCase();
      
      if (sev === 'CRITICAL' || (weatherAlert && type === 'drainage_overflow')) {
        slaHours = 48;
        isCriticalSLA = true;
      }

      return {
        ...h,
        ward,
        material: rateInfo.material,
        estimatedCost,
        slaHours,
        isCriticalSLA,
        contractor: assignments[h.hazard_id || h.track_id] || 'Unassigned',
        hasProof: uploadedPhotos[h.hazard_id || h.track_id] || false
      };
    });
  }, [hazards, assignments, uploadedPhotos, weatherAlert]);

  // Filter by Ward
  const displayHazards = useMemo(() => {
    if (selectedWard === 'All Wards') return enrichedHazards;
    return enrichedHazards.filter(h => h.ward === selectedWard);
  }, [enrichedHazards, selectedWard]);

  // Ward Leaderboard Data
  const leaderboard = useMemo(() => {
    const board = {};
    WARDS.slice(1).forEach(w => board[w] = { pending: 0, resolved: 0 });
    
    enrichedHazards.forEach(h => {
      if (board[h.ward]) {
        if (h.status === 'VERIFIED_CLOSED' || h.status === 'RESOLVED') {
          board[h.ward].resolved++;
        } else {
          board[h.ward].pending++;
        }
      }
    });
    return Object.entries(board).map(([ward, stats]) => ({ ward, ...stats }));
  }, [enrichedHazards]);

  if (!currentState) return <EmptySessionState message="No Municipal Data Available" />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px' }}>
      
      {/* Header & Weather Alert */}
      <div className="card" style={{ padding: '16px', background: 'linear-gradient(135deg, #1a2a40, #111)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', color: '#ccc', margin: '0 0 8px 0', letterSpacing: '1px' }}>CIVIC OPERATIONS DASHBOARD</h2>
          </div>
          <button onClick={handleGenerateReport} className="btn" style={{ background: '#10b981', color: '#111' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Generate Weekly PDF/Excel
          </button>
        </div>
      </div>

      {/* Ward Filtering & Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
        <div className="card" style={{ padding: '16px' }}>
          <span className="kpi-label" style={{ display: 'block', marginBottom: '12px' }}>Ward / Zone Filter</span>
          <select 
            value={selectedWard} 
            onChange={(e) => setSelectedWard(e.target.value)}
            className="form-select"
            style={{ padding: '10px', fontSize: '1rem', border: '1px solid #ffbb00', background: '#1a1a1a' }}
          >
            {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
          </select>
          <div style={{ marginTop: '20px' }}>
            <span className="kpi-label">Total Est. Budget for selected:</span>
            <div style={{ fontSize: '1.8rem', color: '#10b981', fontWeight: 'bold', marginTop: '5px', fontFamily: 'var(--font-mono)' }}>
              ₹{displayHazards.reduce((sum, h) => sum + parseFloat(h.estimatedCost), 0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '16px' }}>
          <span className="kpi-label" style={{ display: 'block', marginBottom: '12px' }}>Ward Leaderboard</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {leaderboard.map(lb => (
              <div key={lb.ward} style={{ background: '#222', padding: '10px', borderRadius: '4px', border: '1px solid #333' }}>
                <div style={{ fontSize: '0.75rem', color: '#ccc', fontWeight: 'bold', marginBottom: '8px' }}>{lb.ward}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#ef4444' }}>{lb.pending} Pending</span>
                  <span style={{ color: '#10b981' }}>{lb.resolved} Fixed</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Work Order Ticketing System */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Work Order & Ticketing System</span>
          <span className="card-badge" style={{ background: '#333', border: '1px solid #555' }}>{displayHazards.length} Tickets</span>
        </div>
        <div className="table-wrap" style={{ maxHeight: '500px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Hazard & Location</th>
                <th>SLA Timer</th>
                <th>Budget & Material</th>
                <th>Contractor Assigment</th>
                <th>Proof of Work</th>
              </tr>
            </thead>
            <tbody>
              {displayHazards.length === 0 ? (
                <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>No pending tickets for {selectedWard}</td></tr>
              ) : (
                displayHazards.map((h, i) => (
                  <tr key={i} style={{ background: h.status === 'VERIFIED_CLOSED' ? 'rgba(16,185,129,0.05)' : 'transparent' }}>
                    <td><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>{h.hazard_id || h.track_id}</div></td>
                    <td>
                      <div style={{ color: '#ccc', fontWeight: 'bold' }}>{(CONFIG.TYPE_LABELS[h.class_name] || h.class_name).toUpperCase()}</div>
                      <div style={{ fontSize: '0.7rem', color: '#666' }}>{h.location?.latitude?.toFixed(5)}, {h.location?.longitude?.toFixed(5)}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888', marginTop: 2 }}>Ward: {h.ward}</div>
                    </td>
                    <td>
                      {h.status === 'VERIFIED_CLOSED' ? (
                        <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.8rem' }}>COMPLETED</span>
                      ) : (
                        <span style={{ 
                          background: h.isCriticalSLA ? 'rgba(239,68,68,0.2)' : 'rgba(255,187,0,0.2)', 
                          color: h.isCriticalSLA ? '#ef4444' : '#ffbb00', 
                          padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold' 
                        }}>
                          {h.slaHours}h Remaining
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ color: '#10b981', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>₹{parseFloat(h.estimatedCost).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>{h.surface_area_m2?.toFixed(2)} m² of {h.material}</div>
                    </td>
                    <td>
                      <select 
                        value={h.contractor}
                        onChange={(e) => handleAssign(h.hazard_id || h.track_id, e.target.value)}
                        disabled={h.status === 'VERIFIED_CLOSED'}
                        style={{ background: '#222', color: '#ccc', border: '1px solid #444', padding: '4px', borderRadius: '3px', outline: 'none' }}
                      >
                        {CONTRACTORS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      {h.status === 'VERIFIED_CLOSED' ? (
                        <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          Verified Closed
                        </span>
                      ) : (
                        <button onClick={() => handleUploadProof(h.hazard_id || h.track_id)} className="btn btn-outline" style={{ padding: '4px 8px', fontSize: '0.7rem' }}>
                          Upload Fixed Photo
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  );
}
