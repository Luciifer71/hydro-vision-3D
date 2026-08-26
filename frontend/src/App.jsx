import { useEffect } from 'react';
import { useStore } from './store.js';
import Sidebar from './components/Sidebar.jsx';
import Header from './components/Header.jsx';
import TelemetryBar from './components/TelemetryBar.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MapPage from './pages/MapPage.jsx';
import DetectionsPage from './pages/DetectionsPage.jsx';
import AlertsPage from './pages/AlertsPage.jsx';
import RiskPage from './pages/RiskPage.jsx';
import VolumetricsPage from './pages/VolumetricsPage.jsx';
import DepthPage from './pages/DepthPage.jsx';
import StreamPage from './pages/StreamPage.jsx';
import BottomBar from './components/BottomBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

export default function App() {
  const { connect, currentPage } = useStore();

  useEffect(() => {
    connect();
  }, []);

  const pages = {
    dashboard: <DashboardPage />,
    map: <MapPage />,
    detections: <DetectionsPage />,
    alerts: <AlertsPage />,
    risk: <RiskPage />,
    volumetric: <VolumetricsPage />,
    depth: <DepthPage />,
    stream: <StreamPage />,
  };

  return (
    <div className="app">
      <ErrorBoundary name="Header">
        <Header />
      </ErrorBoundary>
      <div className="app-body">
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>
        <div className="main">
          <ErrorBoundary name="Telemetry Bar">
            <TelemetryBar />
          </ErrorBoundary>
          <div className="content">
            {Object.entries(pages).map(([key, component]) => (
              <div key={key} className={`page ${currentPage === key ? 'active' : ''}`}>
                <ErrorBoundary name={`Page (${key})`}>
                  {component}
                </ErrorBoundary>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ErrorBoundary name="Bottom Bar">
        <BottomBar />
      </ErrorBoundary>
    </div>
  );
}
