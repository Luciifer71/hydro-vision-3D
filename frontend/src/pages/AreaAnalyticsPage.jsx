import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { useStore, CONFIG } from '../store.js';
import EmptySessionState from '../components/EmptySessionState.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
ChartJS.defaults.animation.duration = 0;

export default function AreaAnalyticsPage() {
  const { hazards = [], currentState } = useStore();

  const metrics = useMemo(() => {
    let totalAreaM2 = 0;
    let totalAreaPx = 0;
    let maxArea = 0;
    let metricCount = 0;
    let isMetricM2 = false;

    const classStats = {};

    hazards.forEach(h => {
      const cls = h.class_name || h.type || 'unknown';
      const areaM2 = h.area_m2 ?? h.surface_area_m2;
      const areaPx = h.area_px;
      
      if (areaM2 != null) isMetricM2 = true;
      const area = areaM2 != null ? Number(areaM2) : (areaPx != null ? Number(areaPx) : null);

      if (area != null) {
        metricCount++;
        if (areaM2 != null) totalAreaM2 += Number(areaM2);
        if (areaPx != null) totalAreaPx += Number(areaPx);
        if (area > maxArea) maxArea = area;
      }

      if (!classStats[cls]) {
        classStats[cls] = { count: 0, totalArea: 0, maxArea: 0, hasMetric: false };
      }

      classStats[cls].count += 1;
      if (area != null) {
        classStats[cls].hasMetric = true;
        classStats[cls].totalArea += area;
        if (area > classStats[cls].maxArea) classStats[cls].maxArea = area;
      }
    });

    const displayTotalArea = isMetricM2 ? totalAreaM2 : totalAreaPx;
    const avgArea = metricCount > 0 ? displayTotalArea / metricCount : 0;
    const unitLabel = isMetricM2 ? 'm²' : 'px²';

    return { totalArea: displayTotalArea, maxArea, avgArea, metricCount, classStats, isMetricM2, unitLabel };
  }, [hazards]);

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Spatial Area Telemetry Available" />;
  }

  const classKeys = Object.keys(metrics.classStats);
  const barData = {
    labels: classKeys.length > 0 ? classKeys.map(k => CONFIG.TYPE_LABELS?.[k] || k) : ['No Data'],
    datasets: [
      {
        label: `Total Footprint (${metrics.unitLabel})`,
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
        backgroundColor: 'rgba(10,14,22,0.95)',
        borderColor: 'rgba(255,184,0,0.4)',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => `Footprint: ${ctx.raw} ${metrics.unitLabel}`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: `Displacement (${metrics.unitLabel})`, color: '#94a3b8', font: { family: 'monospace' } },
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
      {/* KPI Grid */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-card">
          <span className="kpi-label">Total Affected Footprint</span>
          <div className="kpi-value" style={{ color: 'var(--amber)' }}>
            {metrics.metricCount > 0 ? `${metrics.totalArea.toFixed(1)} ${metrics.unitLabel}` : '—'}
          </div>
          <span className="kpi-trend">
            {metrics.isMetricM2 ? 'Ground Sample Distance (GSD)' : 'GSD Uncalibrated (Pixel Footprint)'}
          </span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Average Area Per Hazard</span>
          <div className="kpi-value" style={{ color: 'var(--cyan)' }}>
            {metrics.metricCount > 0 ? `${metrics.avgArea.toFixed(1)} ${metrics.unitLabel}` : '—'}
          </div>
          <span className="kpi-trend">Mean spatial footprint</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-label">Largest Individual Defect</span>
          <div className="kpi-value" style={{ color: 'var(--danger)' }}>
            {metrics.metricCount > 0 ? `${metrics.maxArea.toFixed(1)} ${metrics.unitLabel}` : '—'}
          </div>
          <span className="kpi-trend up">Maximum single bounding envelope</span>
        </div>
      </div>

      {/* Area Distribution Chart */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          SPATIAL AREA BY CLASSIFICATION ({metrics.unitLabel.toUpperCase()})
        </div>
        <div className="chart-wrap" style={{ height: 220, marginTop: 8 }}>
          <ErrorBoundary name="Area Distribution Chart">
            <Bar data={barData} options={chartOptions} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Area Breakdown Table */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">PHOTOGRAMMETRIC AREA BREAKDOWN</div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Classification</th>
                <th>Detections</th>
                <th>Cumulative Footprint ({metrics.unitLabel})</th>
                <th>Average Area ({metrics.unitLabel})</th>
                <th>Peak Area ({metrics.unitLabel})</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metrics.classStats).length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)' }}>
                    No spatial area telemetry available. Run video pipeline to calculate GSD measurements.
                  </td>
                </tr>
              ) : (
                Object.entries(metrics.classStats).map(([cls, stat]) => (
                  <tr key={cls}>
                    <td>
                      <span className="type-badge" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        {CONFIG.TYPE_LABELS?.[cls] || cls}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{stat.count}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: 'var(--amber)' }}>
                      {stat.hasMetric ? `${stat.totalArea.toFixed(1)} ${metrics.unitLabel}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {stat.hasMetric ? `${(stat.totalArea / stat.count).toFixed(1)} ${metrics.unitLabel}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {stat.hasMetric ? `${stat.maxArea.toFixed(1)} ${metrics.unitLabel}` : '—'}
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