import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
ChartJS.defaults.animation.duration = 0;

export default function DepthPage() {
  const { hazards = [], currentState } = useStore();

  const metrics = useMemo(() => {
    let totalArea = 0;
    let maxDepthIndex = 0;
    let depthSum = 0;
    let depthCount = 0;

    const list = hazards.map((h, i) => {
      const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
      const depthIndex = h.relative_depth_index != null ? Number(h.relative_depth_index) : null;

      if (area != null) totalArea += area;
      if (depthIndex != null) {
        if (depthIndex > maxDepthIndex) maxDepthIndex = depthIndex;
        depthSum += depthIndex;
        depthCount++;
      }

      return {
        id: h.hazard_id || h.track_id || `HAZ-${String(i + 1).padStart(4, '0')}`,
        className: h.class_name || h.type || 'unknown',
        area,
        depthIndex,
        confidence: h.confidence != null ? h.confidence : null,
        passes: h.detections_count || 1,
        severity: h.severity || '—'
      };
    });

    const avgDepthIndex = depthCount > 0 ? depthSum / depthCount : 0;
    return { list, totalArea, maxDepthIndex, avgDepthIndex };
  }, [hazards]);

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Depth Telemetry Recorded" />;
  }

  const chartSlice = metrics.list.slice(0, 12);
  const chartData = {
    labels: chartSlice.length > 0 ? chartSlice.map(x => x.id) : ['No Data'],
    datasets: [
      {
        label: 'Relative Depth Index',
        data: chartSlice.length > 0 ? chartSlice.map(x => x.depthIndex != null ? Number(x.depthIndex.toFixed(3)) : 0) : [0],
        backgroundColor: chartSlice.length > 0 ? chartSlice.map(x => x.depthIndex != null && x.depthIndex > 0.7 ? '#ef4444' : (x.depthIndex != null && x.depthIndex > 0.4 ? '#f59e0b' : '#10b981')) : ['#333'],
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
        backgroundColor: 'rgba(10,14,22,0.95)',
        borderColor: 'rgba(255,184,0,0.4)',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `Depth Index: ${ctx.raw}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Relative Index', color: '#94a3b8', font: { family: 'monospace' } },
        grid: { color: 'rgba(255,255,255,0.05)' },
        ticks: { color: '#94a3b8', font: { family: 'monospace' } }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { family: 'monospace' } }
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 4 Feature Overview Cards Grid */}
      <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="info-card">
          <span style={{ fontSize: '0.62rem', background: 'var(--green)', color: '#061e14', fontWeight: 800, padding: '2px 8px', borderRadius: 4, float: 'right' }}>Active</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: 'var(--green)', textAlign: 'left', fontWeight: 800 }}>Relative Depth Index</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
            Estimates monocular depth from single drone frames using Depth Anything V2. Normalized unitless index (0.0 to 1.0).
          </p>
        </div>

        <div className="info-card">
          <span style={{ fontSize: '0.62rem', background: 'var(--amber)', color: '#0b0e14', fontWeight: 800, padding: '2px 8px', borderRadius: 4, float: 'right' }}>Active</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: 'var(--amber)', textAlign: 'left', fontWeight: 800 }}>Footprint & GSD Area</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
            Calculates real-world ground footprint in m² via camera focal length, sensor dimensions, and flight altitude.
          </p>
        </div>

        <div className="info-card">
          <span className="coming-soon">Next-Gen</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: 'var(--text-secondary)', textAlign: 'left', fontWeight: 800 }}>Surface Normals</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
            Extracts gradient slope vectors and road curvature angles for hydraulic run-off simulation.
          </p>
        </div>

        <div className="info-card">
          <span className="coming-soon">Next-Gen</span>
          <h4 style={{ fontSize: '0.88rem', marginBottom: 6, color: 'var(--text-secondary)', textAlign: 'left', fontWeight: 800 }}>Point Cloud Mesh</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'left' }}>
            Generates georeferenced 3D point clouds from multi-view drone telemetry for GIS CAD exports.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Cumulative Footprint</span>
          <div className="kpi-value" style={{ color: 'var(--amber)' }}>{metrics.totalArea.toFixed(1)} m²</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Average Depth Index</span>
          <div className="kpi-value" style={{ color: 'var(--cyan)' }}>{metrics.avgDepthIndex.toFixed(3)}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Maximum Hazard Depth</span>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>{metrics.maxDepthIndex.toFixed(3)}</div>
        </div>
        <div className="kpi-card">
          <span className="kpi-label">Depth Model Engine</span>
          <div className="kpi-value" style={{ color: 'var(--green)', fontSize: '1.2rem' }}>Depth Anything V2</div>
        </div>
      </div>

      {/* Monocular Depth Chart */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          DEPTH ANYTHING V2 ESTIMATION PROFILE
        </div>
        <div className="chart-wrap" style={{ height: 220, marginTop: 8 }}>
          <ErrorBoundary name="Depth Estimation Bar Chart">
            <Bar data={chartData} options={chartOptions} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Depth & Volume Hazard Analytics Table */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">3D VOLUMETRIC & SPATIAL BREAKDOWN</div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Hazard ID</th>
                <th>Classification</th>
                <th>Surface Area (m²)</th>
                <th>Depth Index</th>
                <th>Confidence</th>
                <th>Depression Profile</th>
              </tr>
            </thead>
            <tbody>
              {metrics.list.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: 'var(--text-faint)' }}>
                    No depth telemetry recorded yet.
                  </td>
                </tr>
              ) : (
                metrics.list.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--amber)' }}>{item.id}</td>
                    <td>
                      <span className="type-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        {item.className.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.area != null ? `${item.area.toFixed(1)} m²` : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: (item.depthIndex != null && item.depthIndex > 0.7) ? 'var(--danger)' : 'var(--warning)' }}>
                      {item.depthIndex != null ? item.depthIndex.toFixed(3) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{item.confidence != null ? `${(item.confidence * 100).toFixed(1)}%` : '—'}</td>
                    <td>
                      <span className={item.depthIndex != null ? `sev-badge ${(item.depthIndex > 0.7 ? 'CRITICAL' : item.depthIndex > 0.4 ? 'HIGH' : 'LOW').toLowerCase()}` : 'type-badge'}>
                        {item.depthIndex != null ? (item.depthIndex > 0.7 ? 'DEEP CAVITY' : item.depthIndex > 0.4 ? 'MODERATE DEPRESSION' : 'SURFACE DEFECT') : '—'}
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