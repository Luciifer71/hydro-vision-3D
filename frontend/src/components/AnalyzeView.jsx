import React from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useStore, CONFIG } from '../store.js';
import HazardMap from './HazardMap.jsx';
import { computeSessionRisk } from '../lib/derive.js';
import ErrorBoundary from './ErrorBoundary.jsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Title, Tooltip, Legend, Filler);

ChartJS.defaults.color = '#94a3b8';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.05)';
ChartJS.defaults.font.family = "'Inter', sans-serif";
ChartJS.defaults.plugins.legend.display = false;
ChartJS.defaults.animation.duration = 400;
ChartJS.defaults.responsive = true;
ChartJS.defaults.maintainAspectRatio = false;

const CHART_OPTS = {
  timeline: {
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10, family: 'monospace' } } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10, family: 'monospace' } } },
    },
    plugins: { 
      legend: { display: false }, 
      tooltip: { 
        backgroundColor: 'rgba(10,14,22,0.95)', 
        cornerRadius: 6,
        borderColor: 'rgba(255,184,0,0.4)',
        borderWidth: 1,
        titleFont: { family: 'monospace' },
        bodyFont: { family: 'monospace' }
      } 
    },
    interaction: { intersect: false, mode: 'index' },
  },
  donut: {
    cutout: '72%',
    plugins: { 
      legend: { display: false }, 
      tooltip: { 
        backgroundColor: 'rgba(10,14,22,0.95)', 
        cornerRadius: 6,
        borderColor: 'rgba(255,184,0,0.4)',
        borderWidth: 1
      } 
    },
  },
  bar: {
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10, family: 'monospace' } } },
      y: { grid: { display: false }, ticks: { font: { size: 10, family: 'monospace' } } },
    },
    plugins: { legend: { display: false } },
  },
};

