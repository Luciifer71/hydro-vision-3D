import { Component } from 'react';

/**
 * ErrorBoundary — Wraps dashboard feature components.
 * Catches component-level errors and displays a fallback UI
 * ensuring other parts of the dashboard continue working smoothly.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary] Component error in ${this.props.name || 'Component'}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 16,
            background: '#2a1a1a',
            border: '1px solid #cc0000',
            borderRadius: 4,
            color: '#ff6666',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
            ERROR IN {this.props.name ? this.props.name.toUpperCase() : 'MODULE'}
          </div>
          <div style={{ color: '#888', fontSize: '0.75rem', marginBottom: 10 }}>
            {this.state.error?.message || 'Component failed to render.'}
          </div>
          <button
            className="btn btn-outline"
            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            RETRY MODULE
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
