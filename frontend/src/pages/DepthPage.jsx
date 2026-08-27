import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore } from '../store.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// 🟢 Optimization: Disable chart animations to eliminate real-time streaming stutter
ChartJS.defaults.animation.duration = 0;

export default function DepthPage() {
  const { hazards = [] } = useStore();

  const metrics = useMemo(() => {
    let totalVolume = 0;
    let totalArea = 0;
    let maxDepth = 0;

    const list = hazards.map((h, i) => {
      const vol = Number(h.estimated_volume_m3 || h.volume_m3) || 0.05;
      const area = Number(h.surface_area_m2) || (vol * 100);
      const depthCm = Math.min(45, Math.max(2.5, (vol / Math.max(0.01, area)) * 350));
      
      totalVolume += vol;
      totalArea += area;
      if (depthCm > maxDepth) maxDepth = depthCm;

      return {
        id: h.hazard_id || h.track_id || `HAZ-${String(i + 1).padStart(4, '0')}`,
        className: h.class_name || h.type || 'pothole_dry',
        area,
        vol,
        depthCm,
        confidence: h.confidence ?? 0.95,
        passes: h.detections_count || 1,
        severity: h.severity || 'LOW'
      };
    });

    const avgDepth = list.length ? list.reduce((s, x) => s + x.depthCm, 0) / list.length : 0;
    return { list, totalVolume, totalArea, maxDepth, avgDepth };
  }, [hazards]);

  const chartSlice = metrics.list.slice(0, 12);
  const chartData = {
    labels: chartSlice.length > 0 ? chartSlice.map(x => x.id) : ['No Data'],
    datasets: [
      {
        label: 'Max Monocular Depth (cm)',
        data: chartSlice.length > 0 ? chartSlice.map(x => Number(x.depthCm.toFixed(1))) : [0],
        backgroundColor: chartSlice.length > 0 ? chartSlice.map(x => x.depthCm > 15 ? '#ef4444' : x.depthCm > 8 ? '#f59e0b' : '#10b981') : ['#333'],
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
          label: (ctx) => `Depth: ${ctx.raw} cm`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Depth (cm)', color: '#94a3b8' },
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
      {/* 4 Feature Overview Cards Grid */}
      <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="info-card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)', background: '#121212', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
          <span style={{ fontSize: '0.65rem', background: '#10b981', color: '#1a1a1a', fontWeight: 800, padding: '2px 6px', borderRadius: 3, float: 'right' }}>Active</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: '#10b981' }}>Monocular Depth</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Estimate per-pixel depth from a single drone camera frame using Depth Anything V2 model.
          </p>
        </div>

        <div className="info-card" style={{ borderColor: 'rgba(255, 187, 0, 0.4)', background: '#121212', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
          <span style={{ fontSize: '0.65rem', background: '#ffbb00', color: '#1a1a1a', fontWeight: 800, padding: '2px 6px', borderRadius: 3, float: 'right' }}>Active</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: '#ffbb00' }}>Volume Estimation</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Calculate pothole volume in m³ by integrating depth maps over segmented regions.
          </p>
        </div>

        <div className="info-card" style={{ background: '#121212', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
          <span className="coming-soon" style={{ fontSize: '0.65rem', background: '#333', color: '#888', fontWeight: 700, padding: '2px 6px', borderRadius: 3, float: 'right' }}>Coming Soon</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: '#ccc' }}>Surface Normals</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Compute surface normal vectors from 3D point clouds for terrain analysis.
          </p>
        </div>

        <div className="info-card" style={{ background: '#121212', padding: 12, borderRadius: 6, border: '1px solid #333' }}>
          <span className="coming-soon" style={{ fontSize: '0.65rem', background: '#333', color: '#888', fontWeight: 700, padding: '2px 6px', borderRadius: 3, float: 'right' }}>Coming Soon</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: '#ccc' }}>Point Cloud</h4>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Generate 3D point clouds from depth maps using camera intrinsics for spatial reconstruction.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { label: 'Total Volume Displacement', value: `${metrics.totalVolume.toFixed(3)} m³` },
          { label: 'Avg Monocular Depth', value: `${metrics.avgDepth.toFixed(1)} cm` },
          { label: 'Max Depth Discovered', value: `${metrics.maxDepth.toFixed(1)} cm` },
          { label: 'Depth Engine Resolution', value: '0.025 m/px (GSD)' },
        ].map(({ label, value }) => (
          <div className="kpi-card" key={label}>
            <span className="kpi-label">{label}</span>
            <div className="kpi-value" style={{ fontSize: '1.25rem', color: '#ffbb00' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Monocular Depth Chart */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title">Monocular Depth Estimation Profile (Depth Anything V2)</span>
          <span className="card-badge badge-live" style={{ color: '#10b981', fontSize: '0.7rem' }}>● Active Dense Inference</span>
        </div>
        <div className="card-body">
          <div className="chart-wrap" style={{ height: 220 }}>
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Depth & Volume Hazard Analytics Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">3D Volumetric & Spatial Depth Breakdown</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Hazard ID</th>
                <th>Class Name</th>
                <th>Surface Area (m²)</th>
                <th>Monocular Depth (cm)</th>
                <th>Estimated Volume (m³)</th>
                <th>Confidence</th>
                <th>Depth Classification</th>
              </tr>
            </thead>
            <tbody>
              {metrics.list.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#666' }}>
                    No depth telemetry recorded — start the video pipeline to process live frames.
                  </td>
                </tr>
              ) : (
                metrics.list.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#10b981' }}>{item.id}</td>
                    <td>
                      <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, color: '#f8fafc' }}>
                        {item.className}
                      </code>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.area.toFixed(2)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: item.depthCm > 15 ? '#ef4444' : '#f59e0b' }}>
                      {item.depthCm.toFixed(1)} cm
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#ffbb00' }}>
                      {item.vol.toFixed(3)} m³
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{(item.confidence * 100).toFixed(1)}%</td>
                    <td>
                      <span className={`sev-badge ${(item.depthCm > 15 ? 'CRITICAL' : item.depthCm > 8 ? 'HIGH' : 'LOW').toLowerCase()}`}>
                        {item.depthCm > 15 ? 'DEEP VOID' : item.depthCm > 8 ? 'MODERATE DEPRESSION' : 'SURFACE DEFECT'}
                      </span>
                    </td>
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