import { create } from 'zustand';
import { supabase } from './lib/supabase.js';
import { computeSessionRisk } from './lib/derive.js';

const getBackendUrls = () => {
  if (typeof window === 'undefined') {
    return { apiUrl: '', wsUrl: 'ws://localhost:8000/ws/live-stream' };
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  
  return {
    apiUrl: '',
    wsUrl: `${wsProtocol}//${window.location.host}/ws/live-stream`
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
    damaged_footpath: 'Damaged Footpath',
    drainage_overflow: 'Drainage Overflow',
    open_manhole: 'Open Manhole',
    potholes: 'Potholes',
    waterlogging_area: 'Waterlogging Area'
  },
  TYPE_ICONS: {
    damaged_footpath: 'DF',
    drainage_overflow: 'D',
    open_manhole: 'M',
    potholes: 'P',
    waterlogging_area: 'WA'
  },
  TYPE_COLORS: {
    damaged_footpath: '#f97316',
    drainage_overflow: '#06b6d4',
    open_manhole: '#dc2626',
    potholes: '#ef4444',
    waterlogging_area: '#3b82f6'
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
    const className = props.class_name || props.type || 'unknown';
    const confidence = props.confidence != null ? Number(props.confidence) : (props.confidence_max != null ? Number(props.confidence_max) : null);
    const detectionsCount = props.detections_count || 1;
    const hazardId = props.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;

    const areaM2 = props.area_m2 != null ? Number(props.area_m2) : (props.surface_area_m2 != null ? Number(props.surface_area_m2) : null);
    const areaPx = props.area_px != null ? Number(props.area_px) : null;
    const depthIndex = props.relative_depth_index != null ? Number(props.relative_depth_index) : null;
    const severity = props.severity_band || props.severity || '—';

    const visualEvidenceUrl = props.visual_evidence_url || props.evidence_image || props.image_url || null;

    return {
      hazard_id: hazardId,
      track_id: props.track_id || idx + 1,
      type: className,
      class_name: className,
      confidence: confidence,
      detections_count: detectionsCount,
      area_m2: areaM2,
      area_px: areaPx,
      surface_area_m2: areaM2,
      relative_depth_index: depthIndex,
      severity: severity,
      severity_band: severity,
      priority_score: props.priority_score || (confidence != null ? Math.round(confidence * 100) : 50),
      zone: props.zone || null,
      status: props.status || 'OPEN',
      visual_evidence_url: visualEvidenceUrl,
      evidence_image: visualEvidenceUrl,
      first_detected: props.first_detected,
      last_detected: props.last_detected,
      location: { latitude: lat, longitude: lon },
      latitude: lat,
      longitude: lon,
      raw_feature: feature,
    };
  });
}

const MUNICIPAL_USERS = {
  admin: {
    id: 'USR-ADM-01',
    name: 'Dr. Rajesh Rao',
    email: 'chief.engineer@elcia.gov.in',
    role: 'admin',
    designation: 'Chief Municipal Engineer',
    department: 'Smart Infrastructure & Drone Operations',
    ward: 'All Wards',
    avatar: 'RR',
    permissions: [
      'drone:stream_control',
      'drone:upload_video',
      'config:modify',
      'hazard:assign_contractor',
      'hazard:audit_signoff',
      'budget:approve',
      'reports:export'
    ]
  },
  employee: {
    id: 'USR-EMP-04',
    name: 'Suresh Kumar',
    email: 'suresh.inspector@elcia.gov.in',
    role: 'employee',
    designation: 'Ward 1 Field Operations Inspector',
    department: 'Civic Remediation Division',
    ward: 'Ward 1 (North Sector)',
    avatar: 'SK',
    permissions: [
      'hazard:view',
      'hazard:upload_proof',
      'hazard:mark_progress',
      'reports:view'
    ]
  }
};

const INITIAL_HAZARDS = [];

