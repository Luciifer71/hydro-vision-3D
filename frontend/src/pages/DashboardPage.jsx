import { useStore } from '../store.js';
import FlyView from '../components/FlyView.jsx';
import AnalyzeView from '../components/AnalyzeView.jsx';

export default function DashboardPage() {
  const { viewMode } = useStore();
  return viewMode === 'fly' ? <FlyView /> : <AnalyzeView />;
}
  