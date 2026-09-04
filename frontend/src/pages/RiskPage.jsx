import React from 'react';
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { useStore } from '../store.js';
import { computeSessionRisk } from '../lib/derive.js';
import EmptySessionState from '../components/EmptySessionState.jsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// 🟢 Optimization: Disable chart animations for real-time streaming performance
ChartJS.defaults.animation.duration = 0;

export default function RiskPage() {
  const { hazards = [], riskHistory = [], currentState = {} } = useStore();
  const { riskLevel } = computeSessionRisk(hazards, currentState?.summary || {});

  if (!currentState) return <EmptySessionState message="No Risk Data Available" />;

  // Fallback history data if empty so the chart renders cleanly
  const safeHistory = riskHistory.length > 0 ? riskHistory : [{ time: '00:00', score: 25 }];

  const riskData = {
    labels: safeHistory.map(d => d.time),
    datasets: [{ 
      label: 'Risk Score', 
      data: safeHistory.map(d => d.score), 
      borderColor: '#f97316', 
      backgroundColor: 'rgba(249,115,22,0.12)', 
      borderWidth: 2, 
      fill: true, 
      tension: 0.4, 
      pointRadius: 0 
    }],
  };

  const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  hazards.forEach(h => { 
    const s = h.severity && h.severity !== '—' ? h.severity.toUpperCase() : null; 
    if (s && counts[s] !== undefined) counts[s]++; 
  });

  const pieData = {
    labels: ['Low', 'Moderate', 'High', 'Critical'],
    datasets: [{ 
      data: [counts.LOW, counts.MODERATE, counts.HIGH, counts.CRITICAL], 
      backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'], 
      borderColor: 'rgba(15,20,35,0.8)', 
      borderWidth: 2 
    }],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Threshold Indexer Card */}
      <div className="card">
        <div className="card-header"><span className="card-title">Risk Engine — Severity Indexer</span></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { cls: 'low', range: '< 5.0 m²', level: 'LOW (1)', action: 'Monitor routine conditions.', color: 'var(--green)' },
            { cls: 'moderate', range: '5.0 – 25.0 m²', level: 'MODERATE (2)', action: 'Schedule standard maintenance check.', color: 'var(--warning)' },
            { cls: 'high', range: '25.0 – 75.0 m²', level: 'HIGH (3)', action: 'Dispatch local maintenance crew.', color: 'var(--orange)' },
            { cls: 'critical', range: '≥ 75.0 m²', level: 'CRITICAL (4)', action: 'Issue emergency response and traffic reroute.', color: 'var(--danger)' },
          ].map(({ cls, range, level, action, color }) => (
            <div className={`threshold-row ${cls}`} key={cls} style={{ opacity: riskLevel === cls.toUpperCase() ? 1 : 0.65 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{range}</span>
              <span style={{ fontWeight: 700, color }}>{level}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Risk Distribution Over Time</span></div>
          <div className="card-body">
            <div className="chart-wrap" style={{ height: 220 }}>
              <Line data={riskData} options={{ scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 } } }, y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.04)' } } }, plugins: { legend: { display: false } }, interaction: { intersect: false, mode: 'index' }, responsive: true, maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Current Risk Breakdown</span></div>
          <div className="card-body">
            <div className="chart-wrap" style={{ height: 220 }}>
              <Pie data={pieData} options={{ plugins: { legend: { display: true, position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, padding: 8 } } }, responsive: true, maintainAspectRatio: false }} />
            </div>
          </div>
        </div>
      </div>

      {/* Formula Card */}
      <div className="card">
        <div className="card-header"><span className="card-title">EMA Smoothing Formula</span></div>
        <div className="card-body">
          <div className="formula">Area_smoothed = 0.7 × Area_previous + 0.3 × Area_current</div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: 10 }}>
            Exponential Moving Average (EMA) smoothing reduces noise in real-time area measurements by blending previous
            and current values. The α coefficient of 0.3 prioritizes stability while remaining responsive to genuine changes in hazard size.
          </p>
        </div>
      </div>
    </div>
  );
}