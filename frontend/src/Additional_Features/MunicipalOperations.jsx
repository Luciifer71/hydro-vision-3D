import React, { useState, useMemo, useEffect } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

const MUNICIPAL_RATES = {
  potholes: { material: 'Asphalt Cold Mix', costPerM2: 1200 },
  damaged_footpath: { material: 'Reinforced Concrete', costPerM2: 1800 },
  drainage_overflow: { material: 'Hydro-Jet Silt Clear', costPerM2: 3000 },
  open_manhole: { material: 'Ductile Iron Cover', costPerM2: 4500 },
  waterlogging_area: { material: 'High-Volume Dewatering Pump', costPerM2: 800 },
};

const CONTRACTORS = ['Unassigned', 'PWD (Municipal In-House)', 'L&T Smart Infrastructure', 'Alpha Roadways'];
const WARDS = ['All Wards', 'Ward 1 (North Sector)', 'Ward 2 (South Sector)', 'Ward 3 (East Industrial)', 'Ward 4 (West Corridor)'];

export default function MunicipalOperations() {
  const { hazards = [], currentState, updateHazardStatus, currentUser } = useStore();
  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  const [selectedWard, setSelectedWard] = useState(isEmployee && currentUser?.ward ? currentUser.ward : 'All Wards');
  
  useEffect(() => {
    if (isEmployee && currentUser?.ward) {
      setSelectedWard(currentUser.ward);
    } else if (isAdmin) {
      setSelectedWard('All Wards');
    }
  }, [currentUser?.role, currentUser?.ward, isAdmin, isEmployee]);

  const [assignments, setAssignments] = useState({});
  const [uploadedPhotos, setUploadedPhotos] = useState({});

  const weatherAlert = true;

  const handleAssign = (id, contractor) => {
    if (!isAdmin) {
      alert('Permission Denied: Contractor dispatch and budgeting requires Municipal Administrator authorization.');
      return;
    }
    setAssignments(prev => ({ ...prev, [id]: contractor }));
  };

  const handleUploadProof = (id) => {
    setUploadedPhotos(prev => ({ ...prev, [id]: true }));
    if (isAdmin) {
      updateHazardStatus(id, 'VERIFIED_CLOSED', { verified_by: currentUser?.name });
    } else {
      updateHazardStatus(id, 'PENDING_AUDIT', { submitted_by: currentUser?.name });
    }
  };

  const handleAdminApprove = (id) => {
    if (!isAdmin) return;
    updateHazardStatus(id, 'VERIFIED_CLOSED', { verified_by: currentUser?.name });
  };

  const handleGenerateReport = () => {
    if (displayHazards.length === 0) {
      alert("No tickets available to export.");
      return;
    }

    const headers = ['Ticket ID', 'Hazard Type', 'Coordinates', 'Ward', 'SLA Remaining', 'Est. Cost (INR)', 'Material', 'Contractor', 'Status'];
    const rows = displayHazards.map(h => [
      h.hazard_id || h.track_id,
      h.class_name || 'unknown',
      `"${h.location?.latitude?.toFixed(5)}, ${h.location?.longitude?.toFixed(5)}"`,
      h.ward,
      `${h.slaHours}h`,
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
    link.setAttribute('download', `municipal_dispatch_report_${selectedWard.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Enhance hazards with Municipal Data
  const enrichedHazards = useMemo(() => {
    return hazards.map(h => {
      const type = h.class_name || h.type || 'unknown';
      const rateInfo = MUNICIPAL_RATES[type] || MUNICIPAL_RATES.potholes;
      const areaM2 = h.area_m2 ?? h.surface_area_m2;
      const area = areaM2 != null ? Number(areaM2) : null;
      
      const estimatedCost = area != null ? (area * rateInfo.costPerM2).toFixed(2) : '0.00';
      const ward = h.zone && h.zone !== '—' ? h.zone : WARDS[(h.track_id || 1) % 4 + 1];

      let slaHours = 72;
      let isCriticalSLA = false;
      const sev = (h.severity || 'LOW').toUpperCase();
      
      if (sev === 'CRITICAL' || (weatherAlert && type === 'drainage_overflow') || type === 'open_manhole') {
        slaHours = 24;
        isCriticalSLA = true;
      } else if (sev === 'HIGH') {
        slaHours = 48;
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

  const totalEstBudget = displayHazards.reduce((sum, h) => sum + parseFloat(h.estimatedCost), 0);
  const totalCompleted = displayHazards.filter(h => h.status === 'VERIFIED_CLOSED').length;

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Municipal Inspection Telemetry Recorded" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Betaflight-Style Command Header Banner */}
      <div 
        style={{ 
          background: 'rgba(18, 24, 36, 0.92)', 
          border: '1px solid var(--border-medium)', 
          padding: '12px 18px', 
          borderRadius: 'var(--radius-md)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--amber)', letterSpacing: 1 }}>
              SMART CITY CIVIC COMMAND & AUTONOMOUS DISPATCH
            </span>
            <span style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: '0.65rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
              MONSOON RED ALERT ACTIVE
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>
            Continuous aerial AI detection feeds autonomous municipal work orders, materials pricing & SLA tracking.
          </div>
        </div>

        <button 
          onClick={handleGenerateReport} 
          className="btn btn-primary"
          style={{ fontSize: '0.75rem', padding: '6px 14px' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Export Work Order Dossier (CSV)
        </button>
      </div>

      {/* KPI Overview Row */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Selected Ward Budget</span>
          <div className="kpi-value" style={{ color: 'var(--green)' }}>
            ₹{Math.round(totalEstBudget).toLocaleString('en-IN')}
          </div>
          <span className="kpi-trend">Material & Repair Cost</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Active Tickets</span>
          <div className="kpi-value" style={{ color: 'var(--amber)' }}>
            {displayHazards.length}
          </div>
          <span className="kpi-trend">Field remediation work orders</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Verified Closed</span>
          <div className="kpi-value" style={{ color: 'var(--green)' }}>
            {totalCompleted}
          </div>
          <span className="kpi-trend">Proof-of-work inspected</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">SLA Compliance Rate</span>
          <div className="kpi-value" style={{ color: 'var(--cyan)' }}>
            {displayHazards.length > 0 ? `${Math.round(((displayHazards.length - displayHazards.filter(h => h.isCriticalSLA).length) / displayHazards.length) * 100)}%` : '100%'}
          </div>
          <span className="kpi-trend">Response time benchmark</span>
        </div>
      </div>

      {/* Ward Filtering & Leaderboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14 }}>
        <div className="bf-fieldset">
          <div className="bf-badge-title">ZONE FILTER & JURISDICTION</div>
          <div style={{ marginTop: 8 }}>
            <label className="form-label">Active Municipal Ward</label>
            <select 
              value={selectedWard} 
              onChange={(e) => setSelectedWard(e.target.value)}
              className="form-select"
            >
              {WARDS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>

            <div style={{ marginTop: 14, padding: '10px 12px', background: 'rgba(10, 14, 22, 0.8)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', textTransform: 'uppercase', fontWeight: 800 }}>
                Selected Ward Projected Cost
              </div>
              <div style={{ fontSize: '1.4rem', fontFamily: 'var(--font-mono)', fontWeight: 900, color: 'var(--green)', marginTop: 2 }}>
                ₹{totalEstBudget.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Calculated dynamically from 3D surface footprint and volume
              </div>
            </div>
          </div>
        </div>

        <div className="bf-fieldset">
          <div className="bf-badge-title">MUNICIPAL ZONE LEADERBOARD</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 8 }}>
            {leaderboard.map(lb => (
              <div 
                key={lb.ward} 
                style={{ 
                  background: 'rgba(10, 14, 22, 0.8)', 
                  padding: '10px 12px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-primary)', fontWeight: 800 }}>
                  {lb.ward}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--danger)' }}>{lb.pending} Pending</span>
                  <span style={{ color: 'var(--green)' }}>{lb.resolved} Fixed</span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${(lb.resolved + lb.pending) > 0 ? (lb.resolved / (lb.resolved + lb.pending)) * 100 : 0}%`, 
                      height: '100%', 
                      background: 'var(--green)' 
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Work Order Ticketing System */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          TACTICAL WORK ORDERS & CONTRACTOR DISPATCH ({displayHazards.length})
        </div>

        <div className="table-wrap" style={{ maxHeight: 520, marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Hazard & Geolocation</th>
                <th>SLA Deadline</th>
                <th>Est. Repair Budget</th>
                <th>Contractor Assignment</th>
                <th>Proof of Work Verification</th>
              </tr>
            </thead>
            <tbody>
              {displayHazards.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-faint)' }}>
                    No pending work orders recorded for {selectedWard}
                  </td>
                </tr>
              ) : (
                displayHazards.map((h, i) => (
                  <tr key={i} style={{ background: h.status === 'VERIFIED_CLOSED' ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                    <td>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--amber)' }}>
                        {h.hazard_id || h.track_id}
                      </div>
                    </td>
                    <td>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                        {(CONFIG.TYPE_LABELS[h.class_name] || h.class_name).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {h.location?.latitude?.toFixed(5)}, {h.location?.longitude?.toFixed(5)} · {h.ward}
                      </div>
                    </td>
                    <td>
                      {h.status === 'VERIFIED_CLOSED' ? (
                        <span style={{ color: 'var(--green)', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          VERIFIED CLOSED
                        </span>
                      ) : h.status === 'PENDING_AUDIT' ? (
                        <span style={{ 
                          background: 'rgba(255, 184, 0, 0.15)', 
                          color: 'var(--amber)', 
                          padding: '3px 8px', 
                          borderRadius: 4, 
                          fontSize: '0.7rem', 
                          fontWeight: 800, 
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid rgba(255, 184, 0, 0.4)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1s infinite' }} />
                          PENDING AUDIT
                        </span>
                      ) : (
                        <span style={{ 
                          background: h.isCriticalSLA ? 'rgba(239,68,68,0.2)' : 'rgba(255,184,0,0.15)', 
                          color: h.isCriticalSLA ? '#f87171' : 'var(--amber)', 
                          padding: '3px 8px', 
                          borderRadius: 4, 
                          fontSize: '0.72rem', 
                          fontWeight: 800, 
                          fontFamily: 'var(--font-mono)',
                          border: `1px solid ${h.isCriticalSLA ? 'rgba(239,68,68,0.4)' : 'rgba(255,184,0,0.3)'}`
                        }}>
                          {h.slaHours}h Remaining
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ color: 'var(--green)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                        ₹{parseFloat(h.estimatedCost).toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)' }}>
                        {(h.area_m2 ?? h.surface_area_m2) != null ? `${Number(h.area_m2 ?? h.surface_area_m2).toFixed(1)} m²` : (h.area_px != null ? `${Math.round(h.area_px)} px²` : '—')} ({h.material})
                      </div>
                    </td>
                    <td>
                      <select 
                        value={h.contractor}
                        onChange={(e) => handleAssign(h.hazard_id || h.track_id, e.target.value)}
                        disabled={!isAdmin || h.status === 'VERIFIED_CLOSED'}
                        className="form-select"
                        title={!isAdmin ? "Contractor assignment is restricted to Municipal Administrators" : "Assign municipal contractor"}
                        style={{ 
                          padding: '4px 8px', 
                          fontSize: '0.75rem', 
                          width: 'auto',
                          opacity: !isAdmin ? 0.75 : 1,
                          cursor: !isAdmin ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {CONTRACTORS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td>
                      {h.status === 'VERIFIED_CLOSED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ color: 'var(--green)', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            COMMISSIONER SIGN-OFF
                          </span>
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-faint)' }}>
                            Audit Passed · Verified
                          </span>
                        </div>
                      ) : h.status === 'PENDING_AUDIT' ? (
                        isAdmin ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span>📸</span> Proof Submitted by Inspector
                            </div>
                            <button 
                              onClick={() => handleAdminApprove(h.hazard_id || h.track_id)}
                              className="btn btn-primary"
                              style={{ 
                                padding: '4px 10px', 
                                fontSize: '0.7rem', 
                                background: 'linear-gradient(135deg, #ffb800, #f59e0b)',
                                color: '#000',
                                fontWeight: 800
                              }}
                              title="Authorize final municipal audit and mark ticket verified"
                            >
                              ✔ SIGN-OFF & APPROVE
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1s infinite' }} />
                              Awaiting Commissioner Audit
                            </span>
                            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                              Remediation photo under review
                            </span>
                          </div>
                        )
                      ) : (
                        <button 
                          onClick={() => handleUploadProof(h.hazard_id || h.track_id)} 
                          className="btn btn-outline" 
                          style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                          title={isAdmin ? "Upload proof photo and authorize closure" : "Upload field remediation evidence photo"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                          {isAdmin ? 'Upload & Sign-Off' : 'Upload Proof (Submit)'}
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
