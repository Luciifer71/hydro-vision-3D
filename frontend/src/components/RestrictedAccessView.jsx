import React from 'react';
import { useStore } from '../store.js';

export default function RestrictedAccessView({ moduleName }) {
  const { currentUser, setPage, switchUserRole } = useStore();

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      minHeight: '450px',
      padding: '24px'
    }}>
      <div style={{
        maxWidth: '540px',
        width: '100%',
        background: 'rgba(18, 24, 36, 0.95)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(239, 68, 68, 0.4)',
        borderRadius: 'var(--radius-md)',
        padding: '32px',
        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7), 0 0 20px rgba(239, 68, 68, 0.15)',
        textAlign: 'center',
        fontFamily: 'var(--font-mono)'
      }}>
        {/* Security Shield Icon */}
        <div style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 18px',
          color: '#ef4444'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          color: '#ef4444',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 6
        }}>
          403 // Access Restricted
        </div>

        <h2 style={{
          fontSize: '1.25rem',
          fontWeight: 900,
          color: '#ffffff',
          marginBottom: 12,
          letterSpacing: 0.5
        }}>
          ADMINISTRATOR PRIVILEGES REQUIRED
        </h2>

        <p style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          lineHeight: 1.6,
          marginBottom: 16
        }}>
          The <span style={{ color: 'var(--amber)', fontWeight: 700 }}>{moduleName || 'requested module'}</span> controls drone flight avionics, sensor calibration, or raw AI model configurations.
        </p>

        {/* User Identity Box */}
        <div style={{
          background: 'rgba(10, 14, 22, 0.8)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-sm)',
          padding: '12px 14px',
          textAlign: 'left',
          marginBottom: 20,
          fontSize: '0.72rem'
        }}>
          <div style={{ color: 'var(--text-faint)', fontSize: '0.62rem', marginBottom: 2 }}>ACTIVE CREDENTIALS:</div>
          <div style={{ color: '#fff', fontWeight: 800 }}>{currentUser?.name}</div>
          <div style={{ color: 'var(--cyan)' }}>{currentUser?.designation} ({currentUser?.department})</div>
          <div style={{ color: 'var(--text-faint)', marginTop: 4 }}>
            Assigned Jurisdiction: <span style={{ color: '#fff' }}>{currentUser?.ward}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={() => setPage('municipal')}
            style={{ fontSize: '0.75rem', padding: '8px 16px' }}
          >
            Go to Civic Command Desk
          </button>
          
          <button
            className="btn btn-outline"
            onClick={() => switchUserRole('admin')}
            style={{
              fontSize: '0.75rem',
              padding: '8px 16px',
              borderColor: 'var(--amber)',
              color: 'var(--amber)'
            }}
          >
            Switch to Admin Account
          </button>
        </div>
      </div>
    </div>
  );
}
