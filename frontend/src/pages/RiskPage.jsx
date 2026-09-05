import React from 'react';
import { Line, Pie } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { useStore } from '../store.js';
import { computeSessionRisk } from '../lib/derive.js';
import EmptySessionState from '../components/EmptySessionState.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);
ChartJS.defaults.animation.duration = 0;

export default function RiskPage() {
  const { hazards = [], riskHistory = [], currentState = {} } = useStore();
  const { riskLevel } = computeSessionRisk(hazards, currentState?.summary || {});

  if (!currentState && hazards.length === 0) {
    return <EmptySessionState message="No Risk Telemetry Recorded" />;
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Threshold Indexer Card */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          RISK ENGINE & SEVERITY THRESHOLDS
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {[
            { cls: 'low', range: '< 5.0 m²', level: 'LOW (1)', action: 'Routine monitoring; log in telemetry database.', color: 'var(--green)' },
            { cls: 'moderate', range: '5.0 – 25.0 m²', level: 'MODERATE (2)', action: 'Schedule standard civic maintenance inspection.', color: 'var(--warning)' },
            { cls: 'high', range: '25.0 – 75.0 m²', level: 'HIGH (3)', action: 'Immediate contractor dispatch; surface remediation.', color: 'var(--orange)' },
            { cls: 'critical', range: '≥ 75.0 m²', level: 'CRITICAL (4)', action: 'Urgent traffic rerouting & emergency drainage pumping.', color: 'var(--danger)' },
          ].map(({ cls, range, level, action, color }) => (
            <div 
              className={`threshold-row ${cls}`} 
              key={cls} 
              style={{ 
                opacity: riskLevel === cls.toUpperCase() ? 1 : 0.65,
                borderLeftWidth: 4,
                boxShadow: riskLevel === cls.toUpperCase() ? '0 0 14px rgba(255,184,0,0.15)' : 'none'
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700 }}>{range}</span>
              <span style={{ fontWeight: 800, color, letterSpacing: 0.5 }}>{level}</span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
        <div className="bf-fieldset">
          <div className="bf-badge-title">TEMPORAL RISK DYNAMICS</div>
          <div className="chart-wrap" style={{ height: 220, marginTop: 8 }}>
            <ErrorBoundary name="Risk Trend Line Chart">
              <Line 
                data={riskData} 
                options={{ 
                  scales: { 
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10, family: 'monospace' } } }, 
                    y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { font: { size: 10, family: 'monospace' } } } 
                  }, 
                  plugins: { legend: { display: false } }, 
                  interaction: { intersect: false, mode: 'index' }, 
                  responsive: true, 
                  maintainAspectRatio: false 
                }} 
              />
            </ErrorBoundary>
          </div>
        </div>

        <div className="bf-fieldset">
          <div className="bf-badge-title">SEVERITY CONSTELLATION</div>
          <div className="chart-wrap" style={{ height: 220, marginTop: 8 }}>
            <ErrorBoundary name="Risk Pie Chart">
              <Pie 
                data={pieData} 
                options={{ 
                  plugins: { 
                    legend: { 
                      display: true, 
                      position: 'bottom', 
                      labels: { color: '#94a3b8', font: { size: 10 }, padding: 8 } 
                    } 
                  }, 
                  responsive: true, 
                  maintainAspectRatio: false 
                }} 
              />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      {/* Mathematical Stabilization Formula Card */}
      <div className="bf-fieldset">
        <div className="bf-badge-title">EMA METRIC STABILIZATION ENGINE</div>
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Rapid aerial video frames exhibit jitter due to altitude drift and sensor vibration. HYDRO-VISION-3D applies Exponential Moving Average (EMA) smoothing to eliminate false-alarm flickering:
          </p>
          <div className="formula">
            S_t = 0.7 × S_(t-1) + 0.3 × X_t
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
            where α = 0.3 dampens high-frequency frame noise while preserving genuine rapid-onset hazard escalation.
          </p>
        </div>
      </div>
    </div>
  );
}