import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';
import HazardModal from '../components/HazardModal.jsx';

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
  const { 
    hazards = [], 
    currentSessionHazards = [], 
    allHazards = [], 
    currentState, 
    updateHazardStatus, 
    currentUser, 
    fetchSupabaseHazardsHistory,
    syncHazardsToSupabase
  } = useStore();
  const isAdmin = currentUser?.role === 'admin';
  const isEmployee = currentUser?.role === 'employee';

  const [sessionScope, setSessionScope] = useState('current'); // 'current' (default) | 'all'
  const [selectedWard, setSelectedWard] = useState(isEmployee && currentUser?.ward ? currentUser.ward : 'All Wards');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHazardModal, setSelectedHazardModal] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  useEffect(() => {
    if (isEmployee && currentUser?.ward) {
      setSelectedWard(currentUser.ward);
    } else if (isAdmin) {
      setSelectedWard('All Wards');
    }
  }, [currentUser?.role, currentUser?.ward, isAdmin, isEmployee]);

  // Load historical hazards saved in Supabase Cloud on component mount
  useEffect(() => {
    fetchSupabaseHazardsHistory();
  }, [fetchSupabaseHazardsHistory]);

  const handleSyncSupabase = async () => {
    setIsSyncing(true);
    try {
      if (currentSessionHazards.length > 0) {
        await syncHazardsToSupabase();
      }
      await fetchSupabaseHazardsHistory();
    } finally {
      setIsSyncing(false);
    }
  };

  const [assignments, setAssignments] = useState({});
  const [uploadedPhotos, setUploadedPhotos] = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [activeUploadId, setActiveUploadId] = useState(null);
  const [selectedImageModal, setSelectedImageModal] = useState(null);
  const fileInputRef = useRef(null);

  const weatherAlert = true;

  const handleAssign = (id, contractor) => {
    if (!isAdmin) {
      alert('Permission Denied: Contractor dispatch and budgeting requires Municipal Administrator authorization.');
      return;
    }
    setAssignments(prev => ({ ...prev, [id]: contractor }));
  };

  const triggerUploadProof = (id) => {
    setActiveUploadId(id);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeUploadId) return;

    const previewUrl = URL.createObjectURL(file);
    const photoData = { url: previewUrl, name: file.name, timestamp: new Date().toLocaleTimeString() };
    
    setUploadedPhotos(prev => ({ ...prev, [activeUploadId]: photoData }));

    if (isAdmin) {
      updateHazardStatus(activeUploadId, 'VERIFIED_CLOSED', { verified_by: currentUser?.name });
    } else {
      updateHazardStatus(activeUploadId, 'PENDING_AUDIT', { submitted_by: currentUser?.name });
    }

    e.target.value = '';
  };

  const handleAdminApprove = (id) => {
    if (!isAdmin) return;
    updateHazardStatus(id, 'VERIFIED_CLOSED', { verified_by: currentUser?.name });
  };

  const handleAdminReject = (id) => {
    if (!isAdmin) return;
    const reason = window.prompt('Specify reason for rejecting remediation work:', 'Proof photo insufficient or repair unsatisfactory');
    if (reason === null || reason.trim() === '') return;

    setRejectionReasons(prev => ({ ...prev, [id]: reason }));
    updateHazardStatus(id, 'REJECTED', { rejected_by: currentUser?.name, rejection_reason: reason });
  };

  const handleGenerateReport = () => {
    if (displayHazards.length === 0) {
      alert("No tickets available to export.");
      return;
    }

    const headers = ['Ticket ID', 'Hazard Type', 'Coordinates', 'Ward', 'Registered At', 'SLA Remaining', 'Est. Cost (INR)', 'Material', 'Contractor', 'Status'];
    const rows = displayHazards.map(h => [
      h.hazard_id || h.track_id,
      h.class_name || 'unknown',
      `"${h.location?.latitude?.toFixed(5)}, ${h.location?.longitude?.toFixed(5)}"`,
      h.ward,
      `"${h.first_detected_ist || h.first_detected || '—'}"`,
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

  // Selected scope: Current Session vs All Sessions
  const activeHazardsList = useMemo(() => {
    if (sessionScope === 'current') {
      return currentSessionHazards;
    }
    return allHazards.length > 0 ? allHazards : hazards;
  }, [sessionScope, currentSessionHazards, allHazards, hazards]);

  // Enhance hazards with Municipal Data
  const enrichedHazards = useMemo(() => {
    return activeHazardsList.map(h => {
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
        hasProof: uploadedPhotos[h.hazard_id || h.track_id] || false,
        rejectionReason: rejectionReasons[h.hazard_id || h.track_id] || h.rejection_reason || null
      };
    });
  }, [activeHazardsList, assignments, uploadedPhotos, rejectionReasons, weatherAlert]);

  // Filter by Ward and Search Query
  const displayHazards = useMemo(() => {
    let list = enrichedHazards;
    if (selectedWard !== 'All Wards') {
      list = list.filter(h => h.ward === selectedWard);
    }
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(h => {
        const id = String(h.hazard_id || h.track_id || '').toLowerCase();
        const type = String(h.class_name || h.type || '').toLowerCase();
        const ward = String(h.ward || '').toLowerCase();
        return id.includes(q) || type.includes(q) || ward.includes(q);
      });
    }
    return list;
  }, [enrichedHazards, selectedWard, searchQuery]);

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

  // Defect Class Breakdown Data
  const classLeaderboard = useMemo(() => {
    const classKeys = [
      'potholes',
      'waterlogging_area',
      'open_manhole',
      'drainage_overflow',
      'damaged_footpath'
    ];
    const board = {};
    classKeys.forEach(k => {
      board[k] = { 
        label: CONFIG.TYPE_LABELS[k] || k, 
        color: CONFIG.TYPE_COLORS[k] || '#ffbb00', 
        pending: 0, 
        resolved: 0 
      };
    });

    enrichedHazards.forEach(h => {
      const cls = (h.class_name || h.type || '').toLowerCase();
      const matchedKey = classKeys.find(k => cls.includes(k) || k.includes(cls)) || 'potholes';
      if (!board[matchedKey]) {
        board[matchedKey] = {
          label: CONFIG.TYPE_LABELS[matchedKey] || (h.class_name || h.type || 'Other').toUpperCase(),
          color: CONFIG.TYPE_COLORS[matchedKey] || '#38bdf8',
          pending: 0,
          resolved: 0
        };
      }
      if (h.status === 'VERIFIED_CLOSED' || h.status === 'RESOLVED') {
        board[matchedKey].resolved++;
      } else {
        board[matchedKey].pending++;
      }
    });

    return Object.entries(board).map(([key, stats]) => ({ key, ...stats }));
  }, [enrichedHazards]);

  const totalEstBudget = displayHazards.reduce((sum, h) => sum + parseFloat(h.estimatedCost), 0);
  const totalCompleted = displayHazards.filter(h => h.status === 'VERIFIED_CLOSED').length;

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
            Continuous aerial AI detection & historical Supabase cloud records feed autonomous work orders, materials pricing & SLA tracking.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Session Scope Filter Dropdown */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            background: 'rgba(10, 14, 22, 0.95)', 
            padding: '5px 12px', 
            borderRadius: 'var(--radius-sm)', 
            border: '1px solid var(--border-medium)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
          }}>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 700, whiteSpace: 'nowrap' }}>
              Session View:
            </span>
            <select
              value={sessionScope}
              onChange={(e) => setSessionScope(e.target.value)}
              style={{
                background: '#0d131f',
                color: 'var(--amber, #ffbb00)',
                border: '1px solid rgba(255, 187, 0, 0.4)',
                borderRadius: 4,
                padding: '4px 8px',
                fontSize: '0.76rem',
                fontWeight: 800,
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              <option value="current" style={{ background: '#0d131f', color: '#ffbb00' }}>Current Session ({currentSessionHazards.length})</option>
              <option value="all" style={{ background: '#0d131f', color: '#ffbb00' }}>All Sessions ({allHazards.length > 0 ? allHazards.length : hazards.length})</option>
            </select>
          </div>

          <button 
            onClick={handleSyncSupabase} 
            disabled={isSyncing}
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '6px 14px', borderColor: 'var(--cyan)', color: 'var(--cyan)', opacity: isSyncing ? 0.7 : 1 }}
            title="Synchronize and repair all hazard records with Supabase Cloud"
          >
            {isSyncing ? '⏳ Syncing Cloud...' : '☁ Sync Supabase Cloud'}
          </button>
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
          <div className="bf-badge-title">CIVIC REMEDIATION & DEFECT MATRIX</div>
          
          {/* Jurisdictional Wards Breakdown */}
          <div style={{ marginTop: 6, marginBottom: 4, fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Jurisdiction Wards
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {leaderboard.map(lb => (
              <div 
                key={lb.ward} 
                style={{ 
                  background: 'rgba(10, 14, 22, 0.8)', 
                  padding: '8px 10px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5
                }}
              >
                <div style={{ fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {lb.ward}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
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

          {/* Defect Classes Breakdown */}
          <div style={{ marginTop: 10, marginBottom: 4, fontSize: '0.66rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Defect Classifications
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {classLeaderboard.map(cl => (
              <div 
                key={cl.key} 
                style={{ 
                  background: 'rgba(10, 14, 22, 0.8)', 
                  padding: '8px 10px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 5
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 800 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: cl.color, flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cl.label}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: 'var(--danger)' }}>{cl.pending} Pending</span>
                  <span style={{ color: 'var(--green)' }}>{cl.resolved} Fixed</span>
                </div>
                <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                  <div 
                    style={{ 
                      width: `${(cl.resolved + cl.pending) > 0 ? (cl.resolved / (cl.resolved + cl.pending)) * 100 : 0}%`, 
                      height: '100%', 
                      background: cl.color || 'var(--green)' 
                    }} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden File Input for Real Photo Upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="image/*" 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
      />

      {/* Proof Photo Modal Lightbox */}
      {selectedImageModal && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: 20, backdropFilter: 'blur(4px)'
          }}
          onClick={() => setSelectedImageModal(null)}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
            <img 
              src={selectedImageModal} 
              alt="Field Remediation Proof" 
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: 8, border: '2px solid var(--amber)', boxShadow: '0 8px 30px rgba(0,0,0,0.7)' }} 
            />
            <button 
              className="btn btn-outline" 
              style={{ 
                position: 'absolute', top: -15, right: -15, 
                background: '#121824', borderRadius: '50%', 
                width: 32, height: 32, padding: 0, 
                color: '#fff', fontSize: '1rem', fontWeight: 'bold'
              }}
              onClick={() => setSelectedImageModal(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Tactical Work Orders Table */}
      <div className="bf-fieldset">
        <div className="bf-badge-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span>TACTICAL WORK ORDERS & CONTRACTOR DISPATCH ({displayHazards.length})</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.85rem' }}>🔍</span>
            <input 
              type="text"
              placeholder="Search Ticket ID (e.g. HAZ-0004)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                background: 'rgba(10, 14, 22, 0.8)',
                border: '1px solid var(--border-medium, rgba(255,187,0,0.4))',
                borderRadius: '4px',
                color: '#ffffff',
                padding: '4px 10px',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono, monospace)',
                width: '230px',
                outline: 'none'
              }}
            />
          </div>
        </div>

        <div className="table-wrap" style={{ maxHeight: 520, marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Hazard & Geolocation</th>
                <th>Registered At</th>
                <th>SLA Deadline</th>
                <th>Est. Repair Budget</th>
                <th>Contractor Assignment</th>
                <th>Proof of Work Verification</th>
              </tr>
            </thead>
            <tbody>
              {displayHazards.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-faint)' }}>
                    No matching work orders found {searchQuery ? `for "${searchQuery}"` : `in ${selectedWard}`}
                  </td>
                </tr>
              ) : (
                displayHazards.map((h, i) => (
                  <tr key={i} style={{ background: h.status === 'VERIFIED_CLOSED' ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                    <td>
                      <div 
                        onClick={() => setSelectedHazardModal(h)}
                        style={{ 
                          fontFamily: 'var(--font-mono)', 
                          fontWeight: 800, 
                          color: 'var(--amber)', 
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                        title="Click to view full hazard modal popup with analytics & evidence photo"
                      >
                        <span style={{ fontSize: '0.7rem' }}>🔍</span> {h.hazard_id || h.track_id}
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
                      <div style={{ color: 'var(--text-primary)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
                        {h.first_detected_ist ? (
                          h.first_detected_ist
                        ) : h.first_detected ? (
                          new Date(h.first_detected).toLocaleString('en-IN', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                            hour12: false
                          })
                        ) : (
                          '—'
                        )}
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
                      ) : h.status === 'REJECTED' ? (
                        <span style={{ 
                          background: 'rgba(239, 68, 68, 0.15)', 
                          color: '#f87171', 
                          padding: '3px 8px', 
                          borderRadius: 4, 
                          fontSize: '0.7rem', 
                          fontWeight: 800, 
                          fontFamily: 'var(--font-mono)',
                          border: '1px solid rgba(239, 68, 68, 0.4)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                          REJECTED (RE-WORK)
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {h.hasProof?.url && (
                          <div 
                            style={{ position: 'relative', cursor: 'pointer' }}
                            onClick={() => setSelectedImageModal(h.hasProof.url)}
                            title="Click to expand proof photo"
                          >
                            <img 
                              src={h.hasProof.url} 
                              alt="Proof" 
                              style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--amber)' }} 
                            />
                            <div style={{ fontSize: '0.58rem', color: 'var(--cyan)', textAlign: 'center', marginTop: 1 }}>
                              View
                            </div>
                          </div>
                        )}
                        <div>
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
                                <div style={{ display: 'flex', gap: 6 }}>
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
                                    ✔ APPROVE & CLOSE
                                  </button>
                                  <button 
                                    onClick={() => handleAdminReject(h.hazard_id || h.track_id)}
                                    className="btn btn-outline"
                                    style={{ 
                                      padding: '4px 10px', 
                                      fontSize: '0.7rem', 
                                      borderColor: 'rgba(239, 68, 68, 0.6)',
                                      color: '#f87171',
                                      fontWeight: 800
                                    }}
                                    title="Disapprove work done and request re-upload with re-work"
                                  >
                                    ❌ DISAPPROVE / REJECT
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <span style={{ color: 'var(--amber)', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', animation: 'pulse 1s infinite' }} />
                                  Awaiting Commissioner Audit
                                </span>
                                <button
                                  onClick={() => triggerUploadProof(h.hazard_id || h.track_id)}
                                  className="btn btn-outline"
                                  style={{ padding: '3px 8px', fontSize: '0.65rem' }}
                                  title="Re-upload or replace proof photo"
                                >
                                  📷 Replace Photo
                                </button>
                              </div>
                            )
                          ) : h.status === 'REJECTED' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 210 }}>
                              <div style={{ 
                                background: 'rgba(239, 68, 68, 0.15)', 
                                border: '1px solid rgba(239, 68, 68, 0.4)', 
                                borderRadius: 6, 
                                padding: '8px 10px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4
                              }}>
                                <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#f87171', display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span>⚠️</span> REJECTION REASON FROM COMMISSIONER:
                                </div>
                                <div style={{ 
                                  fontSize: '0.72rem', 
                                  color: '#fca5a5', 
                                  fontWeight: 700, 
                                  fontStyle: 'italic', 
                                  background: 'rgba(0, 0, 0, 0.4)', 
                                  padding: '5px 8px', 
                                  borderRadius: 4,
                                  lineHeight: '1.2'
                                }}>
                                  "{h.rejectionReason || 'Proof photo insufficient or repair unsatisfactory'}"
                                </div>
                              </div>
                              <button 
                                onClick={() => triggerUploadProof(h.hazard_id || h.track_id)}
                                className="btn btn-primary"
                                style={{ 
                                  padding: '5px 12px', 
                                  fontSize: '0.7rem', 
                                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                  color: '#fff',
                                  fontWeight: 800,
                                  width: '100%'
                                }}
                                title="Re-upload remediation photo and re-submit for audit"
                              >
                                📸 Re-upload Proof & Re-submit
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => triggerUploadProof(h.hazard_id || h.track_id)} 
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
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hazard Popup Modal */}
      {selectedHazardModal && (
        <HazardModal 
          hazard={selectedHazardModal} 
          onClose={() => setSelectedHazardModal(null)} 
        />
      )}
    </div>
  );
}
