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
import AreaAnalyticsPage from './pages/AreaAnalyticsPage.jsx';
import DepthPage from './pages/DepthPage.jsx';
import StreamPage from './pages/StreamPage.jsx';
import MunicipalOperations from './Additional_Features/MunicipalOperations.jsx';
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
    volumetric: <AreaAnalyticsPage />,
    depth: <DepthPage />,
    stream: <StreamPage />,
    municipal: <MunicipalOperations />,
  };

  return (
    <div className="app">
      <div className="bf-top-runner" />
      <ErrorBoundary name="Header">
        <Header />
      </ErrorBoundary>
      <div className="app-body">
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>
        <div className="main">
          {currentPage !== 'municipal' && (
            <ErrorBoundary name="Telemetry Bar">
              <TelemetryBar />
            </ErrorBoundary>
          )}
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
    </div>
  );
}
