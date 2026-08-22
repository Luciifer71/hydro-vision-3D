import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import { useStore, CONFIG } from '../store.js';
import HazardMap from './HazardMap.jsx';

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
      x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 } } },
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

function severityFromArea(a) {
  a = Number(a) || 0;
  if (a >= 75) return 'CRITICAL'; if (a >= 25) return 'HIGH'; if (a >= 5) return 'MODERATE'; return 'LOW';
}

export default function AnalyzeView() {
  const { hazards, timelineHistory, riskHistory, currentState } = useStore();

  const timelineData = {
    labels: timelineHistory.map(d => d.time),
    datasets: [{
      label: 'Active Hazards', data: timelineHistory.map(d => d.count),
      borderColor: '#ffbb00', backgroundColor: 'rgba(255,187,0,0.1)',
      borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0,
    }],
  };

  const sevCounts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  hazards.forEach(h => { const s = h.severity || severityFromArea(h.surface_area_m2); if (sevCounts[s] !== undefined) sevCounts[s]++; });
  const sevData = {
    labels: ['Low', 'Moderate', 'High', 'Critical'],
    datasets: [{ data: [sevCounts.LOW, sevCounts.MODERATE, sevCounts.HIGH, sevCounts.CRITICAL], backgroundColor: ['#00cc00', '#ffbb00', '#ff8800', '#cc0000'], borderWidth: 0 }],
  };

  const typeCounts = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
  hazards.forEach(h => { if (typeCounts[h.type] !== undefined) typeCounts[h.type]++; });
  const typeData = {
    labels: ['Pothole', 'Water Body', 'Crack', 'Flooding'],
    datasets: [{ data: [typeCounts.pothole, typeCounts.water_body, typeCounts.crack, typeCounts.flooding], backgroundColor: ['rgba(204,0,0,0.7)', 'rgba(255,187,0,0.7)', 'rgba(255,136,0,0.7)', 'rgba(170,85,255,0.7)'], borderColor: ['#cc0000', '#ffbb00', '#ff8800', '#aa55ff'], borderWidth: 1, borderRadius: 3 }],
  };

  const riskData = {
    labels: riskHistory.map(d => d.time),
    datasets: [{ label: 'Risk Score', data: riskHistory.map(d => d.score), borderColor: '#ff8800', backgroundColor: 'rgba(255,136,0,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 0 }],
  };

  const riskLevel = currentState?.summary?.overall_risk || 'LOW';
  const totalArea = currentState?.summary?.total_area_m2 || 0;
  const riskScore = currentState?.summary?.risk_score || 1;

  const sevColors = { LOW: '#00cc00', MODERATE: '#ffbb00', HIGH: '#ff8800', CRITICAL: '#cc0000' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* KPI Row */}
      <div className="kpi-grid">
        {[
          { label: 'Active Hazards', value: currentState?.summary?.active_hazards || 0 },
          { label: 'Total Affected Area', value: `${totalArea.toFixed(1)} m²` },
          { label: 'Overall Risk', value: riskLevel, color: sevColors[riskLevel] },
          { label: 'Active Alerts', value: currentState?.summary?.alert_count || 0 },
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
          <span className="card-title">Hazard Detection Timeline</span>
          <span className="card-badge badge-live">● Live</span>
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
              {[['Low','#00cc00'],['Mod','#ffbb00'],['High','#ff8800'],['Crit','#cc0000']].map(([l,c]) => (
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
                data={{ datasets: [{ data: [riskScore * 25, 100 - riskScore * 25], backgroundColor: [sevColors[riskLevel], 'rgba(255,255,255,0.05)'], borderWidth: 0, circumference: 240, rotation: 240 }] }}
                options={{ cutout: '78%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, events: [] }}
              />
              <div className="gauge-center">
                <div className="gauge-val" style={{ color: sevColors[riskLevel] }}>{riskScore * 25}</div>
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
            <span className="card-badge badge-live">● Live</span>
          </div>
          <HazardMap />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Live Hazard Feed</span>
            <span className="card-badge badge-live">● Streaming</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 380 }}>
            <table className="data-table">
              <thead><tr><th>Time</th><th>Type</th><th>Location</th><th>Area m²</th><th>Conf.</th><th>Severity</th></tr></thead>
              <tbody>
                {[...hazards].sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0)).slice(0, 15).map((h, i) => {
                  const area = Number(h.surface_area_m2) || 0;
                  const sev = (h.severity || 'LOW').toLowerCase();
                  const lat = h.location?.latitude, lon = h.location?.longitude;
                  const t = h.timestamp ? new Date(h.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '--:--:--';
                  return (
                    <tr key={`${h.track_id}-${i}`}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#666' }}>{t}</td>
                      <td><span className={`type-badge ${h.type}`}>{CONFIG.TYPE_ICONS[h.type]} {CONFIG.TYPE_LABELS[h.type]}</span></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#666' }}>
                        {typeof lat === 'number' ? lat.toFixed(4) : '—'}, {typeof lon === 'number' ? lon.toFixed(4) : '—'}
                      </td>
                      <td>{area.toFixed(2)}</td>
                      <td>{((h.confidence ?? 1) * 100).toFixed(1)}%</td>
                      <td><span className={`sev-badge ${sev}`}>{sev.toUpperCase()}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Risk Timeline */}
      <div className="card">
        <div className="card-header"><span className="card-title">Risk Score Over Time</span></div>
        <div className="card-body">
          <div className="chart-wrap">
            <Line data={riskData} options={{ ...CHART_OPTS.timeline, scales: { ...CHART_OPTS.timeline.scales, y: { ...CHART_OPTS.timeline.scales.y, max: 100 } } }} />
          </div>
        </div>
      </div>
    </div>
  );
}
