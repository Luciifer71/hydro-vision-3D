import React, { useState } from 'react';
import { useStore } from '../store.js';

export default function ConfidenceSlider() {
  const [value, setValue] = useState(0.20);
  const sendThreshold = useStore(state => state.sendThreshold);

  const handleChange = (e) => {
    const val = parseFloat(e.target.value);
    setValue(val);
    sendThreshold(val);
  };

  return (
    <div className="card" style={{ marginTop: '10px' }}>
      <div className="card-header">
        <span className="card-title">AI Confidence Threshold</span>
        <span className="card-badge" style={{ backgroundColor: '#222', color: '#10b981', fontFamily: 'var(--font-mono)' }}>{value.toFixed(2)}</span>
      </div>
      <div className="card-body">
        <input 
          type="range" 
          min="0.10" 
          max="0.90" 
          step="0.05" 
          value={value} 
          onChange={handleChange}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#10b981', background: 'transparent' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#888', marginTop: '8px' }}>
          <span>0.10 (High Sensitivity)</span>
          <span>0.90 (High Precision)</span>
        </div>
      </div>
    </div>
  );
}