export default function AnalyzeView() {
  const { timelineHistory = [], riskHistory = [], currentState, hazards = [], streamRunning } = useStore();

  // Timeline chart dataset
  const timelineData = {
    labels: timelineHistory.length > 0 ? timelineHistory.map(d => d.time) : ['00:00'],
    datasets: [{
      label: 'Active Hazards',
      data: timelineHistory.length > 0 ? timelineHistory.map(d => d.count) : [0],
      borderColor: '#ffb800',
      backgroundColor: 'rgba(255,184,0,0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#ffb800',
    }],
  };

  // Severity counts
  const sevCounts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  hazards.forEach(h => { 
    const s = h.severity && h.severity !== '—' ? h.severity.toUpperCase() : null;
    if (s && sevCounts[s] !== undefined) sevCounts[s]++; 
  });
  
  const sevData = {
    labels: ['Low', 'Moderate', 'High', 'Critical'],
    datasets: [{
      data: [sevCounts.LOW, sevCounts.MODERATE, sevCounts.HIGH, sevCounts.CRITICAL],
      backgroundColor: ['#10b981', '#ffb800', '#f97316', '#ef4444'],
      borderWidth: 0,
    }],
  };

  const typeKeys = Object.keys(CONFIG.TYPE_LABELS || {});
  const typeCounts = {};
  typeKeys.forEach(k => { typeCounts[k] = 0; });

  hazards.forEach(h => {
    let typeStr = (h.class_name || h.type || 'unknown').toLowerCase();
    let matchedKey = typeKeys.includes(typeStr) ? typeStr : typeKeys.find(k => typeStr.includes(k));
    
    if (matchedKey) {
      typeCounts[matchedKey]++;
    } else {
      typeCounts['unknown'] = (typeCounts['unknown'] || 0) + 1;
      if (!typeKeys.includes('unknown')) {
        typeKeys.push('unknown');
        CONFIG.TYPE_LABELS['unknown'] = 'Unknown';
      }
    }
  });

  const typeData = {
    labels: typeKeys.map(k => CONFIG.TYPE_LABELS[k]),
    datasets: [{
      data: typeKeys.map(k => typeCounts[k]),
      backgroundColor: typeKeys.map(k => CONFIG.TYPE_COLORS[k] || 'rgba(255,184,0,0.7)'),
      borderColor: typeKeys.map(k => CONFIG.TYPE_COLORS[k] || '#ffb800'),
      borderWidth: 1,
      borderRadius: 4
    }],
  };

  const riskData = {
    labels: riskHistory.length > 0 ? riskHistory.map(d => d.time) : ['00:00'],
    datasets: [{
      label: 'Risk Score',
      data: riskHistory.length > 0 ? riskHistory.map(d => d.score) : [0],
      borderColor: '#f97316',
      backgroundColor: 'rgba(249,115,22,0.12)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#f97316',
    }],
  };

  // Derived metrics
  const totalArea = hazards.reduce((acc, curr) => acc + (Number(curr.surface_area_m2) || 0), 0);
  const summary = currentState?.summary || {};
  
  const { riskScore, riskLevel } = computeSessionRisk(hazards, summary);
  const riskScoreDisplay = riskScore;
  const sevColors = { LOW: '#10b981', MODERATE: '#ffb800', HIGH: '#f97316', CRITICAL: '#ef4444' };

  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "MUNICIPAL BRIEF - SESSION REPORT\r\n";
    csvContent += `Total Hazards,${hazards.length}\r\n`;
    csvContent += `Total Area Affected (m2),${totalArea.toFixed(2)}\r\n`;
    csvContent += `Session Risk Level,${riskLevel}\r\n\r\n`;
    csvContent += "ID,Type,Latitude,Longitude,Area (m2),Confidence (%),Severity\r\n";
    
    hazards.forEach((h, i) => {
      const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
      const sev = h.severity ? h.severity.toUpperCase() : '—';
      const loc = h.location || {};
      const lat = loc.latitude ?? h.latitude ?? 0;
      const lon = loc.longitude ?? h.longitude ?? 0;
      const formattedType = (h.class_name || h.type || 'unknown').replace('_', ' ').toUpperCase();
      const conf = h.confidence != null ? (h.confidence * 100).toFixed(1) : '—';
      const id = h.hazard_id || `HAZ-${i}`;
      csvContent += `${id},${formattedType},${lat.toFixed(6)},${lon.toFixed(6)},${area != null ? area.toFixed(2) : '—'},${conf},${sev}\r\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `municipal_brief_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSessionBundle = () => {
    if (!currentState?.session_id) return alert("No active session to download.");
    window.open(`/api/sessions/${currentState.session_id}/download`, '_blank');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Betaflight-Style Top Session Action Strip */}
      <div 
        style={{ 
          background: 'rgba(18, 24, 36, 0.9)', 
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
          <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--amber)', letterSpacing: 1, textTransform: 'uppercase' }}>
            {streamRunning ? 'PROCESSING LIVE STREAM TELEMETRY' : 'MISSION COMPLETE — POST-INSPECTION ANALYTICS'}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {streamRunning ? '● Active AI dual perception engine extracting infrastructure hazards...' : '✔ AI analysis finalized. Spatial footprints, volume estimation, and risk vectors locked.'}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={exportToCSV}
            className="btn btn-primary"
            style={{ fontSize: '0.75rem', padding: '6px 14px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Municipal Brief (CSV)
          </button>

          <button
            onClick={downloadSessionBundle}
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '6px 14px', borderColor: 'var(--cyan)', color: 'var(--cyan)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Mission Archive
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid">
        {[
          { label: 'Recorded Hazards', value: hazards.length },
          { label: 'Cumulative Footprint', value: `${totalArea.toFixed(1)} m²` },
          { label: 'Session Threat Level', value: riskLevel, color: sevColors[riskLevel] },
          { label: 'Action Alerts', value: summary.alert_count || hazards.length },
        ].map(({ label, value, color }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Timeline Chart */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          HAZARD DETECTION TIMELINE
        </div>
        <div className="chart-wrap" style={{ marginTop: 8 }}>
          <ErrorBoundary name="Timeline Chart">
            <Line data={timelineData} options={CHART_OPTS.timeline} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Charts Row */}
      <div className="chart-row">
        <div className="bf-fieldset">
          <div className="bf-badge-title">SEVERITY RATIO</div>
          <div className="chart-wrap sm" style={{ position: 'relative', marginTop: 8 }}>
            <ErrorBoundary name="Severity Doughnut">
              <Doughnut data={sevData} options={CHART_OPTS.donut} />
            </ErrorBoundary>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{hazards.length}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', letterSpacing: 1 }}>TOTAL</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 10 }}>
            {[['Low','#10b981'],['Mod','#ffb800'],['High','#f97316'],['Crit','#ef4444']].map(([l,c]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}
              </div>
            ))}
          </div>
        </div>

        <div className="bf-fieldset">
          <div className="bf-badge-title">HAZARD CLASSIFICATION</div>
          <div className="chart-wrap sm" style={{ marginTop: 8 }}>
            <ErrorBoundary name="Classification Bar">
              <Bar data={typeData} options={CHART_OPTS.bar} />
            </ErrorBoundary>
          </div>
        </div>

        <div className="bf-fieldset">
          <div className="bf-badge-title">RISK SCORE INDEX</div>
          <div className="chart-wrap sm" style={{ position: 'relative', marginTop: 8 }}>
            <ErrorBoundary name="Risk Gauge">
              <Doughnut
                data={{ datasets: [{ data: [riskScoreDisplay, 100 - riskScoreDisplay], backgroundColor: [sevColors[riskLevel], 'rgba(255,255,255,0.05)'], borderWidth: 0, circumference: 240, rotation: 240 }] }}
                options={{ cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, events: [] }}
              />
            </ErrorBoundary>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
              <div style={{ fontSize: '2rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: sevColors[riskLevel] }}>
                {riskScoreDisplay}
              </div>
              <span className={`sev-badge ${riskLevel.toLowerCase()}`}>{riskLevel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map + Recorded Hazard Log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="bf-fieldset">
          <div className="bf-badge-title">GIS SPATIAL PROJECTION</div>
          <div style={{ marginTop: 8, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <ErrorBoundary name="GIS Map">
              <HazardMap />
            </ErrorBoundary>
          </div>
        </div>

        <div className="bf-fieldset">
          <div className="bf-badge-title">RECORDED HAZARD LEDGER</div>
          <div className="table-wrap" style={{ maxHeight: 380, marginTop: 8 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Classification</th>
                  <th>Coordinates</th>
                  <th>Area</th>
                  <th>Conf.</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {hazards.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-faint)', padding: '28px' }}>
                      No hazard telemetry recorded yet. Ingest video or connect stream.
                    </td>
                  </tr>
                ) : (
                  [...hazards].map((h, i) => {
                    const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
                    const sev = (h.severity || 'LOW').toLowerCase();
                    const loc = h.location || {};
                    const lat = loc.latitude ?? h.latitude;
                    const lon = loc.longitude ?? h.longitude;
                    const formattedType = (h.class_name || h.type || 'unknown').replace('_', ' ').toUpperCase();

                    return (
                      <tr key={`${h.hazard_id || i}-${i}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--amber)', fontWeight: 700 }}>
                          {h.hazard_id || `HAZ-${i}`}
                        </td>
                        <td>
                          <span className="type-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            {formattedType}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {typeof lat === 'number' ? lat.toFixed(4) : '—'}, {typeof lon === 'number' ? lon.toFixed(4) : '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          {area != null ? `${area.toFixed(2)} m²` : '—'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                          {h.confidence != null ? `${(h.confidence * 100).toFixed(1)}%` : '—'}
                        </td>
                        <td>
                          <span className={`sev-badge ${sev}`}>
                            {sev.toUpperCase()}
                          </span>
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

      {/* Temporal Risk Dynamics Chart */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">TEMPORAL THREAT & RISK CURVE</div>
        <div className="chart-wrap" style={{ height: 180, marginTop: 8 }}>
          <ErrorBoundary name="Risk Timeline Chart">
            <Line data={riskData} options={{ ...CHART_OPTS.timeline, scales: { ...CHART_OPTS.timeline.scales, y: { ...CHART_OPTS.timeline.scales.y, max: 100 } } }} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}