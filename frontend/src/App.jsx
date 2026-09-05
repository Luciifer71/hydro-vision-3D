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
import RestrictedAccessView from './components/RestrictedAccessView.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

const ADMIN_ONLY_PAGES = {
  dashboard: 'Avionics & Sensor Calibration Setup',
  stream: 'Raw Video Feed & Stream Ingestion Control',
  risk: 'AI Risk Engine & Mathematical Weight Tuning',
  volumetric: 'Volumetric Photogrammetric Model Calibration',
  depth: 'Monocular Depth Sensor Matrix Tuning'
};

export default function App() {
  const { connect, currentPage, currentUser } = useStore();
  const isEmployee = currentUser?.role === 'employee';

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
      <ErrorBoundary name="Header">
        <Header />
      </ErrorBoundary>
      <div className="app-body">
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>
        <div className="main">
          {currentPage !== 'municipal' && !isEmployee && (
            <ErrorBoundary name="Telemetry Bar">
              <TelemetryBar />
            </ErrorBoundary>
          )}
          <div className="content">
            {Object.entries(pages).map(([key, component]) => {
              const isRestrictedForUser = isEmployee && Boolean(ADMIN_ONLY_PAGES[key]);
              return (
                <div key={key} className={`page ${currentPage === key ? 'active' : ''}`}>
                  <ErrorBoundary name={`Page (${key})`}>
                    {isRestrictedForUser ? (
                      <RestrictedAccessView moduleName={ADMIN_ONLY_PAGES[key]} />
                    ) : (
                      component
                    )}
                  </ErrorBoundary>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
