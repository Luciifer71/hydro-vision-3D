import { create } from 'zustand';
import { supabase } from './lib/supabase.js';

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
  TYPE_LABELS: {
    pothole: 'Pothole',
    pothole_dry: 'Dry Pothole',
    pothole_waterlogged: 'Waterlogged Pothole',
    water_body: 'Water Body',
    waterlogging_area: 'Waterlogging Area',
    crack: 'Crack',
    flooding: 'Flooding',
    open_manhole: 'Open Manhole',
    drainage_overflow: 'Drainage Overflow',
    damaged_footpath: 'Damaged Footpath'
  },
  TYPE_ICONS: {
    pothole: 'P',
    pothole_dry: 'P',
    pothole_waterlogged: 'PW',
    water_body: 'W',
    waterlogging_area: 'WA',
    crack: 'C',
    flooding: 'F',
    open_manhole: 'M',
    drainage_overflow: 'D',
    damaged_footpath: 'DF'
  },
  TYPE_COLORS: {
    pothole: '#ef4444',
    pothole_dry: '#ef4444',
    pothole_waterlogged: '#f59e0b',
    water_body: '#00d4ff',
    waterlogging_area: '#3b82f6',
    crack: '#eab308',
    flooding: '#a855f7',
    open_manhole: '#dc2626',
    drainage_overflow: '#8b5cf6',
    damaged_footpath: '#f97316'
  },
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

export function parseGeoJsonFeatures(geojson) {
  if (!geojson || !geojson.features) return [];
  return geojson.features.map((feature, idx) => {
    const props = feature.properties || {};
    const coords = feature.geometry?.coordinates || [73.1812, 22.3072];
    const lon = coords[0];
    const lat = coords[1];
    const className = props.class_name || props.type || 'pothole_dry';
    const volume = Number(props.estimated_volume_m3) || 0.05;
    const confidence = props.confidence ?? 0.95;
    const detectionsCount = props.detections_count || 1;
    const hazardId = props.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;

    const area = props.surface_area_m2 || (volume * 100);
    const severity = props.severity || (volume >= 0.3 ? 'CRITICAL' : volume >= 0.15 ? 'HIGH' : volume >= 0.05 ? 'MODERATE' : 'LOW');

    return {
      hazard_id: hazardId,
      track_id: idx + 1,
      type: className,
      class_name: className,
      confidence: confidence,
      estimated_volume_m3: volume,
      detections_count: detectionsCount,
      surface_area_m2: area,
      severity: severity,
      priority_score: Math.round(confidence * 100),
      zone: `Zone ${String.fromCharCode(65 + (idx % 4))}`,
      status: props.status || 'OPEN',
      first_detected: props.first_detected,
      last_detected: props.last_detected,
      location: { latitude: lat, longitude: lon },
      raw_feature: feature,
    };
  });
}

