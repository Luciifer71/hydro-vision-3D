import React, { useState } from 'react';
import { useStore } from '../store.js';

export default function ConfidenceSlider() {
  const [value, setValue] = useState(0.20);
  const sendThreshold = useStore(state => state.sendThreshold);

  const handleChange = (e) => {
    const val = parseFloat(e.target.value);
    setValue(val);
    if (sendThreshold) sendThreshold(val);
  };

  return (
    <div className="bf-fieldset">
      <div className="bf-badge-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        AI SENSITIVITY GATE: {(value * 100).toFixed(0)}%
      </div>

      <div style={{ marginTop: 6 }}>
        <input 
          type="range" 
          min="0.05" 
          max="0.80" 
          step="0.05" 
          value={value} 
          onChange={handleChange}
          style={{ 
            width: '100%', 
            cursor: 'pointer', 
            accentColor: 'var(--amber)',
            height: 5,
            borderRadius: 3
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-faint)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
          <span>0.05 (MAX RECALL)</span>
          <span style={{ color: 'var(--amber)', fontWeight: 700 }}>CONF: {value.toFixed(2)}</span>
          <span>0.80 (STRICT)</span>
        </div>
      </div>
    </div>
  );
}
