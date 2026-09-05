import React, { useState } from 'react';
import { CONFIG } from '../store.js';

export default function VideoExportCard({ streamRunning }) {
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggleRecording = async () => {
    if (!streamRunning) {
      alert("You must be viewing a stream to record it.");
      return;
    }
    setLoading(true);
    try {
      if (!isRecording) {
        const res = await fetch(`${CONFIG.API_URL}/api/record/start`);
        const data = await res.json();
        if (data.status === 'started' || data.status === 'already recording') {
          setIsRecording(true);
        } else {
          alert("Failed to start recording: " + (data.message || data.error));
        }
      } else {
        const res = await fetch(`${CONFIG.API_URL}/api/record/stop`);
        const data = await res.json();
        if (data.status === 'stopped' || data.status === 'not recording') {
          setIsRecording(false);
        }
      }
    } catch (err) {
      alert("API Error: " + err.message);
    }
    setLoading(false);
  };

  const handleDownload = () => {
    if (isRecording) {
      alert("Please stop the current recording before downloading!");
      return;
    }
    window.open(`${CONFIG.API_URL}/api/record/download`, '_blank');
  };

  return (
    <div className="card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="kpi-label">On-Demand AI Export</span>
        {isRecording && (
          <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }}></span>
            RECORDING
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button 
          onClick={handleToggleRecording} 
          disabled={loading}
          className="btn"
          style={{
            flex: 1, 
            background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
            border: `1px solid ${isRecording ? '#ef4444' : '#10b981'}`,
            color: isRecording ? '#ef4444' : '#10b981',
            padding: '6px',
            fontSize: '0.75rem'
          }}
        >
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>

        <button 
          onClick={handleDownload} 
          disabled={isRecording || loading}
          className="btn"
          style={{
            flex: 1, 
            background: 'transparent',
            border: '1px solid #444',
            color: isRecording ? '#666' : '#ccc',
            padding: '6px',
            fontSize: '0.75rem',
            cursor: isRecording ? 'not-allowed' : 'pointer'
          }}
          title="Download the last recorded annotated clip"
        >
          Download MP4
        </button>
      </div>
    </div>
  );
}
