import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore, CONFIG } from '../store.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// 🟢 Optimization: Disable chart animations to eliminate real-time stuttering
ChartJS.defaults.animation.duration = 0;

export default function VolumetricsPage() {
  const { hazards = [] } = useStore();

  const metrics = useMemo(() => {
    let totalArea = 0;
    let totalVolume = 0;
    let maxArea = 0;

    const classStats = {};

    hazards.forEach(h => {
      const cls = h.class_name || h.type || 'pothole_dry';
      const vol = Number(h.estimated_volume_m3 || h.volume_m3) || 0.05;
      const area = Number(h.surface_area_m2) || (vol * 8.5);

      totalArea += area;
      totalVolume += vol;
      if (area > maxArea) maxArea = area;

      if (!classStats[cls]) {
        classStats[cls] = { count: 0, totalArea: 0, totalVolume: 0, maxArea: 0 };
      }

      classStats[cls].count += 1;
      classStats[cls].totalArea += area;
      classStats[cls].totalVolume += vol;
      if (area > classStats[cls].maxArea) classStats[cls].maxArea = area;
    });

    const avgArea = hazards.length ? totalArea / hazards.length : 0;
    const avgVolume = hazards.length ? totalVolume / hazards.length : 0;

    return { totalArea, totalVolume, maxArea, avgArea, avgVolume, classStats };
  }, [hazards]);

  const classKeys = Object.keys(metrics.classStats);
  const barData = {
    labels: classKeys.length > 0 ? classKeys.map(k => CONFIG.TYPE_LABELS?.[k] || k) : ['No Data'],
    datasets: [
      {
        label: 'Total Volume (m³)',
        data: classKeys.length > 0 ? classKeys.map(k => Number(metrics.classStats[k].totalVolume.toFixed(3))) : [0],
        backgroundColor: classKeys.length > 0 ? classKeys.map(k => CONFIG.TYPE_COLORS?.[k] || '#10b981') : ['#333'],
        borderRadius: 4,
      }
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Volume: ${ctx.raw} m³`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Volume (m³)', color: '#94a3b8' },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* KPI Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total Volumetric Capacity', value: `${metrics.totalVolume.toFixed(3)} m³` },
          { label: 'Total Surface Area', value: `${metrics.totalArea.toFixed(2)} m²` },
          { label: 'Avg Area / Hazard', value: `${metrics.avgArea.toFixed(2)} m²` },
          { label: 'Avg Volume / Hazard', value: `${metrics.avgVolume.toFixed(3)} m³` },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.25rem', color: '#ffbb00' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Volume Distribution Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Volumetric Displacement by Hazard Classification (m³)</span>
        </div>
        <div className="card-body">
          <div className="chart-wrap" style={{ height: 220 }}>
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* GSD Model Info */}
      <div className="card">
        <div className="card-header"><span className="card-title">Ground Sample Distance (GSD) & Depth Integration</span></div>
        <div className="card-body">
          <div className="formula" style={{ background: '#1e293b', padding: '10px 14px', borderRadius: 6, fontFamily: 'var(--font-mono)', color: '#10b981', fontSize: '0.85rem' }}>
            Volume (m³) = Σ [ Depth(x, y) × GSD_x × GSD_y × cos(Gimbal_Tilt) ]
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 }}>
            Real-world volumetric calculations combine monocular depth maps with drone sensor intrinsics. At 25m flight altitude, each pixel represents 0.025m (2.5cm) on the ground. Voxel volume is calculated frame-by-frame using camera gimbal tilt angle correction.
          </p>
        </div>
      </div>

      {/* Volumetric Breakdown Table */}
      <div className="card">
        <div className="card-header"><span className="card-title">Detailed Volumetric & Area Breakdown</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Detections</th>
                <th>Total Area (m²)</th>
                <th>Total Volume (m³)</th>
                <th>Avg Volume (m³)</th>
                <th>Max Area (m²)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.classStats).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#666' }}>
                    No volumetric data available — start the video pipeline to stream telemetry.
                  </td>
                </tr>
              ) : (
                Object.entries(metrics.classStats).map(([cls, stat]) => (
                  <tr key={cls}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ background: CONFIG.TYPE_COLORS?.[cls] || '#10b981', color: '#fff', padding: '1px 6px', borderRadius: 3, fontSize: '10px', fontWeight: 700 }}>
                          {CONFIG.TYPE_ICONS?.[cls] || 'DEFECT'}
                        </span>
                        <strong>{CONFIG.TYPE_LABELS?.[cls] || cls}</strong>
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{stat.count}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{stat.totalArea.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ffbb00' }}>{stat.totalVolume.toFixed(3)} m³</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{(stat.totalVolume / stat.count).toFixed(3)} m³</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{stat.maxArea.toFixed(2)} m²</td>
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