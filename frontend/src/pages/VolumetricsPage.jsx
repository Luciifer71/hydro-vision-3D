import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore, CONFIG } from '../store.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function VolumetricsPage() {
  const { hazards } = useStore();

  let totalArea = 0, largest = 0;
  const typeAreas = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
  const typeCounts = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
  const typeMax = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };

  hazards.forEach(h => {
    const area = Number(h.surface_area_m2) || 0;
    totalArea += area;
    if (area > largest) largest = area;
    if (typeAreas[h.type] !== undefined) {
      typeAreas[h.type] += area;
      typeCounts[h.type]++;
      if (area > typeMax[h.type]) typeMax[h.type] = area;
    }
  });

  const avgArea = hazards.length ? totalArea / hazards.length : 0;

  const barData = {
    labels: ['Pothole', 'Water Body', 'Crack', 'Flooding'],
    datasets: [{
      label: 'Total Area (m²)',
      data: [typeAreas.pothole, typeAreas.water_body, typeAreas.crack, typeAreas.flooding],
      backgroundColor: ['#ef4444', '#00d4ff', '#f59e0b', '#a855f7'],
      borderRadius: 4,
    }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          { label: 'Total Surface Area', value: `${totalArea.toFixed(2)} m²` },
          { label: 'Avg Area / Hazard', value: `${avgArea.toFixed(2)} m²` },
          { label: 'Largest Hazard', value: `${largest.toFixed(2)} m²` },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.3rem' }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Area Distribution by Type</span></div>
        <div className="card-body">
          <div className="chart-wrap">
            <Bar data={barData} options={{ scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Ground Sample Distance (GSD)</span></div>
        <div className="card-body">
          <div className="formula">GSD = (altitude × sensor_width) / (focal_length × image_width)</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 }}>
            GSD determines the real-world size of each pixel. At 25m altitude with a 6.4mm sensor and 4.0mm focal length,
            each pixel represents approximately 0.025m on the ground. Surface area is corrected for the 45° camera tilt using cosine compensation.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Area Breakdown per Type</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Type</th><th>Count</th><th>Total Area (m²)</th><th>Avg Area (m²)</th><th>Max Area (m²)</th></tr></thead>
            <tbody>
              {Object.entries(typeAreas).map(([type, area]) => (
                <tr key={type}>
                  <td><span className={`type-badge ${type}`}>{CONFIG.TYPE_ICONS[type]} {CONFIG.TYPE_LABELS[type]}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{typeCounts[type]}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{area.toFixed(2)}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{typeCounts[type] ? (area / typeCounts[type]).toFixed(2) : '0.00'}</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>{typeMax[type].toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
