import React from 'react';
import { useStore, CONFIG } from '../store.js';

export default function HazardModal({ hazard, onClose }) {
  const updateHazardStatus = useStore(state => state.updateHazardStatus);
  if (!hazard) return null;

  const className = hazard.class_name || hazard.type || 'potholes';
  const color = CONFIG.TYPE_COLORS?.[className] || CONFIG.TYPE_COLORS?.[hazard.type] || '#10b981';
  
  const lat = Number(hazard.latitude ?? hazard.lat ?? hazard.location?.latitude).toFixed(6);
  const lon = Number(hazard.longitude ?? hazard.lng ?? hazard.location?.longitude).toFixed(6);
  
  const severity = hazard.severity ? hazard.severity.toUpperCase() : '—';
  
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 99999,
      padding: '20px'
    }}>
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '500px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header / Top: Status Pill Tags */}
        <div style={{
          padding: '16px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color }}>{CONFIG.TYPE_ICONS?.[className] || '⚠️'}</span>
              {(CONFIG.TYPE_LABELS?.[className] || className).toUpperCase()}
            </h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                {className.includes('water') ? 'Waterlogging' : 'Structural Defect'}
              </span>
              <span style={{ background: severity === 'CRITICAL' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)', color: severity === 'CRITICAL' ? '#ef4444' : '#f97316', border: `1px solid ${severity === 'CRITICAL' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'}`, padding: '4px 10px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600 }}>
                {severity} PRIORITY
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#999', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        {/* Middle: Snapshot evidence & 4-Panel Grid */}
        <div style={{ padding: '16px', background: '#111', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ position: 'relative', width: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333', minHeight: '150px', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {hazard.visual_evidence_url ? (
              <img src={hazard.visual_evidence_url} alt="Hazard Evidence Snapshot" style={{ width: '100%', display: 'block', objectFit: 'cover', maxHeight: '200px' }} />
            ) : (
              <div style={{ color: '#666', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>📷</span> No evidence image available
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: '8px', right: '8px',
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              padding: '6px 12px',
              borderRadius: '4px',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              GPS: {lat}, {lon}
            </div>
          </div>

          {/* CivicPulse-Inspired 4-Panel UI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {/* Panel 1: Spatial Area */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>Spatial Area</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                {(hazard.area_m2 ?? hazard.surface_area_m2) != null ? (
                  <>
                    <span style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 700 }}>{Number(hazard.area_m2 ?? hazard.surface_area_m2).toFixed(2)}</span>
                    <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>m²</span>
                  </>
                ) : hazard.area_px != null ? (
                  <>
                    <span style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 700 }}>{Math.round(hazard.area_px).toLocaleString()}</span>
                    <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 600 }}>px²</span>
                  </>
                ) : (
                  <span style={{ fontSize: '1.25rem', color: 'var(--text-faint)', fontWeight: 700 }}>—</span>
                )}
              </div>
            </div>
            
            {/* Panel 2: Depth Index */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>Depth Index</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.25rem', color: '#ef4444', fontWeight: 700 }}>{hazard.relative_depth_index != null ? Number(hazard.relative_depth_index).toFixed(2) : '—'}</span>
                <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>idx</span>
              </div>
            </div>
            
            {/* Panel 3: Spatial Location */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>Spatial Location</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>{hazard.zone && hazard.zone !== '—' ? hazard.zone : '—'}</span>
              </div>
            </div>
            
            {/* Panel 4: AI Confidence */}
            <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px', marginBottom: '4px' }}>AI Confidence</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '1.25rem', color: '#3b82f6', fontWeight: 700 }}>{hazard.confidence != null ? (hazard.confidence * 100).toFixed(1) : '—'}</span>
                <span style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600 }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Municipal Workflow Stepper */}
        <div style={{ padding: '20px 16px', background: '#1a1a1a', borderTop: '1px solid #333' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', maxWidth: '350px', margin: '0 auto' }}>
            {/* Connecting line */}
            <div style={{ position: 'absolute', top: '12px', left: '20px', right: '20px', height: '2px', background: '#333', zIndex: 0 }}></div>
            <div style={{ position: 'absolute', top: '12px', left: '20px', width: hazard.status === 'RESOLVED' ? '100%' : (hazard.status === 'IN_PROGRESS' ? '66%' : '33%'), height: '2px', background: '#10b981', zIndex: 1, transition: 'width 0.3s ease' }}></div>

            {/* Step 1 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>✓</div>
              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Detected</span>
            </div>

            {/* Step 2 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'OPEN' ? '#1a1a1a' : '#10b981', color: hazard.status === 'OPEN' ? '#10b981' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', border: hazard.status === 'OPEN' ? '2px solid #10b981' : 'none' }}>
                {hazard.status === 'OPEN' ? '2' : '✓'}
              </div>
              <span style={{ fontSize: '0.7rem', color: hazard.status === 'OPEN' ? '#fff' : '#10b981', fontWeight: 600 }}>Logged</span>
            </div>

            {/* Step 3 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: hazard.status === 'OPEN' ? 'pointer' : 'default' }} onClick={() => hazard.status === 'OPEN' && updateHazardStatus(hazard.hazard_id, 'IN_PROGRESS')}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'IN_PROGRESS' ? '#1a1a1a' : (hazard.status === 'RESOLVED' ? '#10b981' : '#333'), color: hazard.status === 'IN_PROGRESS' ? '#10b981' : (hazard.status === 'RESOLVED' ? '#000' : '#888'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', border: hazard.status === 'IN_PROGRESS' ? '2px solid #10b981' : 'none' }}>
                {hazard.status === 'RESOLVED' ? '✓' : '3'}
              </div>
              <span style={{ fontSize: '0.7rem', color: hazard.status === 'IN_PROGRESS' ? '#fff' : (hazard.status === 'RESOLVED' ? '#10b981' : '#888'), fontWeight: hazard.status === 'IN_PROGRESS' ? 600 : 'normal' }}>
                {hazard.status === 'OPEN' ? <u style={{ color: '#3b82f6' }}>Dispatch</u> : 'Dispatched'}
              </span>
            </div>

            {/* Step 4 */}
            <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', cursor: hazard.status === 'IN_PROGRESS' ? 'pointer' : 'default' }} onClick={() => hazard.status === 'IN_PROGRESS' && updateHazardStatus(hazard.hazard_id, 'RESOLVED')}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: hazard.status === 'RESOLVED' ? '#1a1a1a' : '#333', color: hazard.status === 'RESOLVED' ? '#10b981' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold', border: hazard.status === 'RESOLVED' ? '2px solid #10b981' : 'none' }}>
                4
              </div>
              <span style={{ fontSize: '0.7rem', color: hazard.status === 'RESOLVED' ? '#fff' : '#888', fontWeight: hazard.status === 'RESOLVED' ? 600 : 'normal' }}>
                {hazard.status === 'IN_PROGRESS' ? <u style={{ color: '#10b981' }}>Resolve</u> : 'Resolved'}
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