const INITIAL_HAZARDS = [];

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
  feedMode: 'live',
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
    try {
      await fetch(`${get().settings.apiUrl}/api/stream/start`, { method: 'POST' });
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
    
    await get().resetStream();

    const blobUrl = URL.createObjectURL(file);
    const fileName = file.name;
    get().addLog(`Loaded pre-recorded video: ${fileName}`);

    set({
      videoPath: blobUrl,
      feedMode: 'video',
      streamRunning: true,
      currentPage: 'dashboard',
      viewMode: 'fly',
      hazards: [],          
      timelineHistory: [],  
      riskHistory: [],      
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${get().settings.apiUrl}/api/upload-video`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        get().addLog(`Uploaded ${fileName} to server — AI Pipeline Active`);
      }
    } catch (err) {
      console.warn('Backend upload warning:', err);
    }

    get().addLog(`Analyzing recorded video feed: ${fileName}`);
  },

  syncHazardsToSupabase: async () => {
    const hazards = get().hazards;
    if (!hazards || hazards.length === 0) {
      console.warn('[SUPABASE] No hazards to sync.');
      get().addLog('Supabase sync skipped: No active hazards.');
      return { success: false, count: 0 };
    }

    const payload = hazards.map(h => ({
      hazard_id: h.hazard_id || h.track_id || 'HAZ-UNKNOWN',
      class_name: h.class_name || h.type || 'pothole_dry',
      confidence: Number(h.confidence || 0.95),
      surface_area_m2: Number(h.surface_area_m2 || 0),
      estimated_volume_m3: Number(h.estimated_volume_m3 || h.volume_m3 || 0),
      latitude: Number(h.location?.latitude ?? h.latitude ?? 22.3072),
      longitude: Number(h.location?.longitude ?? h.longitude ?? 73.1812),
      severity: (h.severity || 'LOW').toUpperCase(),
      status: h.status || 'OPEN',
      zone: h.zone || 'Zone-A'
    }));

    const { data, error } = await supabase
      .from('mission_detections')
      .upsert(payload, { onConflict: 'hazard_id' });

    if (error) {
      console.error('[SUPABASE] Sync error:', error.message);
      get().addLog(`Supabase sync failed: ${error.message}`);
      return { success: false, error: error.message };
    }

    console.log(`[SUPABASE] Successfully persisted ${payload.length} records!`);
    get().addLog(`Successfully synced ${payload.length} hazards to Supabase.`);
    return { success: true, count: payload.length };
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

  fetchGeoJsonHazards: async () => {
    try {
      let res = await fetch('/hazards.geojson');
      if (!res.ok) {
        res = await fetch(`${get().settings.apiUrl}/api/hazards/geojson`);
      }
      if (res.ok) {
        const geojson = await res.json();
        if (geojson && geojson.features && geojson.features.length > 0) {
          const parsedHazards = parseGeoJsonFeatures(geojson);
          const totalArea = parsedHazards.reduce((sum, h) => sum + (Number(h.surface_area_m2) || 0), 0);
          
          set((state) => ({
            hazards: parsedHazards,
            currentState: {
              ...(state.currentState || {}),
              stream_status: 'LIVE',
              frame_id: 1,
              timestamp: Date.now() / 1000,
              summary: {
                active_hazards: parsedHazards.length,
                total_affected_area: totalArea,
                total_area_m2: totalArea,
                overall_risk: 'CRITICAL',
                risk_level: 'CRITICAL',
                risk_score: 95,
                action: 'Issue emergency response and traffic reroute.',
                alert_count: parsedHazards.length,
              },
              hazards: parsedHazards,
            }
          }));
          get().addLog(`Loaded ${parsedHazards.length} hazards from hazards.geojson`);
        }
      }
    } catch (e) {
      console.warn('GeoJSON fetch notice:', e);
    }
  },

  connect: () => {
    const state = get();
    if (['CONNECTING', 'LIVE'].includes(state.connectionStatus)) return;
    set({ connectionStatus: 'CONNECTING' });
    get()._connectWS();
  },

  _connectWS: () => {
    const { settings, addLog } = get();
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
      fetch(`${settings.apiUrl}/api/stream/start`, { method: 'POST' })
        .then(r => r.json()).then(d => addLog(`Stream: ${d.message || 'started'}`))
        .catch(() => addLog('Stream start failed - check backend'));
    };

    ws.onmessage = (event) => {
      try {
        const raw = JSON.parse(event.data);
        if (raw.error) { addLog(`Backend error: ${raw.error}`); return; }

        const rawHazards = raw.telemetry || raw.hazards || [];
        
        get().updateLocalVideoFrame({
          frameId: raw.frame_id ?? 0,
          currentTime: (raw.frame_id ?? 0) / 30,
        });

        const incomingParsed = rawHazards.map((h, idx) => ({
          hazard_id: h.id ?? `HAZ-${String(idx + 1).padStart(4, '0')}`,
          track_id: h.id ?? idx + 1,
          type: h.hazard ?? 'pothole_dry',
          class_name: h.hazard ?? 'pothole_dry',
          confidence: h.confidence ?? 1.0,
          surface_area_m2: Number(h.volume_m3 ? h.volume_m3 * 50 : 0),
          estimated_volume_m3: Number(h.volume_m3 ?? 0),
          severity: severityFromArea(h.volume_m3 ?? 0),
          status: 'OPEN',
          latitude: h.latitude,
          longitude: h.longitude,
          location: { latitude: h.latitude, longitude: h.longitude },
          last_detected: h.timestamp || new Date().toISOString(),
        }));

        set((state) => {
          const now = new Date().toLocaleTimeString('en-US', { hour12: false });
          const hazardMap = new Map(state.hazards.map((h) => [h.hazard_id, h]));
          incomingParsed.forEach((h) => hazardMap.set(h.hazard_id, h));
          const accumulatedHazards = Array.from(hazardMap.values());
          const totalArea = accumulatedHazards.reduce((sum, h) => sum + (Number(h.estimated_volume_m3) || 0), 0);
          const riskLevel = totalArea > 2.0 ? 'CRITICAL' : totalArea > 0.5 ? 'HIGH' : 'LOW';
          const rScore = riskLevel === 'CRITICAL' ? 100 : 25;

          return {
            stream_status: raw.status === 'online' ? 'LIVE' : 'STREAMING',
            frame_id: raw.frame_id ?? 0,
            hazards: accumulatedHazards,
            
            timelineHistory: [
              ...state.timelineHistory, 
              { time: now, count: accumulatedHazards.length }
            ].slice(-CONFIG.CHART_HISTORY),
            
            riskHistory: [
              ...state.riskHistory, 
              { time: now, score: rScore }
            ].slice(-CONFIG.CHART_HISTORY),

            currentState: {
              ...(state.currentState || {}),
              summary: {
                active_hazards: accumulatedHazards.length,
                total_affected_area: totalArea,
                total_area_m2: totalArea,
                overall_risk: riskLevel,
                risk_level: riskLevel,
                risk_score: rScore,
                action: riskLevel === 'CRITICAL' ? 'Issue emergency response and traffic reroute.' : 'Dispatch local maintenance crew.',
                alert_count: accumulatedHazards.length,
              },
              hazards: accumulatedHazards,
            }
          };
        });
      } catch (e) { console.error('WS parse:', e); }
    };

    ws.onclose = () => {
      set({ connectionStatus: 'DISCONNECTED', wsRef: null, streamRunning: false });
    };
  },

  disconnect: () => {
    const { wsRef, reconnectTimer, settings } = get();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (wsRef) { wsRef.onclose = null; wsRef.close(); }
    set({ connectionStatus: 'DISCONNECTED', wsRef: null, streamRunning: false });
    
    fetch(`${settings.apiUrl}/api/stream/stop`, { method: 'POST' })
      .catch((e) => console.warn('Could not reach backend to stop stream:', e));

    get().addLog('Disconnected from backend — System in Standby');
  },

  startStream: async () => {
    const { settings, videoPath, addLog } = get();
    try {
      const url = new URL(`${settings.apiUrl}/api/stream/start`);
      if (videoPath) url.searchParams.append('video_path', videoPath);
      const res = await fetch(url.toString(), { method: 'POST' });
      const data = await res.json();
      addLog(`Stream start: ${data.message || 'OK'}`);
      set({ streamRunning: true });
    } catch { addLog('Stream start failed'); }
  },

  stopStream: async () => {
    const { settings, addLog } = get();
    try {
      const res = await fetch(`${settings.apiUrl}/api/stream/stop`, { method: 'POST' });
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