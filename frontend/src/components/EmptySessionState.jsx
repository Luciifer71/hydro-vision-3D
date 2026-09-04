import React from 'react';
import { useStore } from '../store.js';

export default function EmptySessionState({ message = "No Session Loaded" }) {
  const { setPage } = useStore();
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%', minHeight: '60vh' }}>
      <div style={{ padding: '40px', background: '#121212', border: '1px solid #333', borderRadius: '12px', textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>📊</div>
        <h3 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>{message}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '24px' }}>
          Connect to a live drone feed or load a past recorded session from the Stream Control panel to view analytics.
        </p>
        <button 
          onClick={() => setPage('stream')}
          style={{ background: 'var(--amber)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
        >
          Go to Stream Control
        </button>
      </div>
    </div>
  );
}