export const useStore = create((set, get) => ({
  currentUser: (typeof window !== 'undefined' && localStorage.getItem('hv_user_role') === 'employee') 
    ? MUNICIPAL_USERS.employee 
    : MUNICIPAL_USERS.admin,

  switchUserRole: (roleKey) => {
    const newUser = MUNICIPAL_USERS[roleKey] || MUNICIPAL_USERS.admin;
    if (typeof window !== 'undefined') {
      localStorage.setItem('hv_user_role', newUser.role);
    }
    const isEmp = newUser.role === 'employee';
    set({ 
      currentUser: newUser,
      currentPage: isEmp ? 'municipal' : 'dashboard'
    });
    get().addLog(`Active User switched to: ${newUser.name} (${newUser.designation})`);
  },

  isAuthorized: (permission) => {
    const user = get().currentUser;
    if (user.role === 'admin') return true;
    return user.permissions?.includes(permission) || false;
  },

  connectionStatus: 'DISCONNECTED',
  wsRef: null,
  reconnectTimer: null,

  currentState: null,
  previousState: null,
  hazards: INITIAL_HAZARDS,
  currentSessionHazards: [],
  historicalHazards: [],
  allHazards: [],
  timelineHistory: [],
  riskHistory: [],
  lastSupabaseSync: 0,
  alertFilter: 'all',
  detectionSearch: '',
  detectionTypeFilter: 'all',
  logs: ['Dashboard initialized'],

  telemetry: {
    altitude: null, latitude: null, longitude: null,
    speed: null, battery: null, rssi: null,
    flightTime: 0, satellites: null, heading: null, verticalSpeed: null, pitch: null, roll: null,
  },
  trajectory: [],

  viewMode: 'fly',
  feedMode: (typeof window !== 'undefined' && localStorage.getItem('hv_feed_mode')) || 'video',
  currentPage: typeof window !== 'undefined' && window.location.pathname.length > 1 ? window.location.pathname.replace('/', '') : 'dashboard',
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

  setPage: (page) => {
    if (typeof window !== 'undefined') window.history.pushState({}, '', `/${page}`);
    set({ currentPage: page });
  },
  setViewMode: (mode) => set({ viewMode: mode }),
  setFeedMode: (mode) => {
    if (typeof window !== 'undefined') localStorage.setItem('hv_feed_mode', mode);
    set({ feedMode: mode });
  },
  setAlertFilter: (filter) => set({ alertFilter: filter }),
  setDetectionSearch: (q) => set({ detectionSearch: q }),
  setDetectionTypeFilter: (t) => set({ detectionTypeFilter: t }),
  setVideoPath: (p) => {
    const mode = p ? 'video' : 'live';
    if (typeof window !== 'undefined') localStorage.setItem('hv_feed_mode', mode);
    set({ videoPath: p, feedMode: mode });
  },
  setSettings: (s) => set((state) => ({ settings: { ...state.settings, ...s } })),

  switchToLiveFeed: async () => {
    if (typeof window !== 'undefined') localStorage.setItem('hv_feed_mode', 'live');
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

    if (typeof window !== 'undefined') localStorage.setItem('hv_feed_mode', 'video');

    set({
      videoPath: blobUrl,
      feedMode: 'video',
      streamRunning: true,
      currentPage: 'dashboard',
      viewMode: 'fly',
      frame_id: 0,
      currentState: null,
      telemetry: {
        altitude: null, latitude: null, longitude: null,
        speed: null, battery: null, rssi: null,
        flightTime: 0, satellites: null, heading: null, verticalSpeed: null, pitch: null, roll: null,
      },
      hazards: [],          
      currentSessionHazards: [],
      timelineHistory: [],  
      riskHistory: [],      
    });

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${get().settings.apiUrl}/api/upload-video`, {
        method: 'POST',
        headers: {
          'X-User-Role': get().currentUser?.role || 'admin'
        },
        body: formData,
      });
      if (res.status === 403) {
        get().addLog('[SECURITY ALERT] Video upload rejected: Municipal Administrator privilege required.');
        return;
      }
      if (res.ok) {
        get().addLog(`Uploaded ${fileName} to server — AI Pipeline Active`);
        await get().fetchGeoJsonHazards();
      } else {
        await get().fetchGeoJsonHazards();
      }
    } catch (err) {
      console.warn('Backend upload warning:', err);
      await get().fetchGeoJsonHazards();
    }

    get().addLog(`Analyzing recorded video feed: ${fileName}`);
  },

  syncHazardsToSupabase: async (hazardsToSync = null) => {
    const st = get();
    let hazards = hazardsToSync;
    if (!hazards || hazards.length === 0) {
      if (st.currentSessionHazards && st.currentSessionHazards.length > 0) {
        hazards = st.currentSessionHazards;
      } else if (st.hazards && st.hazards.length > 0) {
        hazards = st.hazards;
      } else if (st.allHazards && st.allHazards.length > 0) {
        hazards = st.allHazards;
      }
    }

    if (!hazards || hazards.length === 0) {
      console.warn('[SUPABASE] No hazards to sync.');
      get().addLog('Supabase sync skipped: No active hazards.');
      return { success: false, count: 0 };
    }

    const CLASS_ID_MAP = {
      potholes: 0,
      pothole_dry: 0,
      pothole_waterlogged: 1,
      open_manhole: 2,
      waterlogging_area: 3,
      damaged_footpath: 4,
      drainage_overflow: 5,
    };

    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date();
    const nowIso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}+05:30`;
    const nowIstText = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} IST`;

    // 1. Primary: Upsert into 'hazards' table with exact schema & PostGIS POINT
    const hazardsPayload = hazards.map((h, idx) => {
      const lat = Number(h.location?.latitude ?? h.latitude ?? 22.3072);
      const lon = Number(h.location?.longitude ?? h.longitude ?? 73.1812);
      const cls = (h.class_name || h.type || 'potholes').toLowerCase();
      const classId = CLASS_ID_MAP[cls] ?? 0;
      const conf = h.confidence != null ? Number(Number(h.confidence).toFixed(4)) : 0.85;
      const hid = h.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;
      const areaM2 = h.surface_area_m2 != null ? Number(h.surface_area_m2) : (h.area_m2 != null ? Number(h.area_m2) : null);
      const volM3 = areaM2 != null ? Number((areaM2 * 0.05).toFixed(4)) : (h.volumetric_m3 != null ? Number(h.volumetric_m3) : 0.0250);
      return {
        hazard_id: hid,
        ticket_id: h.ticket_id || hid,
        class_id: classId,
        class_name: h.class_name || h.type || 'potholes',
        confidence: conf,
        latitude: lat,
        longitude: lon,
        volumetric_m3: volM3,
        estimated_volume_m3: volM3,
        wgs84_coords: { latitude: lat, longitude: lon, lat, lon },
        location: `POINT(${lon} ${lat})`,
        detections_count: h.detections_count || 1,
        first_detected: h.first_detected || nowIso,
        last_detected: h.last_detected || nowIso,
        first_detected_ist: h.first_detected_ist || nowIstText,
        last_detected_ist: h.last_detected_ist || nowIstText,
      };
    });

    // 2. Secondary: Insert into 'mission_detections' table
    const missionPayload = hazards.map((h, idx) => {
      const lat = Number(h.location?.latitude ?? h.latitude ?? 22.3072);
      const lon = Number(h.location?.longitude ?? h.longitude ?? 73.1812);
      const cls = h.class_name || h.type || 'potholes';
      const conf = h.confidence != null ? Number(Number(h.confidence).toFixed(4)) : 0.85;
      const hid = h.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;
      const sev = (h.severity_band || h.severity || 'LOW').toUpperCase();
      let visualEvidenceUrl = h.visual_evidence_url || h.evidence_image || h.image_url;
      if (!visualEvidenceUrl || visualEvidenceUrl.startsWith('data:image')) {
        visualEvidenceUrl = `/api/hazards/${hid}/evidence`;
      }

      return {
        hazard_id: hid,
        class_name: cls,
        confidence: conf,
        latitude: lat,
        longitude: lon,
        severity: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(sev) ? sev : 'LOW',
        status: h.status || 'OPEN',
        surface_area_m2: areaM2,
        zone: h.zone || 'Ward-1',
        visual_evidence_url: visualEvidenceUrl,
      };
    });

    let syncSuccess = false;
    let syncedCount = 0;

    try {
      const resHazards = await supabase.from('hazards').upsert(hazardsPayload, { onConflict: 'hazard_id' });
      if (!resHazards.error) {
        syncSuccess = true;
        syncedCount = hazardsPayload.length;
        get().addLog(`[SUPABASE CLOUD] Synced ${syncedCount} hazards to hazards table`);
        
        // Merge synced hazards directly into local allHazards state
        set(state => {
          const allMap = new Map();
          (state.historicalHazards || []).forEach(h => allMap.set(h.hazard_id, h));
          (state.allHazards || []).forEach(h => allMap.set(h.hazard_id, h));
          hazards.forEach(h => {
            const ex = allMap.get(h.hazard_id);
            allMap.set(h.hazard_id, { ...(ex || {}), ...h });
          });
          const updatedAll = Array.from(allMap.values());
          return {
            allHazards: updatedAll,
            historicalHazards: updatedAll
          };
        });
      } else {
        console.warn('[SUPABASE] Hazards table sync notice:', resHazards.error.message);
      }
    } catch (e) {
      console.warn('[SUPABASE] Hazards upsert catch:', e);
    }

    try {
      const resMd = await supabase.from('mission_detections').insert(missionPayload);
      if (!resMd.error) {
        syncSuccess = true;
        syncedCount = missionPayload.length;
        get().addLog(`[SUPABASE CLOUD] Recorded ${syncedCount} items to mission_detections`);
      }
    } catch (e) {
      console.warn('[SUPABASE] mission_detections catch:', e);
    }

    if (syncSuccess) {
      return { success: true, count: syncedCount };
    }
    get().addLog('Supabase sync warning: please verify network connection');
    return { success: false, error: 'Sync failed on all tables' };
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
          latitude: lat,
          longitude: lon,
          flightTime: state.streamRunning ? t.flightTime + 1 : t.flightTime,
        },
        timelineHistory: [...state.timelineHistory, { time: now, count: data.summary?.active_hazards || 0 }].slice(-CONFIG.CHART_HISTORY),
        riskHistory: [...state.riskHistory, { time: now, score: ({ LOW: 25, MODERATE: 50, HIGH: 75, CRITICAL: 100 }[riskLevel] || 25) }].slice(-CONFIG.CHART_HISTORY),
      };
    });
  },

  updateLocalVideoFrame: (frameInfo) => {
    set((state) => {
      const t = state.telemetry || {};
      const fId = frameInfo.frameId ?? state.currentState?.frame_id ?? 0;
      const time = frameInfo.currentTime ?? (fId / 30);

      const totalArea = state.hazards.reduce((sum, h) => sum + (Number(h.surface_area_m2) || 0), 0);
      const { riskScore, riskLevel } = computeSessionRisk(state.hazards, {});

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
          risk_score: riskScore,
          action: riskLevel === 'CRITICAL' ? 'Issue emergency response and traffic reroute.' : 'Dispatch local maintenance crew.',
          alert_count: state.hazards.filter(h => ['CRITICAL','HIGH','MODERATE'].includes((h.severity || 'LOW').toUpperCase())).length,
          frames_processed: fId,
        },
        hazards: state.hazards,
      };

      return {
        frame_id: fId,
        currentState: updatedState,
        streamRunning: true,
        telemetry: {
          ...t,
          flightTime: Math.floor(time),
        },
        trajectory: state.trajectory || [],
      };
    });
  },

  fetchGeoJsonHazards: async () => {
    try {
      let res = await fetch('/hazards.geojson').catch(() => ({ ok: false }));
      if (!res.ok) {
        res = await fetch(`${get().settings.apiUrl}/api/hazards/geojson`).catch(() => ({ ok: false }));
      }
      if (!res.ok) {
        res = await fetch(`${get().settings.apiUrl}/api/hazards`).catch(() => ({ ok: false }));
      }
      if (!res.ok) {
        res = await fetch(`${get().settings.apiUrl}/api/sessions/latest/hazards`).catch(() => ({ ok: false }));
      }

      if (res && res.ok) {
        const data = await res.json();
        let parsedHazards = [];
        if (data.features) {
          parsedHazards = parseGeoJsonFeatures(data);
        } else if (data.hazards && Array.isArray(data.hazards)) {
          parsedHazards = data.hazards.map((h, idx) => {
            const lat = Number(h.lat ?? h.latitude ?? 22.3072);
            const lon = Number(h.lon ?? h.longitude ?? 73.1812);
            const className = h.class_name || h.hazard || 'unknown';
            const hid = h.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;
            const areaM2 = h.area_m2 != null ? Number(h.area_m2) : (h.surface_area_m2 != null ? Number(h.surface_area_m2) : null);
            const visualEvidenceUrl = h.visual_evidence_url || h.evidence_image || `/api/hazards/${hid}/evidence`;
            return {
              hazard_id: hid,
              ticket_id: h.ticket_id || hid,
              track_id: h.track_id || idx + 1,
              type: className,
              class_name: className,
              confidence: h.confidence_max != null ? Number(h.confidence_max) : (h.confidence != null ? Number(h.confidence) : 0.85),
              detections_count: h.detections_count || 1,
              area_m2: areaM2,
              surface_area_m2: areaM2,
              severity: (h.severity_band || h.severity || 'LOW').toUpperCase(),
              severity_band: (h.severity_band || h.severity || 'LOW').toUpperCase(),
              priority_score: h.priority_score || 50,
              status: h.status || 'OPEN',
              visual_evidence_url: visualEvidenceUrl,
              evidence_image: visualEvidenceUrl,
              latitude: lat,
              longitude: lon,
              location: { latitude: lat, longitude: lon },
              last_detected: new Date().toISOString(),
              first_detected_ist: new Date().toLocaleString('en-IN') + ' IST',
            };
          });
        }

        if (parsedHazards.length > 0) {
          const totalArea = parsedHazards.reduce((sum, h) => sum + (Number(h.surface_area_m2) || 0), 0);
          const { riskScore, riskLevel } = computeSessionRisk(parsedHazards, {});
          
          set((state) => {
            const allMap = new Map();
            (state.historicalHazards || []).forEach(h => allMap.set(h.hazard_id, h));
            (state.allHazards || []).forEach(h => allMap.set(h.hazard_id, h));
            parsedHazards.forEach(h => allMap.set(h.hazard_id, h));
            const mergedAll = Array.from(allMap.values());

            return {
              hazards: parsedHazards,
              currentSessionHazards: parsedHazards,
              allHazards: mergedAll,
              currentState: {
                ...(state.currentState || {}),
                stream_status: 'LIVE',
                frame_id: state.currentState?.frame_id || 1,
                timestamp: Date.now() / 1000,
                summary: {
                  active_hazards: parsedHazards.length,
                  total_affected_area: totalArea,
                  total_area_m2: totalArea,
                  overall_risk: riskLevel,
                  risk_level: riskLevel,
                  risk_score: riskScore,
                  action: riskLevel === 'CRITICAL' ? 'Issue emergency response and traffic reroute.' : 'Dispatch local maintenance crew.',
                  alert_count: parsedHazards.length,
                },
                hazards: parsedHazards,
              }
            };
          });
          get().addLog(`Loaded ${parsedHazards.length} hazards from session detection pipeline`);
          
          // Auto-sync new session hazards to Supabase Cloud!
          await get().syncHazardsToSupabase(parsedHazards);
        }
      }
    } catch (e) {
      console.warn('Session hazards fetch notice:', e);
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
        const stageStatus = raw.stage_status || {};
        const incomingFrameId = raw.frame_id ?? raw.summary?.frame_id ?? raw.summary?.frames_processed;

        const incomingParsed = rawHazards.map((h, idx) => {
          const areaM2 = h.area_m2 != null ? Number(h.area_m2) : (h.surface_area_m2 != null ? Number(h.surface_area_m2) : null);
          const areaPx = h.area_px != null ? Number(h.area_px) : null;
          const depthIndex = h.relative_depth_index != null ? Number(h.relative_depth_index) : null;
          const severityBand = h.severity_band || h.severity ? (h.severity_band || h.severity).toUpperCase() : '—';
          const conf = h.confidence != null ? Number(h.confidence) : (h.confidence_max != null ? Number(h.confidence_max) : null);
          const visualEvidenceUrl = h.visual_evidence_url || h.evidence_image || h.image_url || null;

          return {
            hazard_id: h.hazard_id ?? h.id ?? `HAZ-${String(idx + 1).padStart(4, '0')}`,
            track_id: h.track_id ?? h.id ?? idx + 1,
            type: h.class_name ?? h.hazard ?? 'unknown',
            class_name: h.class_name ?? h.hazard ?? 'unknown',
            confidence: conf,
            detections_count: h.detections_count || 1,
            area_m2: areaM2,
            area_px: areaPx,
            surface_area_m2: areaM2,
            relative_depth_index: depthIndex,
            severity: severityBand,
            severity_band: severityBand,
            status: h.status || 'OPEN',
            visual_evidence_url: visualEvidenceUrl,
            evidence_image: visualEvidenceUrl,
            latitude: h.latitude ?? h.location?.latitude,
            longitude: h.longitude ?? h.location?.longitude,
            location: { latitude: h.latitude ?? h.location?.latitude, longitude: h.longitude ?? h.location?.longitude },
            last_detected: h.timestamp || new Date().toISOString(),
          };
        });

        set((state) => {
          const now = new Date().toLocaleTimeString('en-US', { hour12: false });
          const sessionMap = new Map();
          
          // Accumulate strictly into current session hazards (avoid polluting with 277 old historical hazards)
          (state.currentSessionHazards || []).forEach((h) => sessionMap.set(h.hazard_id, h));
          
          // Merge incoming hazards non-destructively
          incomingParsed.forEach((inc) => {
            const existing = sessionMap.get(inc.hazard_id);
            const merged = {
              ...(existing || {}),
              ...inc,
              visual_evidence_url: inc.visual_evidence_url || existing?.visual_evidence_url || inc.evidence_image || existing?.evidence_image || null,
              evidence_image: inc.evidence_image || existing?.evidence_image || inc.visual_evidence_url || existing?.visual_evidence_url || null,
              hasProof: inc.hasProof || existing?.hasProof || false,
              rejection_reason: inc.rejection_reason || existing?.rejection_reason || null,
            };
            sessionMap.set(inc.hazard_id, merged);
          });

          const sessionHazards = Array.from(sessionMap.values());
          const validAreas = sessionHazards.map(h => h.area_m2 ?? h.surface_area_m2).filter(a => a != null);
          const totalArea = validAreas.reduce((sum, a) => sum + Number(a), 0);
          const { riskScore, riskLevel } = computeSessionRisk(sessionHazards, raw.summary || {});

          const currentFId = incomingFrameId != null
            ? incomingFrameId
            : (state.currentState?.frame_id ?? state.frame_id ?? 0);

          // Merge current session into allHazards without mutating historicalHazards
          const allMap = new Map();
          (state.historicalHazards || []).forEach(h => allMap.set(h.hazard_id, h));
          (state.allHazards || []).forEach(h => allMap.set(h.hazard_id, h));
          sessionHazards.forEach(h => allMap.set(h.hazard_id, h));
          const allAccumulated = Array.from(allMap.values());

          return {
            stream_status: raw.status === 'online' ? 'LIVE' : 'STREAMING',
            frame_id: currentFId,
            stage_status: stageStatus,
            hazards: sessionHazards,
            currentSessionHazards: sessionHazards,
            allHazards: allAccumulated,
            
            telemetry: state.feedMode === 'video' ? {
              altitude: null, latitude: null, longitude: null,
              speed: null, battery: null, rssi: null,
              flightTime: state.telemetry?.flightTime || 0,
              satellites: null, heading: null, verticalSpeed: null, pitch: null, roll: null,
            } : state.telemetry,

            timelineHistory: [
              ...state.timelineHistory, 
              { time: now, count: sessionHazards.length }
            ].slice(-CONFIG.CHART_HISTORY),
            
            riskHistory: [
              ...state.riskHistory, 
              { time: now, score: riskScore }
            ].slice(-CONFIG.CHART_HISTORY),

            currentState: {
              ...(state.currentState || {}),
              stream_status: raw.status === 'online' ? 'LIVE' : 'STREAMING',
              frame_id: currentFId,
              timestamp: Date.now() / 1000,
              summary: {
                active_hazards: sessionHazards.length,
                total_affected_area: totalArea,
                total_area_m2: totalArea,
                overall_risk: riskLevel,
                risk_level: riskLevel,
                risk_score: riskScore,
                action: riskLevel === 'CRITICAL' ? 'Issue emergency response and traffic reroute.' : 'Dispatch local maintenance crew.',
                alert_count: sessionHazards.length,
                frames_processed: currentFId,
              },
              hazards: sessionHazards,
            }
          };
        });

        // Background Auto-Sync logic (debounced to 8 seconds or on finish)
        const st = get();
        if (st.currentSessionHazards && st.currentSessionHazards.length > 0) {
          const nowMs = Date.now();
          if (nowMs - st.lastSupabaseSync > 8000 || raw.summary?.finished) {
            set({ lastSupabaseSync: nowMs });
            get().syncHazardsToSupabase(st.currentSessionHazards);
          }
        }
      } catch (e) { console.error('WS parse:', e); }
    };

    ws.onclose = () => {
      set({ connectionStatus: 'DISCONNECTED', wsRef: null, streamRunning: false });
    };
  },

  disconnect: () => {
    const { wsRef, reconnectTimer, settings, currentUser } = get();
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (wsRef) {
      wsRef.onclose = null;
      wsRef.onerror = null;
      wsRef.onmessage = null;
      try { wsRef.close(); } catch {}
    }
    set({ 
      connectionStatus: 'DISCONNECTED', 
      wsRef: null, 
      streamRunning: false,
      reconnectTimer: null 
    });
    
    fetch(`${settings.apiUrl}/api/stream/stop`, { 
      method: 'POST',
      headers: { 'X-User-Role': currentUser?.role || 'admin' }
    }).catch(() => {});

    get().addLog('Disconnected from backend — System in Standby');
  },

  startStream: async () => {
    const { settings, videoPath, addLog, currentUser } = get();
    try {
      const url = new URL(`${settings.apiUrl}/api/stream/start`);
      if (videoPath) url.searchParams.append('video_path', videoPath);
      const res = await fetch(url.toString(), { 
        method: 'POST',
        headers: { 'X-User-Role': currentUser?.role || 'admin' }
      });
      const data = await res.json();
      addLog(`Stream start: ${data.message || 'OK'}`);
      set({ streamRunning: true });
    } catch { addLog('Stream start failed'); }
  },

  stopStream: async () => {
    const { settings, addLog, currentUser } = get();
    try {
      const res = await fetch(`${settings.apiUrl}/api/stream/stop`, { 
        method: 'POST',
        headers: { 'X-User-Role': currentUser?.role || 'admin' }
      });
      const data = await res.json();
      addLog(`Stream stopped: ${data.message || 'OK'}`);
      set({ streamRunning: false });
    } catch { addLog('Stream stop failed'); }
  },

  resetStream: async () => {
    await get().stopStream();
    set(state => ({ 
      hazards: [], 
      currentSessionHazards: [],
      allHazards: state.historicalHazards || [],
      currentState: null, 
      previousState: null, 
      timelineHistory: [], 
      riskHistory: [], 
      trajectory: [] 
    }));
    get().addLog('Stream reset — Current session cleared');
  },

  updateHazardStatus: async (hazardId, status, extra = {}) => {
    const { settings, addLog, currentUser } = get();
    
    // Sync status update directly to Supabase Cloud hazards table
    try {
      const updatePayload = { status: status };
      if (extra.rejection_reason) updatePayload.rejection_reason = extra.rejection_reason;
      await supabase
        .from('hazards')
        .update(updatePayload)
        .eq('hazard_id', hazardId);
    } catch (e) {
      console.warn('[SUPABASE] Status update sync warning:', e);
    }

    const updater = h => (h.hazard_id === hazardId || h.track_id === hazardId) ? { ...h, status, ...extra } : h;

    try {
      const res = await fetch(`${settings.apiUrl}/api/hazards/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Role': currentUser?.role || 'admin'
        },
        body: JSON.stringify({ 
          hazard_id: hazardId, 
          status,
          inspector: currentUser?.name || 'Field Officer',
          ...extra 
        }),
      });

      if (res.status === 403) {
        const err = await res.json().catch(() => ({}));
        addLog(`[SECURITY ALERT] ${err.detail || 'Authorization required for this status change.'}`);
        return { success: false, error: err.detail };
      }

      addLog(`Hazard ${hazardId} → ${status}`);
      set(state => ({
        hazards: state.hazards.map(updater),
        currentSessionHazards: state.currentSessionHazards.map(updater),
        historicalHazards: state.historicalHazards.map(updater),
        allHazards: state.allHazards.map(updater)
      }));
      return { success: true };
    } catch {
      addLog(`Hazard ${hazardId} status updated locally → ${status}`);
      set(state => ({
        hazards: state.hazards.map(updater),
        currentSessionHazards: state.currentSessionHazards.map(updater),
        historicalHazards: state.historicalHazards.map(updater),
        allHazards: state.allHazards.map(updater)
      }));
      return { success: true };
    }
  },

  fetchSupabaseHazardsHistory: async () => {
    try {
      // 1. Ingest latest session hazards (from backend or static mirror)
      try {
        let latestData = null;
        const latestRes = await fetch(`${get().settings.apiUrl}/api/sessions/latest/hazards`).catch(() => null);
        if (latestRes && latestRes.ok) {
          latestData = await latestRes.json();
        }
        if (!latestData || !latestData.hazards || latestData.hazards.length === 0) {
          const staticRes = await fetch('/latest_session_hazards.json').catch(() => null);
          if (staticRes && staticRes.ok) {
            latestData = await staticRes.json();
          }
        }
        if (latestData && latestData.hazards && latestData.hazards.length > 0) {
          const latestParsed = latestData.hazards.map((h, idx) => {
            const lat = Number(h.lat ?? h.latitude ?? 22.3072);
            const lon = Number(h.lon ?? h.longitude ?? 73.1812);
            const className = h.class_name || h.hazard || 'unknown';
            const hid = h.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;
            const areaM2 = h.area_m2 != null ? Number(h.area_m2) : (h.surface_area_m2 != null ? Number(h.surface_area_m2) : null);
            const visualEvidenceUrl = h.visual_evidence_url || h.evidence_image || `/api/hazards/${hid}/evidence`;
            return {
              hazard_id: hid,
              ticket_id: h.ticket_id || hid,
              track_id: h.track_id || idx + 1,
              type: className,
              class_name: className,
              confidence: h.confidence_max != null ? Number(h.confidence_max) : (h.confidence != null ? Number(h.confidence) : 0.85),
              detections_count: h.detections_count || 1,
              area_m2: areaM2,
              surface_area_m2: areaM2,
              severity: (h.severity_band || h.severity || 'LOW').toUpperCase(),
              severity_band: (h.severity_band || h.severity || 'LOW').toUpperCase(),
              priority_score: h.priority_score || 50,
              status: 'OPEN',
              visual_evidence_url: visualEvidenceUrl,
              evidence_image: visualEvidenceUrl,
              latitude: lat,
              longitude: lon,
              location: { latitude: lat, longitude: lon },
              last_detected: h.last_detected || new Date().toISOString(),
              first_detected_ist: h.first_detected_ist || new Date().toLocaleString('en-IN') + ' IST',
              source: 'Latest Session Archive'
            };
          });

          set({ currentSessionHazards: latestParsed });
        }
      } catch (backendSyncErr) {
        console.warn('Backend local session auto-sync notice:', backendSyncErr);
      }

      // 2. Fetch all consolidated records from Supabase Cloud
      let dbHazards = null;
      try {
        const { data, error } = await supabase
          .from('hazards')
          .select('*')
          .order('last_detected', { ascending: false });

        if (!error && data && data.length > 0) {
          dbHazards = data;
        } else if (error) {
          console.warn('[SUPABASE] Fetch hazards notice:', error.message);
        }
      } catch (cloudErr) {
        console.warn('[SUPABASE] Query notice:', cloudErr);
      }

      // 3. Fallback to static archive if cloud query returned no data
      if (!dbHazards || dbHazards.length === 0) {
        const mirrorRes = await fetch('/all_session_hazards.json').catch(() => null);
        if (mirrorRes && mirrorRes.ok) {
          const mirrorData = await mirrorRes.json();
          dbHazards = mirrorData.hazards || mirrorData;
        }
      }

      if (dbHazards && dbHazards.length > 0) {
        const parsed = dbHazards.map((h, idx) => {
          const lat = Number(h.latitude ?? 22.3072);
          const lon = Number(h.longitude ?? 73.1812);
          const className = h.class_name || 'potholes';
          const volumeM3 = h.volumetric_m3 != null ? Number(h.volumetric_m3) : (h.estimated_volume_m3 != null ? Number(h.estimated_volume_m3) : null);
          const areaM2 = volumeM3 != null ? Number((volumeM3 / 0.05).toFixed(2)) : 5.0;
          const hid = h.hazard_id || `HAZ-${String(idx + 1).padStart(4, '0')}`;
          const visualEvidenceUrl = h.visual_evidence_url || h.evidence_image || h.image_url || `/api/hazards/${hid}/evidence`;

          return {
            hazard_id: hid,
            ticket_id: h.ticket_id || hid,
            track_id: idx + 1,
            type: className,
            class_name: className,
            confidence: h.confidence != null ? Number(h.confidence) : 0.85,
            detections_count: h.detections_count || 1,
            area_m2: areaM2,
            surface_area_m2: areaM2,
            volumetric_m3: volumeM3,
            estimated_volume_m3: volumeM3,
            wgs84_coords: h.wgs84_coords || { latitude: lat, longitude: lon, lat, lon },
            severity: severityFromArea(areaM2),
            severity_band: severityFromArea(areaM2),
            status: h.status || 'OPEN',
            rejection_reason: h.rejection_reason || null,
            visual_evidence_url: visualEvidenceUrl,
            evidence_image: visualEvidenceUrl,
            latitude: lat,
            longitude: lon,
            location: { latitude: lat, longitude: lon },
            first_detected: h.first_detected,
            last_detected: h.last_detected,
            first_detected_ist: h.first_detected_ist,
            last_detected_ist: h.last_detected_ist,
            source: 'Supabase Cloud DB'
          };
        });

        set(state => {
          const map = new Map();
          // Insert parsed DB hazards
          parsed.forEach(h => map.set(h.hazard_id, h));
          
          // Merge current session hazards non-destructively into allHazards
          (state.currentSessionHazards || []).forEach(h => {
            const existing = map.get(h.hazard_id);
            const merged = {
              ...(existing || {}),
              ...h,
              visual_evidence_url: h.visual_evidence_url || existing?.visual_evidence_url || h.evidence_image || existing?.evidence_image || null,
              evidence_image: h.evidence_image || existing?.evidence_image || h.visual_evidence_url || existing?.visual_evidence_url || null,
              hasProof: h.hasProof || existing?.hasProof || false,
              rejection_reason: h.rejection_reason || existing?.rejection_reason || null,
            };
            map.set(h.hazard_id, merged);
          });
          
          const merged = Array.from(map.values());
          return { 
            historicalHazards: parsed,
            allHazards: merged,
            hazards: state.currentSessionHazards && state.currentSessionHazards.length > 0 ? state.currentSessionHazards : merged,
            supabaseLoaded: true 
          };
        });

        get().addLog(`[SUPABASE CLOUD] Synchronized ${parsed.length} historical hazards from Cloud Database.`);
        return { success: true, count: parsed.length };
      }
      return { success: true, count: 0 };
    } catch (err) {
      console.warn('[SUPABASE] Fetch catch:', err);
      return { success: false, error: err.message };
    }
  },

  confidenceThreshold: 0.20,
  sendThreshold: (value) => {
    set({ confidenceThreshold: value });
    const { wsRef, addLog } = get();
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      try {
        wsRef.send(JSON.stringify({ type: 'CONFIDENCE_THRESHOLD', value }));
        addLog(`AI Confidence Threshold set to ${(value * 100).toFixed(0)}% (${value.toFixed(2)})`);
      } catch (e) {
        console.warn('Failed to send slider value via WS', e);
      }
    } else {
      addLog(`AI Sensitivity Gate adjusted locally to ${(value * 100).toFixed(0)}% (${value.toFixed(2)})`);
    }
  },

  saveSettings: (s) => {
    set(state => ({ settings: { ...state.settings, ...s } }));
    get().addLog('Settings saved');
  },
}));

export { severityFromArea, MUNICIPAL_USERS };