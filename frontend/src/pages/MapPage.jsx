import React, { useState, useEffect } from 'react';
import HazardMap from '../components/HazardMap.jsx';
import { useStore } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

export default function MapPage() {
  const { hazards = [], currentState, fetchGeoJsonHazards } = useStore();
  const [currentTime, setCurrentTime] = useState('');

  // Auto-fetch hazards if none loaded yet
  useEffect(() => {
    if (hazards.length === 0 && fetchGeoJsonHazards) {
      fetchGeoJsonHazards();
    }
  }, []);

  // Live ticking clock for tracking telemetry updates
  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const validAreas = hazards.map(h => h.area_m2 ?? h.surface_area_m2).filter(a => a != null);
  const totalArea = validAreas.reduce((s, a) => s + Number(a), 0);
  const coverageAreaText = validAreas.length > 0 ? `${totalArea.toFixed(2)} m²` : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      {/* KPI Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Total Markers', value: hazards.length },
          { label: 'Coverage Area', value: coverageAreaText },
          { label: 'Last Updated', value: currentTime || '—' },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.2rem', color: '#ffbb00' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* GIS Hazard Map Container */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 350 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">GIS Hazard Map — Vadodara</span>
          <span className="card-badge badge-live" style={{ color: '#10b981', fontSize: '0.7rem' }}>● Live Streaming</span>
        </div>
        <div style={{ flex: 1, position: 'relative', minHeight: 300, width: '100%' }}>
          <ErrorBoundary name="Interactive GIS Map">
            <HazardMap fullpage />
          </ErrorBoundary>
        </div>
      </div>

      {/* Map Legend */}
      <div className="card" style={{ flexShrink: 0 }}>
        <div className="card-header"><span className="card-title">Map Legend</span></div>
        <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>HAZARD TYPES (GeoJSON)</div>
            {[
              ['#ef4444','Potholes'],
              ['#3b82f6','Waterlogging Area'],
              ['#dc2626','Open Manhole'],
              ['#8b5cf6','Drainage Overflow'],
              ['#f97316','Damaged Footpath'],
            ].map(([c,l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
                <span style={{ fontSize: '0.78rem' }}>{l}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, letterSpacing: 1 }}>SEVERITY THRESHOLDS</div>
            {[['low','LOW','< 5 m²'],['moderate','MODERATE','5 – 25 m²'],['high','HIGH','25 – 75 m²'],['critical','CRITICAL','≥ 75 m²']].map(([cls, label, range]) => (
              <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className={`sev-badge ${cls}`}>{label}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}