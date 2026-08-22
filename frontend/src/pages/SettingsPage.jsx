import { useState } from 'react';
import { useStore } from '../store.js';

export default function SettingsPage() {
  const { settings, saveSettings, addLog } = useStore();
  const [form, setForm] = useState({ ...settings });

  const handleSave = () => {
    saveSettings(form);
    addLog('Settings saved successfully');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="card">
        <div className="card-header"><span className="card-title">Dashboard Settings</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <h4 style={{ fontSize: '0.8rem', marginBottom: 10, color: '#ddd' }}>Data Source</h4>
              <div className="form-radio-group">
                {[
                  { val: 'live', label: 'Live Backend (WebSocket)', sub: 'Connect to FastAPI at ws://localhost:8000' },
                  { val: 'simulation', label: 'Simulation Mode', sub: 'Generate realistic mock data client-side' },
                ].map(({ val, label, sub }) => (
                  <label key={val} className="form-radio" style={{ borderColor: form.dataSource === val ? '#ffbb00' : '#444' }}>
                    <input type="radio" name="datasource" value={val} checked={form.dataSource === val} onChange={() => setForm(f => ({ ...f, dataSource: val }))} />
                    <div>
                      <strong style={{ color: form.dataSource === val ? '#ffbb00' : '#ddd' }}>{label}</strong>
                      <br />
                      <span style={{ fontSize: '0.7rem', color: '#666' }}>{sub}</span>
                    </div>
                  </label>
                ))}
              </div>

              <h4 style={{ fontSize: '0.8rem', margin: '16px 0 10px', color: '#ddd' }}>Backend Configuration</h4>
              {[
                { label: 'API URL', key: 'apiUrl', placeholder: 'http://localhost:8000' },
                { label: 'WebSocket URL', key: 'wsUrl', placeholder: 'ws://localhost:8000/ws/live-stream' },
                { label: 'Update Interval (ms)', key: 'updateInterval', type: 'number', placeholder: '2000' },
              ].map(({ label, key, type, placeholder }) => (
                <div className="form-group" key={key}>
                  <label className="form-label">{label}</label>
                  <input className="form-input" type={type || 'text'} value={form[key]} placeholder={placeholder} onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))} />
                </div>
              ))}
            </div>

            <div>
              <h4 style={{ fontSize: '0.8rem', marginBottom: 10, color: '#ddd' }}>Display Settings</h4>
              {[
                { label: 'Show Animations', key: 'showAnimations' },
                { label: 'Dark Map Tiles', key: 'darkMap' },
                { label: 'Auto-scroll Alerts', key: 'autoScroll' },
              ].map(({ label, key }) => (
                <label key={key} className="form-checkbox">
                  <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}

              <div className="card" style={{ marginTop: 16, background: '#333' }}>
                <div className="card-body">
                  <h3 style={{ fontSize: '0.95rem', marginBottom: 5, color: '#ffbb00' }}>HYDRO-VISION-3D</h3>
                  <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 5 }}>v2.1.0 — ELCIA Tech Summit 2026</div>
                  <p style={{ fontSize: '0.75rem', color: '#888', lineHeight: 1.6, marginBottom: 8 }}>
                    AI-Powered 3D Hydro-Spatial Infrastructure Intelligence for Smart Cities
                  </p>
                  <div className="tech-badges">
                    {['YOLOv8-seg','ByteTrack','FastAPI','React','WebSocket','Leaflet','Chart.js','Zustand','PostGIS','Python 3.11'].map(t => (
                      <span key={t} className="tech-badge">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={handleSave}>Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}
