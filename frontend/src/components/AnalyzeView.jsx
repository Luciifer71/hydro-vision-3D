import React from 'react';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useStore, CONFIG } from '../store.js';
import HazardMap from './HazardMap.jsx';
import { computeSessionRisk } from '../lib/derive.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, BarElement, Title, Tooltip, Legend, Filler);

ChartJS.defaults.color = '#888';
ChartJS.defaults.borderColor = 'rgba(255,255,255,0.04)';
ChartJS.defaults.font.family = "'Segoe UI', sans-serif";
ChartJS.defaults.plugins.legend.display = false;
ChartJS.defaults.animation.duration = 400;
ChartJS.defaults.responsive = true;
ChartJS.defaults.maintainAspectRatio = false;

const CHART_OPTS = {
  timeline: {
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10 } } },
    },
    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(30,30,30,0.95)', cornerRadius: 4 } },
    interaction: { intersect: false, mode: 'index' },
  },
  donut: {
    cutout: '70%',
    plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(30,30,30,0.95)', cornerRadius: 4 } },
  },
  bar: {
    indexAxis: 'y',
    scales: {
      x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10 } } },
      y: { grid: { display: false }, ticks: { font: { size: 10 } } },
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
      borderColor: '#ffbb00',
      backgroundColor: 'rgba(255,187,0,0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 2,
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
      backgroundColor: ['#10b981', '#ffbb00', '#ff8800', '#cc0000'],
      borderWidth: 0,
    }],
  };

  const typeKeys = Object.keys(CONFIG.TYPE_LABELS || {});
  const typeCounts = {};
  typeKeys.forEach(k => { typeCounts[k] = 0; });

  hazards.forEach(h => {
    let typeStr = (h.class_name || h.type || 'unknown').toLowerCase();
    
    // Exact match fallback to robust matching
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
      backgroundColor: typeKeys.map(k => CONFIG.TYPE_COLORS[k] || 'rgba(255,187,0,0.7)'),
      borderColor: typeKeys.map(k => CONFIG.TYPE_COLORS[k] || '#ffbb00'),
      borderWidth: 1,
      borderRadius: 3
    }],
  };

  const riskData = {
    labels: riskHistory.length > 0 ? riskHistory.map(d => d.time) : ['00:00'],
    datasets: [{
      label: 'Risk Score',
      data: riskHistory.length > 0 ? riskHistory.map(d => d.score) : [0],
      borderColor: '#ff8800',
      backgroundColor: 'rgba(255,136,0,0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 2,
    }],
  };

  // Derived metrics
  const totalArea = hazards.reduce((acc, curr) => acc + (Number(curr.surface_area_m2) || 0), 0);
  const summary = currentState?.summary || {};
  
  const { riskScore, riskLevel } = computeSessionRisk(hazards, summary);
  const riskScoreDisplay = riskScore;

  const sevColors = { LOW: '#10b981', MODERATE: '#ffbb00', HIGH: '#ff8800', CRITICAL: '#cc0000' };

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Session Summary Banner */}
      <div style={{ background: '#1e1e1e', border: '1px solid #333', padding: '10px 15px', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ffbb00', letterSpacing: 1 }}>
            {streamRunning ? 'PROCESSING STREAM TELEMETRY' : 'MISSION COMPLETE — POST-VIDEO ANALYSIS REPORT'}
          </span>
          <div style={{ fontSize: '0.65rem', color: '#888', marginTop: 2 }}>
            {streamRunning ? '● Active AI pipeline analyzing drone footage...' : '✔ Video analysis finished. All spatial markers, volumes, and severity logs locked below.'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={exportToCSV}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#1a1a1a',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export Municipal Brief
          </button>
          <button
            onClick={downloadSessionBundle}
            style={{
              background: 'transparent',
              color: '#3b82f6',
              border: '1px solid #3b82f6',
              padding: '6px 14px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download Session Bundle
          </button>
          <div style={{ 
            fontSize: '0.7rem', 
            fontFamily: 'var(--font-mono)', 
            background: streamRunning ? 'rgba(16,185,129,0.15)' : 'rgba(255,187,0,0.15)', 
            color: streamRunning ? '#10b981' : '#ffbb00', 
            padding: '3px 10px', 
            borderRadius: 4, 
            border: streamRunning ? '1px solid #10b981' : '1px solid #ffbb00' 
          }}>
            {streamRunning ? 'RECORDING' : 'REPORT READY'}
          </div>
        </div>
      </div>

      {/* Session Replay Player */}
      {!streamRunning && currentState?.session_id && (
        <div className="card" style={{ marginTop: '4px', marginBottom: '10px' }}>
          <div className="card-header"><span className="card-title">Session Replay</span></div>
          <div className="card-body" style={{ display: 'flex', justifyContent: 'center', background: '#000', padding: 0, borderRadius: '0 0 6px 6px', overflow: 'hidden' }}>
            <video 
              controls 
              src={`/api/sessions/${currentState.session_id}/annotated.mp4`}
              style={{ width: '100%', maxHeight: '400px', objectFit: 'contain' }}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="kpi-grid">
        {[
          { label: 'Total Recorded Hazards', value: hazards.length },
          { label: 'Cumulative Area', value: `${totalArea.toFixed(1)} m²` },
          { label: 'Session Risk Level', value: riskLevel, color: sevColors[riskLevel] },
          { label: 'Active Alerts', value: summary.alert_count || hazards.length },
        ].map(({ label, value, color }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ color: color || '#e0e0e0' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Timeline Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Session Hazard Detection Timeline</span>
          <span className="card-badge badge-live">● Persistent Log</span>
        </div>
        <div className="card-body"><div className="chart-wrap"><Line data={timelineData} options={CHART_OPTS.timeline} /></div></div>
      </div>

      {/* Charts Row */}
      <div className="chart-row">
        <div className="card">
          <div className="card-header"><span className="card-title">Severity Distribution</span></div>
          <div className="card-body">
            <div className="chart-wrap sm" style={{ position: 'relative' }}>
              <Doughnut data={sevData} options={CHART_OPTS.donut} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{hazards.length}</div>
                <div style={{ fontSize: '0.6rem', color: '#666' }}>TOTAL</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 6 }}>
              {[['Low','#10b981'],['Mod','#ffbb00'],['High','#ff8800'],['Crit','#cc0000']].map(([l,c]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: '#777' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Hazard Classification</span></div>
          <div className="card-body"><div className="chart-wrap sm"><Bar data={typeData} options={CHART_OPTS.bar} /></div></div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Risk Score Gauge</span></div>
          <div className="card-body">
            <div className="chart-wrap sm" style={{ position: 'relative' }}>
              <Doughnut
                data={{ datasets: [{ data: [riskScoreDisplay, 100 - riskScoreDisplay], backgroundColor: [sevColors[riskLevel], 'rgba(255,255,255,0.05)'], borderWidth: 0, circumference: 240, rotation: 240 }] }}
                options={{ cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, events: [] }}
              />
              <div className="gauge-center">
                <div className="gauge-val" style={{ color: sevColors[riskLevel] }}>{riskScoreDisplay}</div>
                <span className={`sev-badge ${riskLevel.toLowerCase()}`}>{riskLevel}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">GIS Hazard Map</span>
            <span className="card-badge badge-live">● Session Logged</span>
          </div>
          <HazardMap />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Recorded Hazard Log</span>
            <span className="card-badge badge-live">● Complete History</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            <table className="data-table">
              <thead><tr><th>ID</th><th>Type</th><th>Location</th><th>Area m²</th><th>Conf.</th><th>Severity</th></tr></thead>
              <tbody>
                {hazards.length === 0 ? (
                  <tr><td colSpan="6" style={{ textAlign: 'center', color: '#666', padding: '20px' }}>No session data recorded yet. Upload video to begin tracking.</td></tr>
                ) : (
                  [...hazards].map((h, i) => {
                    const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
                    const sev = h.severity ? h.severity.toLowerCase() : '—';
                    const loc = h.location || {};
                    const lat = loc.latitude ?? h.latitude;
                    const lon = loc.longitude ?? h.longitude;
                    const formattedType = (h.class_name || h.type || 'unknown').replace('_', ' ').toUpperCase();

                    return (
                      <tr key={`${h.hazard_id || i}-${i}`}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ffbb00' }}>{h.hazard_id || `HAZ-${i}`}</td>
                        <td><span className="type-badge" style={{ backgroundColor: '#222' }}>{formattedType}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#666' }}>
                          {typeof lat === 'number' ? lat.toFixed(4) : '—'}, {typeof lon === 'number' ? lon.toFixed(4) : '—'}
                        </td>
                        <td>{area != null ? area.toFixed(2) : '—'}</td>
                        <td>{h.confidence != null ? (h.confidence * 100).toFixed(1) + '%' : '—'}</td>
                        <td><span className={sev !== '—' ? `sev-badge ${sev}` : 'type-badge'}>{sev !== '—' ? sev.toUpperCase() : '—'}</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Risk Timeline */}
      <div className="card">
        <div className="card-header"><span className="card-title">Risk Score Over Time (Session Trend)</span></div>
        <div className="card-body">
          <div className="chart-wrap">
            <Line data={riskData} options={{ ...CHART_OPTS.timeline, scales: { ...CHART_OPTS.timeline.scales, y: { ...CHART_OPTS.timeline.scales.y, max: 100 } } }} />
          </div>
        </div>
      </div>
    </div>
  );
}