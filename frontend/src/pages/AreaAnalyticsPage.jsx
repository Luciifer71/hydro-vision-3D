import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// 🟢 Optimization: Disable chart animations to eliminate real-time stuttering
ChartJS.defaults.animation.duration = 0;

export default function AreaAnalyticsPage() {
  const { hazards = [], currentState } = useStore();

  if (!currentState) return <EmptySessionState message="No Spatial Area Data Available" />;

  const metrics = useMemo(() => {
    let totalArea = 0;
    let maxArea = 0;

    const classStats = {};

    hazards.forEach(h => {
      const cls = h.class_name || h.type || 'unknown';
      const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
      
      if (area != null) {
        totalArea += area;
        if (area > maxArea) maxArea = area;
      }

      if (!classStats[cls]) {
        classStats[cls] = { count: 0, totalArea: 0, maxArea: 0 };
      }

      classStats[cls].count += 1;
      if (area != null) {
        classStats[cls].totalArea += area;
        if (area > classStats[cls].maxArea) classStats[cls].maxArea = area;
      }
    });

    const avgArea = hazards.length ? totalArea / hazards.length : 0;

    return { totalArea, maxArea, avgArea, classStats };
  }, [hazards]);

  const classKeys = Object.keys(metrics.classStats);
  const barData = {
    labels: classKeys.length > 0 ? classKeys.map(k => CONFIG.TYPE_LABELS?.[k] || k) : ['No Data'],
    datasets: [
      {
        label: 'Total Area (m²)',
        data: classKeys.length > 0 ? classKeys.map(k => Number(metrics.classStats[k].totalArea.toFixed(1))) : [0],
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
          label: (ctx) => `Area: ${ctx.raw} m²`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Area (m²)', color: '#94a3b8' },
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
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Total Surface Area', value: `${metrics.totalArea.toFixed(1)} m²` },
          { label: 'Avg Area / Hazard', value: `${metrics.avgArea.toFixed(1)} m²` },
          { label: 'Max Individual Area', value: `${metrics.maxArea.toFixed(1)} m²` },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.25rem', color: '#ffbb00' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Area Distribution Chart */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Spatial Area Displacement by Hazard Classification (m²)</span>
        </div>
        <div className="card-body">
          <div className="chart-wrap" style={{ height: 220 }}>
            <Bar data={barData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Area Breakdown Table */}
      <div className="card">
        <div className="card-header"><span className="card-title">Detailed Area Breakdown</span></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Detections</th>
                <th>Total Area (m²)</th>
                <th>Avg Area (m²)</th>
                <th>Max Area (m²)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.classStats).length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 30, color: '#666' }}>
                    No spatial area data available — start the video pipeline to stream telemetry.
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
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ffbb00' }}>{stat.totalArea.toFixed(1)} m²</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{(stat.totalArea / stat.count).toFixed(1)} m²</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{stat.maxArea.toFixed(1)} m²</td>
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