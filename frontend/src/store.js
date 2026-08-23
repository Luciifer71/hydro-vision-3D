import { create } from 'zustand';

const getBackendUrls = () => {
  if (typeof window === 'undefined') {
    return { apiUrl: 'http://localhost:8000', wsUrl: 'ws://localhost:8000/ws/live-stream' };
  }
  const hostname = window.location.hostname || 'localhost';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const port = (window.location.port === '5173' || window.location.port === '3000' || window.location.port === '5174') ? '8000' : (window.location.port || '8000');
  
  return {
    apiUrl: `${protocol}//${hostname}:${port}`,
    wsUrl: `${wsProtocol}//${hostname}:${port}/ws/live-stream`
  };
};

const DEFAULT_URLS = getBackendUrls();

const CONFIG = {
  API_URL: DEFAULT_URLS.apiUrl,
  WS_URL: DEFAULT_URLS.wsUrl,
  CENTER_LAT: 22.3072,
  CENTER_LON: 73.1812,
  CHART_HISTORY: 24,
  MAX_ALERTS: 15,
  EMA_ALPHA: 0.3,
  TYPE_LABELS: { pothole: 'Pothole', water_body: 'Water Body', crack: 'Crack', flooding: 'Flooding' },
  TYPE_ICONS: { pothole: '[P]', water_body: '[W]', crack: '[C]', flooding: '[F]' },
  TYPE_COLORS: { pothole: '#ef4444', water_body: '#00d4ff', crack: '#f59e0b', flooding: '#a855f7' },
  SEVERITY_COLORS: { LOW: '#10b981', MODERATE: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' },
};

export { CONFIG };

function severityFromArea(a) {
  a = Number(a) || 0;
  if (a >= 75) return 'CRITICAL';
  if (a >= 25) return 'HIGH';
  if (a >= 5) return 'MODERATE';
  return 'LOW';
}

const INITIAL_HAZARDS = [
  {
    hazard_id: 'haz_101',
    track_id: 101,
    type: 'pothole',
    confidence: 0.94,
    surface_area_m2: 82.5,
    severity: 'CRITICAL',
    priority_score: 95,
    zone: 'Zone A - Main Arterial',
    status: 'OPEN',
    timestamp: Date.now() - 120000,
    location: { latitude: 22.3078, longitude: 73.1819 }
  },
  {
    hazard_id: 'haz_102',
    track_id: 102,
    type: 'flooding',
    confidence: 0.88,
    surface_area_m2: 34.2,
    severity: 'HIGH',
    priority_score: 78,
    zone: 'Zone B - Industrial Park',
    status: 'OPEN',
    timestamp: Date.now() - 300000,
    location: { latitude: 22.3065, longitude: 73.1802 }
  },
  {
    hazard_id: 'haz_103',
    track_id: 103,
    type: 'crack',
    confidence: 0.91,
    surface_area_m2: 12.8,
    severity: 'MODERATE',
    priority_score: 52,
    zone: 'Zone C - East Corridor',
    status: 'OPEN',
    timestamp: Date.now() - 450000,
    location: { latitude: 22.3081, longitude: 73.1825 }
  },
];

export const useStore = create((set, get) => ({
  connectionStatus: 'DISCONNECTED',
  wsRef: null,
  reconnectTimer: null,

  currentState: null,
  previousState: null,
  hazards: INITIAL_HAZARDS,
  timelineHistory: [],
  riskHistory: [],
  alertFilter: 'all',
  detectionSearch: '',
  detectionTypeFilter: 'all',
  logs: ['Dashboard initialized'],

  telemetry: {
    altitude: 24.5, latitude: 22.3072, longitude: 73.1812,
    speed: 0, battery: 87, rssi: -62,
    flightTime: 0, satellites: 12, heading: 245, verticalSpeed: 0, pitch: 2, roll: -1,
  },

  viewMode: 'fly',
  feedMode: 'live', // 'live' | 'video'
  currentPage: 'dashboard',
  streamRunning: false,
  videoPath: '/sample-drone.mp4',

  showCriticalAlert: false,

  settings: {
    apiUrl: DEFAULT_URLS.apiUrl,
    wsUrl: DEFAULT_URLS.wsUrl,
    updateInterval: 2000,
    showAnimations: true,
    darkMap: true,
    autoScroll: true,
    dataSource: 'live',
  },

  setPage: (page) => set({ currentPage: page }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setFeedMode: (mode) => set({ feedMode: mode }),
  setAlertFilter: (filter) => set({ alertFilter: filter }),
  setDetectionSearch: (q) => set({ detectionSearch: q }),
  setDetectionTypeFilter: (t) => set({ detectionTypeFilter: t }),
  setVideoPath: (p) => set({ videoPath: p, feedMode: p ? 'video' : 'live' }),
  setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),

  switchToLiveFeed: async () => {
    get().addLog('Switching back to Live Drone Feed...');
    set({
      feedMode: 'live',
      videoPath: '/sample-drone.mp4',

      streamRunning: true,
    });
    // Trigger backend live stream pipeline reset/start
    try {
      await fetch(`${get().settings.apiUrl}/api/stream/start`);
    } catch (e) {
      console.warn('Backend live stream notification:', e);
    }
    if (get().connectionStatus !== 'LIVE') {
      get().connect();
    }
    get().addLog('Active Feed: LIVE DRONE FEED');
  },

  uploadVideo: async (file) => {
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const fileName = file.name;
    get().addLog(`Loaded pre-recorded video: ${fileName}`);

    let activeUrl = blobUrl;
    let serverFilename = null;

    // Post file to backend upload endpoint for HTTP streaming
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${get().settings.apiUrl}/api/upload-video`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.filename) {
          serverFilename = data.filename;
          activeUrl = `${get().settings.apiUrl}/api/videos/${data.filename}`;
          get().addLog(`Uploaded ${fileName} to server — HTTP stream ready: ${data.filename}`);
        }
      }
    } catch (err) {
      console.warn('Backend API upload warning, using local blob stream:', err);
    }

    set({
      videoPath: activeUrl,
      feedMode: 'video',
      streamRunning: true,
      currentPage: 'dashboard',
      viewMode: 'fly',
    });

    if (serverFilename) {
      // Notify backend AI perception pipeline to process uploaded video
      try {
        await fetch(`${get().settings.apiUrl}/api/stream/start?video_path=${encodeURIComponent(serverFilename)}`);
      } catch (e) {
        console.warn('Could not trigger backend stream loop for video:', e);
      }
    }

    get().addLog(`Analyzing recorded video feed: ${fileName}`);
  },

  addLog: (msg) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    set((state) => ({ logs: [`[${time}] ${msg}`, ...state.logs].slice(0, 100) }));
  },

  ingestData: (data) => {
    const prev = get().currentState;
    const hazards = (data.hazards || []).map(h => ({
      ...h,
      severity: h.severity || severityFromArea(h.surface_area_m2),
    }));
    const now = new Date().toLocaleTimeString('en-US', { hour12: false });
    const riskLevel = data.summary?.overall_risk || 'LOW';
    const isCritical = riskLevel === 'CRITICAL';

    set((state) => {
      // Simulate realistic OSD telemetry
      const t = state.telemetry;
      const lat = hazards.length > 0 && hazards[0].location?.latitude ? hazards[0].location.latitude : t.latitude;
      const lon = hazards.length > 0 && hazards[0].location?.longitude ? hazards[0].location.longitude : t.longitude;
      return {
        previousState: prev,
        currentState: data,
        hazards,
        showCriticalAlert: isCritical,
        streamRunning: ['LIVE', 'STREAMING'].includes(data.stream_status),
        telemetry: {
          ...t,
          latitude: lat + (Math.random() - 0.5) * 0.00002,
          longitude: lon + (Math.random() - 0.5) * 0.00002,
          altitude: Math.max(15, t.altitude + (Math.random() - 0.5) * 0.3),
          speed: Math.max(0, 4.2 + Math.sin(Date.now() / 3000) * 1.5),
          verticalSpeed: (Math.random() - 0.5) * 0.4,
          battery: Math.max(10, t.battery - 0.003),
          rssi: -55 - Math.floor(Math.random() * 20),
          satellites: 10 + Math.floor(Math.random() * 4),
          heading: (t.heading + (Math.random() - 0.5) * 2 + 360) % 360,
          pitch: t.pitch + (Math.random() - 0.5) * 0.5,
          roll: t.roll + (Math.random() - 0.5) * 0.5,
          flightTime: state.streamRunning ? t.flightTime + 1 : t.flightTime,
        },
        timelineHistory: [...state.timelineHistory, { time: now, count: data.summary?.active_hazards || 0 }].slice(-CONFIG.CHART_HISTORY),
        riskHistory: [...state.riskHistory, { time: now, score: ({ LOW: 25, MODERATE: 50, HIGH: 75, CRITICAL: 100 }[riskLevel] || 25) }].slice(-CONFIG.CHART_HISTORY),
      };
    });
  },

  updateLocalVideoFrame: (frameInfo) => {
    set((state) => {
      const t = state.telemetry;
      const fId = frameInfo.frameId ?? 0;
      const time = frameInfo.currentTime ?? 0;
      // Calculate realistic telemetry with subtle variation based on video playback
      const altitude = 24.5 + Math.sin(time / 4) * 1.8 + (Math.random() - 0.5) * 0.2;
      const speed = Math.max(0, 5.4 + Math.cos(time / 3) * 2.1 + (Math.random() - 0.5) * 0.3);
      const heading = (245 + (time * 1.5) + Math.sin(time) * 3) % 360;
      const pitch = Math.sin(time / 2) * 3.5 + (Math.random() - 0.5) * 0.4;
      const roll = Math.cos(time / 2.5) * 4.2 + (Math.random() - 0.5) * 0.4;
      const lat = CONFIG.CENTER_LAT + Math.sin(time / 10) * 0.0008 + (Math.random() - 0.5) * 0.00001;
      const lon = CONFIG.CENTER_LON + Math.cos(time / 10) * 0.0008 + (Math.random() - 0.5) * 0.00001;
      const verticalSpeed = Math.cos(time / 4) * 0.4;
      const battery = Math.max(15, 87 - (time / 30));

      const totalArea = state.hazards.reduce((sum, h) => sum + (Number(h.surface_area_m2) || 0), 0);
      const hasCritical = state.hazards.some(h => (h.severity || severityFromArea(h.surface_area_m2)) === 'CRITICAL');
      const riskLevel = hasCritical ? 'CRITICAL' : 'HIGH';

      const updatedState = {
        ...(state.currentState || {}),
        stream_status: 'STREAMING',
        frame_id: fId,
        timestamp: Date.now() / 1000,
        summary: {
          active_hazards: state.hazards.length,
          total_affected_area: totalArea,
          total_area_m2: totalArea,
          overall_risk: riskLevel,
          risk_level: riskLevel,
          risk_score: hasCritical ? 95 : 70,
          action: hasCritical ? 'Issue emergency response and traffic reroute.' : 'Dispatch local maintenance crew.',
          alert_count: state.hazards.filter(h => ['CRITICAL','HIGH','MODERATE'].includes((h.severity || severityFromArea(h.surface_area_m2)).toUpperCase())).length,
        },
        hazards: state.hazards,
      };

      return {
        currentState: updatedState,
        streamRunning: true,
        telemetry: {
          ...t,
          latitude: lat,
          longitude: lon,
          altitude,
          speed,
          heading,
          pitch,
          roll,
          verticalSpeed,
          battery,
          flightTime: Math.floor(time),
          rssi: -58 - Math.floor(Math.sin(time) * 10),
          satellites: 12 + Math.floor(Math.sin(time / 5) * 2),
        },
      };
    });
  },

  connect: () => {
    const state = get();
    if (['CONNECTING', 'LIVE'].includes(state.connectionStatus)) return;
    set({ connectionStatus: 'CONNECTING' });
    get()._connectWS();
  },

  _connectWS: () => {
    const { settings, addLog, ingestData } = get();
    let ws;
    try { ws = new WebSocket(settings.wsUrl); }
    catch (e) {
      set({ connectionStatus: 'ERROR' });
      const t = setTimeout(() => get()._connectWS(), 5000);
      set({ reconnectTimer: t });
      return;
    }

    ws.onopen = () => {
      set({ connectionStatus: 'LIVE', wsRef: ws, streamRunning: true });
      addLog('WebSocket connected to backend');
      fetch(`${settings.apiUrl}/api/stream/start`)
        .then(r => r.json()).then(d => addLog(`Stream: ${d.message || 'started'}`))
        .catch(() => addLog('Stream start failed - check backend'));
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        if (raw.error) { addLog(`Backend error: ${raw.error}`); return; }
        const s = raw.summary || {};
        const totalArea = s.total_affected_area ?? s.total_area_m2 ?? 0;
        const riskLevel = s.overall_risk ?? s.risk_level ?? 'LOW';
        ingestData({
          stream_status: raw.stream_status || 'LIVE',
          frame_id: raw.frame_id ?? 0,
          timestamp: raw.timestamp ?? Date.now() / 1000,
          summary: {
            active_hazards: s.active_hazards ?? raw.hazards?.length ?? 0,
            total_affected_area: totalArea,
            total_area_m2: totalArea,
            overall_risk: riskLevel,
            risk_level: riskLevel,
            risk_score: ({ LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 }[riskLevel] ?? 1),
            action: s.action ?? '',
            alert_count: s.alert_count ?? s.total_cumulative_hazards ?? 0,
          },
          hazards: (raw.hazards || []).map(h => ({
            hazard_id: h.hazard_id ?? null,
            track_id: h.track_id ?? h.id ?? 0,
            type: h.type ?? 'pothole',
            confidence: h.confidence ?? 1.0,
            surface_area_m2: Number(h.surface_area_m2 ?? h.area ?? 0),
            severity: h.severity ?? null,
            priority_score: h.priority_score ?? null,
            zone: h.zone ?? null,
            status: h.status ?? 'OPEN',
            visual_evidence_url: h.visual_evidence_url ?? null,
            bbox: h.bbox || [],
            location: { ...(h.location || {}) },
          })),
        });
      } catch (e) { console.error('WS parse:', e); }
    };

    ws.onerror = () => set({ connectionStatus: 'ERROR' });

    ws.onclose = () => {
      set({ connectionStatus: 'RECONNECTING', streamRunning: false });
      addLog('WebSocket disconnected. Reconnecting in 3s...');
      const t = setTimeout(() => get()._connectWS(), 3000);
      set({ reconnectTimer: t });
    };

    set({ wsRef: ws });
  },

  disconnect: () => {
    const { wsRef, reconnectTimer } = get();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (wsRef) { wsRef.onclose = null; wsRef.close(); }
    set({ connectionStatus: 'DISCONNECTED', wsRef: null, streamRunning: false });
    get().addLog('Disconnected from backend');
  },

  startStream: async () => {
    const { settings, videoPath, addLog } = get();
    try {
      const url = new URL(`${settings.apiUrl}/api/stream/start`);
      if (videoPath) url.searchParams.append('video_path', videoPath);
      const res = await fetch(url.toString());
      const data = await res.json();
      addLog(`Stream start: ${data.message || 'OK'}`);
      set({ streamRunning: true });
    } catch { addLog('Stream start failed'); }
  },

  stopStream: async () => {
    const { settings, addLog } = get();
    try {
      const res = await fetch(`${settings.apiUrl}/api/stream/stop`);
      const data = await res.json();
      addLog(`Stream stopped: ${data.message || 'OK'}`);
      set({ streamRunning: false });
    } catch { addLog('Stream stop failed'); }
  },

  resetStream: async () => {
    await get().stopStream();
    set({ hazards: [], currentState: null, previousState: null, timelineHistory: [], riskHistory: [] });
    get().addLog('Stream reset');
  },

  updateHazardStatus: async (hazardId, status) => {
    const { settings, addLog } = get();
    try {
      await fetch(`${settings.apiUrl}/api/hazards/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hazard_id: hazardId, status }),
      });
      addLog(`Hazard ${hazardId} → ${status}`);
      set(state => ({
        hazards: state.hazards.map(h => h.hazard_id === hazardId ? { ...h, status } : h)
      }));
    } catch { addLog('Status update failed'); }
  },

  saveSettings: (s) => {
    set(state => ({ settings: { ...state.settings, ...s } }));
    get().addLog('Settings saved');
  },
}));

export { severityFromArea };
