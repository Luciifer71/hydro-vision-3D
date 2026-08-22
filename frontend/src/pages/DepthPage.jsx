export default function DepthPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Depth Analysis — Monocular Depth Estimation</span></div>
        <div className="card-body">
          <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderLeft: '3px solid var(--cyan)', borderRadius: '0 8px 8px 0', padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Depth Anything V2 model integration is planned for a future release. Features below show planned capabilities.
          </div>
        </div>
      </div>

      <div className="info-grid">
        {[
          { title: 'Monocular Depth', desc: 'Estimate per-pixel depth from a single drone camera frame using Depth Anything V2.' },
          { title: 'Volume Estimation', desc: 'Calculate pothole volume in m³ by integrating depth maps over segmented regions.' },
          { title: 'Surface Normals', desc: 'Compute surface normal vectors from 3D point clouds for terrain analysis.' },
          { title: 'Point Cloud', desc: 'Generate 3D point clouds from depth maps using camera intrinsics for spatial reconstruction.' },
        ].map(({ title, desc }) => (
          <div className="info-card" key={title}>
            <span className="coming-soon">Coming Soon</span>
            <h4 style={{ fontSize: '0.88rem', marginBottom: 6 }}>{title}</h4>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header"><span className="card-title">Pipeline Architecture</span></div>
        <div className="card-body">
          <div className="pipeline">
            {['Frame', 'Depth Anything V2', 'Depth Map', '3D Geometry Engine', 'Volume Estimation'].map((step, i, arr) => (
              <span key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="pipeline-step">{step}</span>
                {i < arr.length - 1 && <span className="pipeline-arrow">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
