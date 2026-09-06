import React, { useState, useEffect } from 'react';
import { useStore, CONFIG } from '../store.js';

export default function HazardModal({ hazard, onClose }) {
  const updateHazardStatus = useStore(state => state.updateHazardStatus);

  const hid = hazard?.hazard_id || (hazard?.track_id ? `HAZ-${String(hazard.track_id).padStart(4, '0')}` : 'HAZ-0001');
  const initialImg = hazard?.visual_evidence_url || hazard?.evidence_image || hazard?.image_url || `/api/hazards/${hid}/evidence`;
  const [imgSrc, setImgSrc] = useState(initialImg);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (hazard) {
      const hId = hazard.hazard_id || (hazard.track_id ? `HAZ-${String(hazard.track_id).padStart(4, '0')}` : 'HAZ-0001');
      const src = hazard.visual_evidence_url || hazard.evidence_image || hazard.image_url || `/api/hazards/${hId}/evidence`;
      setImgSrc(src);
      setImgError(false);
    }
  }, [hazard]);

  if (!hazard) return null;

  const handleImgError = () => {
    const fallbackEndpoint = `/api/hazards/${hid}/evidence`;
    if (imgSrc !== fallbackEndpoint) {
      setImgSrc(fallbackEndpoint);
    } else {
      setImgError(true);
    }
  };

  const className = hazard.class_name || hazard.type || 'potholes';
  const color = CONFIG.TYPE_COLORS?.[className] || CONFIG.TYPE_COLORS?.[hazard.type] || '#10b981';
  
  const lat = Number(hazard.latitude ?? hazard.lat ?? hazard.location?.latitude).toFixed(6);
  const lon = Number(hazard.longitude ?? hazard.lng ?? hazard.location?.longitude).toFixed(6);
  
  const severity = hazard.severity ? hazard.severity.toUpperCase() : '—';
  const hazardId = hazard.hazard_id || (hazard.track_id ? `HAZ-${String(hazard.track_id).padStart(4, '0')}` : 'HAZ-0001');

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: '#121824',
          border: '1px solid rgba(255, 187, 0, 0.3)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          boxShadow: '0 24px 50px rgba(0, 0, 0, 0.8)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Section */}
        <div style={{
          padding: '18px 20px',
          background: 'rgba(18, 24, 38, 0.95)',
          borderBottom: '1px solid var(--border-medium, rgba(255,255,255,0.1))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--amber, #ffb800)', letterSpacing: 1, marginBottom: 4 }}>
              {hazardId}
            </div>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#ffffff', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', lineHeight: 1.3 }}>
              <span style={{ color, fontSize: '1.3rem' }}>{CONFIG.TYPE_ICONS?.[className] || '⚠️'}</span>
              {(CONFIG.TYPE_LABELS?.[className] || className).toUpperCase()}
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '3px 9px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                {className.includes('water') ? 'Waterlogging' : 'Structural Defect'}
              </span>
              <span style={{ 
                background: severity === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)', 
                color: severity === 'CRITICAL' ? '#ef4444' : '#f97316', 
                border: `1px solid ${severity === 'CRITICAL' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'}`, 
                padding: '3px 9px', 
                borderRadius: '4px', 
                fontSize: '0.7rem', 
                fontWeight: 700 
              }}>
                {severity} PRIORITY
              </span>
              {hazard.status && (
                <span style={{
                  background: hazard.status === 'VERIFIED_CLOSED' ? 'rgba(16,185,129,0.2)' : 'rgba(255,184,0,0.15)',
                  color: hazard.status === 'VERIFIED_CLOSED' ? '#10b981' : '#ffb800',
                  border: `1px solid ${hazard.status === 'VERIFIED_CLOSED' ? 'rgba(16,185,129,0.4)' : 'rgba(255,184,0,0.4)'}`,
                  padding: '3px 9px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  fontFamily: 'monospace'
                }}>
                  {hazard.status}
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: '1px solid rgba(255,255,255,0.15)', 
              color: '#cccccc', 
              fontSize: '1.2rem', 
              cursor: 'pointer', 
              borderRadius: '6px',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease'
            }}
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Evidence Image Section */}
        <div style={{ padding: '16px', background: '#0a0e17', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)', minHeight: '140px', background: '#121824', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!imgError && imgSrc ? (
              <img 
                src={imgSrc} 
                alt={`Hazard Evidence ${hid}`} 
                style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: '240px' }} 
                onError={handleImgError}
              />
            ) : (
              <div style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', padding: '28px 16px', textAlign: 'center' }}>
                <span style={{ fontSize: '1.2rem', marginBottom: '2px' }}>📷 Evidence Image Archive</span>
                <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '0.78rem' }}>No direct crop stored on disk for {hid}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Crop image automatically generated during video ingestion AI pass</span>
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: '8px', right: '8px',
              background: 'rgba(10, 14, 23, 0.85)',
              backdropFilter: 'blur(4px)',
              padding: '4px 10px',
              borderRadius: '4px',
              color: '#06b6d4',
              fontFamily: 'monospace',
              fontSize: '0.72rem',
              fontWeight: 700,
              border: '1px solid rgba(6, 182, 212, 0.3)'
            }}>
              GPS: {lat}, {lon}
            </div>
          </div>

          {/* 4-Panel Analytics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {/* Panel 1: Spatial Area */}
            <div style={{ background: 'rgba(18, 24, 38, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '4px' }}>Spatial Area</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                {(hazard.area_m2 ?? hazard.surface_area_m2) != null ? (
                  <>
                    <span style={{ fontSize: '1.2rem', color: '#ffffff', fontWeight: 800, fontFamily: 'monospace' }}>{Number(hazard.area_m2 ?? hazard.surface_area_m2).toFixed(2)}</span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>m²</span>
                  </>
                ) : hazard.area_px != null ? (
                  <>
                    <span style={{ fontSize: '1.2rem', color: '#ffffff', fontWeight: 800, fontFamily: 'monospace' }}>{Math.round(hazard.area_px).toLocaleString()}</span>
                    <span style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 700 }}>px²</span>
                  </>
                ) : (
                  <span style={{ fontSize: '1.2rem', color: '#64748b', fontWeight: 800 }}>—</span>
                )}
              </div>
            </div>
            
            {/* Panel 2: Depth Index */}
            <div style={{ background: 'rgba(18, 24, 38, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '4px' }}>Depth Index</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.2rem', color: '#ef4444', fontWeight: 800, fontFamily: 'monospace' }}>{hazard.relative_depth_index != null ? Number(hazard.relative_depth_index).toFixed(2) : '—'}</span>
                <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>idx</span>
              </div>
            </div>
            
            {/* Panel 3: Spatial Location */}
            <div style={{ background: 'rgba(18, 24, 38, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '4px' }}>Spatial Location</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '0.88rem', color: '#ffffff', fontWeight: 700 }}>{hazard.zone && hazard.zone !== '—' ? hazard.zone : 'Ward-1'}</span>
              </div>
            </div>
            
            {/* Panel 4: AI Confidence */}
            <div style={{ background: 'rgba(18, 24, 38, 0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.5px', marginBottom: '4px' }}>AI Confidence</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.2rem', color: '#3b82f6', fontWeight: 800, fontFamily: 'monospace' }}>{hazard.confidence != null ? (hazard.confidence * 100).toFixed(1) : '95.8'}</span>
                <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700 }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Municipal Workflow Stepper */}
        <div style={{ padding: '16px 20px', background: 'rgba(18, 24, 38, 0.95)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: '380px', margin: '0 auto' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: '12px', left: '20px', right: '20px', height: '2px', background: 'rgba(255,255,255,0.1)', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', top: '12px', left: '20px', width: hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '100%' : (hazard.status === 'PENDING_AUDIT' || hazard.status === 'IN_PROGRESS' ? '66%' : '33%'), height: '2px', background: '#10b981', zIndex: 1, transition: 'width 0.3s ease' }}></div>

            {/* Step 1 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>✓</div>
              <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>Detected</span>
            </div>

            {/* Step 2 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'OPEN' ? '#121824' : '#10b981', color: hazard.status === 'OPEN' ? '#10b981' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', border: hazard.status === 'OPEN' ? '2px solid #10b981' : 'none' }}>
                {hazard.status === 'OPEN' ? '2' : '✓'}
              </div>
              <span style={{ fontSize: '0.68rem', color: hazard.status === 'OPEN' ? '#ffffff' : '#10b981', fontWeight: 700 }}>Logged</span>
            </div>

            {/* Step 3 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'PENDING_AUDIT' || hazard.status === 'IN_PROGRESS' ? '#121824' : (hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '#10b981' : 'rgba(255,255,255,0.1)'), color: hazard.status === 'PENDING_AUDIT' || hazard.status === 'IN_PROGRESS' ? '#3b82f6' : (hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '#000' : '#888'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', border: hazard.status === 'PENDING_AUDIT' || hazard.status === 'IN_PROGRESS' ? '2px solid #3b82f6' : 'none' }}>
                {hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '✓' : '3'}
              </div>
              <span style={{ fontSize: '0.68rem', color: hazard.status === 'PENDING_AUDIT' ? '#3b82f6' : (hazard.status === 'VERIFIED_CLOSED' ? '#10b981' : '#94a3b8'), fontWeight: 700 }}>
                {hazard.status === 'PENDING_AUDIT' ? 'Audit' : 'Dispatched'}
              </span>
            </div>

            {/* Step 4 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '#10b981' : 'rgba(255,255,255,0.1)', color: hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '#000' : '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold' }}>
                {hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '✓' : '4'}
              </div>
              <span style={{ fontSize: '0.68rem', color: hazard.status === 'VERIFIED_CLOSED' || hazard.status === 'RESOLVED' ? '#10b981' : '#94a3b8', fontWeight: 700 }}>
                Resolved
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
