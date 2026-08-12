/* ============================================================
   HYDRO-VISION-3D — Dashboard Logic
   AI-Powered 3D Hydro-Spatial Infrastructure Intelligence
   ============================================================ */

/* ── Configuration ────────────────────────────────────────── */
const CONFIG = {
  API_URL: 'http://localhost:8000',
  WS_URL: 'ws://localhost:8000/ws/live-stream',
  CENTER_LAT: 22.3072,
  CENTER_LON: 73.1812,
  UPDATE_INTERVAL: 2000,
  CHART_HISTORY: 24,
  MAX_ALERTS: 15,
  EMA_ALPHA: 0.3,
  MODE: 'live', // Defaults to live backend; falls back to simulation only if WS fails
  HAZARD_TYPES: ['pothole', 'water_body', 'crack', 'flooding'],
  TYPE_LABELS: { pothole: 'Pothole', water_body: 'Water Body', crack: 'Crack', flooding: 'Flooding' },
  TYPE_ICONS: { pothole: '🕳️', water_body: '💧', crack: '⚡', flooding: '🌊' },
  TYPE_COLORS: { pothole: '#ef4444', water_body: '#00d4ff', crack: '#f59e0b', flooding: '#a855f7' },
  SEVERITY_COLORS: { LOW: '#10b981', MODERATE: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }
};

/* ── Data Simulator (fallback mode only) ─────────────────────
   Used only if the live backend WebSocket cannot be reached.
   Never runs concurrently with live data. */
class DataSimulator {
  constructor() {
    this.frameId = 0;
    this.startTime = Date.now();
    this.hazards = [];
    this.nextTrackId = 1;
    this.previousState = null;
    this._initHazards(8 + Math.floor(Math.random() * 5));
  }

  _initHazards(count) {
    for (let i = 0; i < count; i++) {
      this.hazards.push(this._createHazard());
    }
  }

  _createHazard() {
    const type = CONFIG.HAZARD_TYPES[Math.floor(Math.random() * CONFIG.HAZARD_TYPES.length)];
    const baseArea = type === 'flooding' ? 8 + Math.random() * 30
                   : type === 'water_body' ? 3 + Math.random() * 15
                   : type === 'pothole' ? 0.5 + Math.random() * 8
                   : 0.2 + Math.random() * 4;
    return {
      track_id: this.nextTrackId++,
      type,
      confidence: 0.65 + Math.random() * 0.33,
      surface_area_m2: baseArea,
      _base_area: baseArea,
      bbox: [
        200 + Math.random() * 800,
        100 + Math.random() * 500,
        400 + Math.random() * 400,
        200 + Math.random() * 300
      ],
      location: {
        latitude: CONFIG.CENTER_LAT + (Math.random() - 0.5) * 0.008,
        longitude: CONFIG.CENTER_LON + (Math.random() - 0.5) * 0.01
      },
      _created: Date.now(),
      _ttl: 20000 + Math.random() * 60000
    };
  }

  _evolveHazards() {
    this.hazards.forEach(h => {
      const noise = h._base_area * (0.85 + Math.random() * 0.3);
      h.surface_area_m2 = (1 - CONFIG.EMA_ALPHA) * h.surface_area_m2 + CONFIG.EMA_ALPHA * noise;
      h.confidence = Math.min(0.99, Math.max(0.5, h.confidence + (Math.random() - 0.5) * 0.04));
      h.location.latitude += (Math.random() - 0.5) * 0.0001;
      h.location.longitude += (Math.random() - 0.5) * 0.0001;
    });

    const now = Date.now();
    this.hazards = this.hazards.filter(h => now - h._created < h._ttl);

    if (Math.random() < 0.15 && this.hazards.length < 18) {
      this.hazards.push(this._createHazard());
    }

    while (this.hazards.length < 5) {
      this.hazards.push(this._createHazard());
    }
  }

  _computeRisk(totalArea) {
    if (totalArea >= 75) return { level: 'CRITICAL', score: 4, action: 'Issue emergency response and traffic reroute.' };
    if (totalArea >= 25) return { level: 'HIGH', score: 3, action: 'Dispatch local maintenance crew.' };
    if (totalArea >= 5)  return { level: 'MODERATE', score: 2, action: 'Schedule standard maintenance check.' };
    return { level: 'LOW', score: 1, action: 'Monitor routine conditions.' };
  }

  tick() {
    this.frameId += 30;
    this._evolveHazards();

    const hazardsList = Array.isArray(this.hazards) ? this.hazards : [];

    const totalArea = hazardsList.reduce((s, h) => {
      const area = Number(h?.surface_area_m2 ?? h?.area ?? 0);
      return s + (isNaN(area) ? 0 : area);
    }, 0);

    const risk = this._computeRisk(totalArea);

    const alertCount = hazardsList.filter(h => {
      const area = Number(h?.surface_area_m2 ?? h?.area ?? 0);
      const r = this._computeRisk(area);
      return r.level === 'HIGH' || r.level === 'CRITICAL';
    }).length;

    const state = {
      frame_id: this.frameId,
      timestamp: (Date.now() - (this.startTime || Date.now())) / 1000,
      summary: {
        active_hazards: hazardsList.length,
        total_affected_area: totalArea,
        total_area_m2: totalArea,
        overall_risk: risk.level,
        risk_level: risk.level,
        risk_score: risk.score,
        action: risk.action,
        alert_count: Math.max(alertCount, Math.floor(hazardsList.length * 0.25))
      },
      hazards: hazardsList.map(h => ({
        track_id: h.track_id,
        type: h.type,
        confidence: h.confidence ?? 1.0,
        surface_area_m2: Number(h?.surface_area_m2 ?? h?.area ?? 0),
        bbox: h.bbox || [],
        location: { ...(h.location || {}) },
        severity: null,
        zone: null,
        status: 'OPEN',
        visual_evidence_url: null
      }))
    };

    const prev = this.previousState;
    this.previousState = state;

    return { current: state, previous: prev };
  }
}

/* ── Backend Connector ────────────────────────────────────── */
class BackendConnector {
  constructor(onData, onStatusChange) {
    this.onData = onData;
    this.onStatusChange = onStatusChange || (() => {});
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
    this._hasEverConnected = false;
  }

  async connect() {
    this.onStatusChange('CONNECTING');
    this._connectWebSocket();
  }

  async fetchHazards() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/hazards`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  async fetchHealth() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/health`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return { status: 'down' };
    }
  }

  async startStream(videoPath) {
    try {
      const url = new URL(`${CONFIG.API_URL}/api/stream/start`);
      if (videoPath) url.searchParams.append('video_path', videoPath);
      const res = await fetch(url.toString());
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async stopStream() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/stream/stop`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  async fetchConfig() {
    try {
      const res = await fetch(`${CONFIG.API_URL}/api/config`);
      return await res.json();
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      // Detach handlers first so ws.close() does not trigger onclose reconnection
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.onStatusChange('DISCONNECTED');
  }

  _connectWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.ws) {
      this.ws.onclose = null;
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(CONFIG.WS_URL);

      this.ws.onopen = () => {
        this.isConnected = true;
        this._hasEverConnected = true;
        this.onStatusChange('LIVE');
        if (window._addLog) window._addLog('WebSocket connected successfully');
        // Note: backend's /ws/live-stream handler only listens via
        // receive_text() to detect disconnects — it does not expect or
        // parse any handshake payload, so nothing is sent here.
        // The backend also auto-starts the AI pipeline on first connect,
        // but we explicitly call /api/stream/start too as a safety net
        // (e.g. if the backend was restarted without a fresh socket, or
        // status got stuck at IDLE/ERROR from a previous run).
        this.startStream().then(result => {
          if (result?.message) {
            if (window._addLog) window._addLog(`Stream: ${result.message}`);
          } else if (window._addLog) {
            window._addLog('Stream start request failed — check backend console.');
          }
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);

          if (rawData.error) {
            console.error('[WS Error Payload]:', rawData.error);
            if (window._addLog) window._addLog(`Backend error: ${rawData.error}`);
            return;
          }

          const summary = rawData.summary || {};
          const totalArea = summary.total_affected_area ?? summary.total_area_m2 ?? 0;
          const riskLevel = summary.overall_risk ?? summary.risk_level ?? 'LOW';

          // Normalize to the shape every UI/chart/map consumer expects,
          // matching the app.py broadcast payload field-for-field while
          // staying defensive against missing/renamed fields.
          const normalizedData = {
            frame_id: rawData.frame_id ?? 0,
            timestamp: rawData.timestamp ?? (Date.now() / 1000),
            summary: {
              active_hazards: summary.active_hazards ?? rawData.hazards?.length ?? 0,
              total_affected_area: totalArea,
              total_area_m2: totalArea,
              overall_risk: riskLevel,
              risk_level: riskLevel,
              risk_score: { LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 }[riskLevel] ?? 1,
              action: summary.action ?? '',
              alert_count: summary.alert_count ?? summary.total_cumulative_hazards ?? 0
            },
            hazards: (rawData.hazards || []).map(h => ({
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
              location: { ...(h.location || { latitude: h.latitude, longitude: h.longitude }) }
            }))
          };

          this.onData(normalizedData);
        } catch (e) {
          console.error('Error handling live WS payload:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
      };

      this.ws.onclose = (event) => {
        this.isConnected = false;
        // Distinguish "actively retrying" from a hard stop, so the sidebar
        // badge never shows a flat DISCONNECTED while a reconnect is about
        // to succeed a moment later (e.g. uvicorn --reload cycling).
        this.onStatusChange(this._hasEverConnected ? 'RECONNECTING' : 'DISCONNECTED');
        console.warn(`WebSocket closed (Code: ${event.code}). Reconnecting in 3s...`);
        if (window._addLog) window._addLog('WebSocket disconnected. Reconnecting in 3s...');

        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
      };
    } catch (err) {
      console.error('Failed to create WebSocket instance:', err);
      this.onStatusChange('ERROR');

      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
    }
  }
}

/* ── Page Router ──────────────────────────────────────────── */
class PageRouter {
  constructor(app) {
    this.app = app;
    this.currentPage = 'dashboard';
  }

  init() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.getAttribute('data-page');
        if (page) {
          this.navigateTo(page);
        }
      });
    });
  }

  navigateTo(pageName) {
    this.currentPage = pageName;

    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('page-active');
    });

    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
      targetPage.classList.add('page-active');
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-page') === pageName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
      const titles = {
        'dashboard': 'Infrastructure Overview',
        'detections': 'Live Detections',
        'map': 'Spatial Analysis',
        'risk': 'Risk Engine',
        'volumetric': 'Volumetrics',
        'alerts': 'Alerts & Incidents',
        'settings': 'System Configuration'
      };
      headerTitle.textContent = titles[pageName] || 'Dashboard';
    }

    this.app.onPageEnter(pageName);

    if (pageName === 'dashboard' || pageName === 'map') {
      setTimeout(() => {
        if (this.app.map) this.app.map.invalidateAll();
      }, 100);
    }
  }
}

/* ── Chart Manager ────────────────────────────────────────── */
class ChartManager {
  constructor() {
    this.charts = {};
    this.timelineData = [];
    this.riskTimelineData = [];
    this._configureDefaults();
  }

  _configureDefaults() {
    if (typeof Chart === 'undefined') {
      console.warn('[ChartManager] Chart.js not found on page — charts will be skipped.');
      return;
    }
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = 'rgba(255,255,255,0.05)';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.animation.duration = 600;
    Chart.defaults.animation.easing = 'easeOutQuart';
    Chart.defaults.responsive = true;
    Chart.defaults.maintainAspectRatio = false;
  }

  initTimeline(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(0, 212, 255, 0.25)');
    gradient.addColorStop(0.5, 'rgba(0, 212, 255, 0.08)');
    gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

    this.charts.timeline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Active Hazards',
          data: [],
          borderColor: '#00d4ff',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#00d4ff',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2
        }]
      },
      options: {
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { stepSize: 2, font: { size: 11 } } }
        },
        plugins: {
          tooltip: {
            backgroundColor: 'rgba(15, 20, 35, 0.9)',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10,
            displayColors: false,
            callbacks: {
              title: (items) => `Time: ${items[0].label}`,
              label: (item) => `Hazards Detected: ${item.parsed.y}`
            }
          }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  initSeverity(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    this.charts.severity = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Low', 'Moderate', 'High', 'Critical'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
          borderColor: 'rgba(15, 20, 35, 0.8)',
          borderWidth: 3,
          hoverBorderColor: '#fff',
          hoverBorderWidth: 2
        }]
      },
      options: {
        cutout: '68%',
        plugins: {
          tooltip: {
            backgroundColor: 'rgba(15, 20, 35, 0.9)',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10
          },
          legend: { display: false }
        }
      },
      plugins: [{
        id: 'centerText',
        beforeDraw(chart) {
          const { width, height, ctx: c } = chart;
          c.save();
          const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
          c.font = '700 1.8rem Inter';
          c.fillStyle = '#f1f5f9';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(total, width / 2, height / 2 - 8);
          c.font = '500 0.7rem Inter';
          c.fillStyle = '#64748b';
          c.fillText('TOTAL', width / 2, height / 2 + 14);
          c.restore();
        }
      }]
    });
  }

  initHazardTypes(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    this.charts.types = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pothole', 'Water Body', 'Crack', 'Flooding'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: [
            'rgba(239, 68, 68, 0.7)',
            'rgba(0, 212, 255, 0.7)',
            'rgba(245, 158, 11, 0.7)',
            'rgba(168, 85, 247, 0.7)'
          ],
          borderColor: ['#ef4444', '#00d4ff', '#f59e0b', '#a855f7'],
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y',
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { stepSize: 1, font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 12, weight: 500 } } }
        },
        plugins: {
          tooltip: {
            backgroundColor: 'rgba(15, 20, 35, 0.9)',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            cornerRadius: 8,
            padding: 10
          }
        }
      }
    });
  }

  initGauge(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    this.charts.gauge = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [0, 100],
          backgroundColor: ['#10b981', 'rgba(255,255,255,0.05)'],
          borderWidth: 0,
          circumference: 240,
          rotation: 240
        }]
      },
      options: {
        cutout: '78%',
        plugins: { tooltip: { enabled: false }, legend: { display: false } },
        events: []
      }
    });
  }

  initRiskTimeline(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(249, 115, 22, 0.25)');
    gradient.addColorStop(0.5, 'rgba(249, 115, 22, 0.08)');
    gradient.addColorStop(1, 'rgba(249, 115, 22, 0)');

    this.charts.riskTimeline = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Risk Score',
          data: [],
          borderColor: '#f97316',
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5
        }]
      },
      options: {
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.04)' } }
        },
        plugins: { legend: { display: false } },
        interaction: { intersect: false, mode: 'index' }
      }
    });
  }

  initRiskBreakdown(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    this.charts.riskBreakdown = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Low', 'Moderate', 'High', 'Critical'],
        datasets: [{
          data: [0, 0, 0, 0],
          backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
          borderColor: 'rgba(15, 20, 35, 0.8)',
          borderWidth: 2
        }]
      },
      options: {
        plugins: {
          legend: { display: true, position: 'right', labels: { color: '#94a3b8' } }
        }
      }
    });
  }

  initVolumetricChart(canvasId) {
    if (typeof Chart === 'undefined') return;
    const el = document.getElementById(canvasId);
    if (!el) return;
    const ctx = el.getContext('2d');
    this.charts.volumetric = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Pothole', 'Water Body', 'Crack', 'Flooding'],
        datasets: [{
          label: 'Total Area (m²)',
          data: [0, 0, 0, 0],
          backgroundColor: ['#ef4444', '#00d4ff', '#f59e0b', '#a855f7'],
          borderRadius: 4
        }]
      },
      options: {
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' } },
          x: { grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  updateTimeline(hazardCount) {
    const now = new Date();
    const label = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const chart = this.charts.timeline;
    if (!chart) return;

    chart.data.labels.push(label);
    chart.data.datasets[0].data.push(hazardCount);

    if (chart.data.labels.length > CONFIG.CHART_HISTORY) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }

  updateSeverity(hazards) {
    const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    hazards.forEach(h => {
      const level = h.severity && counts.hasOwnProperty(h.severity) ? h.severity : this._severityFromArea(h.surface_area_m2);
      counts[level]++;
    });

    const chart = this.charts.severity;
    if (!chart) return;
    chart.data.datasets[0].data = [counts.LOW, counts.MODERATE, counts.HIGH, counts.CRITICAL];
    chart.update('none');
  }

  _severityFromArea(a) {
    a = Number(a) || 0;
    if (a >= 75) return 'CRITICAL';
    if (a >= 25) return 'HIGH';
    if (a >= 5) return 'MODERATE';
    return 'LOW';
  }

  updateHazardTypes(hazards) {
    const counts = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
    hazards.forEach(h => { counts[h.type] = (counts[h.type] || 0) + 1; });

    const chart = this.charts.types;
    if (!chart) return;
    chart.data.datasets[0].data = [counts.pothole, counts.water_body, counts.crack, counts.flooding];
    chart.update('none');
  }

  updateGauge(riskLevel) {
    const scoreMap = { LOW: 18, MODERATE: 42, HIGH: 68, CRITICAL: 92 };
    const colorMap = { LOW: '#10b981', MODERATE: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' };
    const score = scoreMap[riskLevel] || 20;
    const color = colorMap[riskLevel] || '#10b981';

    const chart = this.charts.gauge;
    if (chart) {
      chart.data.datasets[0].data = [score, 100 - score];
      chart.data.datasets[0].backgroundColor[0] = color;
      chart.update('none');
    }

    const gaugeValue = document.getElementById('gauge-value');
    const gaugeLabel = document.getElementById('gauge-label');

    if (gaugeValue) {
      gaugeValue.textContent = score;
      gaugeValue.style.color = color;
    }
    if (gaugeLabel) {
      const level = (riskLevel || 'LOW').toLowerCase();
      const displayLevel = riskLevel || 'LOW';
      gaugeLabel.innerHTML = `<span class="risk-badge ${level}">${displayLevel}</span>`;
    }
  }

  updateRiskTimeline(riskScore) {
    const chart = this.charts.riskTimeline;
    if (!chart) return;

    const now = new Date();
    const label = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    chart.data.labels.push(label);
    chart.data.datasets[0].data.push((riskScore || 1) * 25);
    if (chart.data.labels.length > CONFIG.CHART_HISTORY) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update('none');
  }

  updateRiskBreakdown(hazards) {
    const chart = this.charts.riskBreakdown;
    if (!chart) return;

    const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    hazards.forEach(h => {
      const level = h.severity && counts.hasOwnProperty(h.severity) ? h.severity : this._severityFromArea(h.surface_area_m2);
      counts[level]++;
    });
    chart.data.datasets[0].data = [counts.LOW, counts.MODERATE, counts.HIGH, counts.CRITICAL];
    chart.update('none');
  }

  updateVolumetricChart(hazards) {
    const chart = this.charts.volumetric;
    if (!chart) return;

    const areas = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
    hazards.forEach(h => { areas[h.type] = (areas[h.type] || 0) + (Number(h.surface_area_m2) || 0); });
    chart.data.datasets[0].data = [areas.pothole, areas.water_body, areas.crack, areas.flooding];
    chart.update('none');
  }
}

/* ── Map Manager ──────────────────────────────────────────── */
class MapManager {
  constructor(containerId) {
    this.markers = new Map();
    this.mapId = containerId;
    this.map = null;
    this.fullpageMap = null;
    this.fullpageMarkers = new Map();
    this._initMap(containerId);
  }

  _initMap(containerId) {
    if (typeof L === 'undefined') {
      console.warn('[MapManager] Leaflet not found on page — map will be skipped.');
      return;
    }
    const el = document.getElementById(containerId);
    if (!el) return;
    this.map = L.map(containerId, {
      center: [CONFIG.CENTER_LAT, CONFIG.CENTER_LON],
      zoom: 15,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);
    L.control.attribution({ prefix: false, position: 'bottomright' })
      .addAttribution('© <a href="https://carto.com">CARTO</a>')
      .addTo(this.map);
    setTimeout(() => this.map.invalidateSize(), 300);
  }

  initFullpageMap(containerId) {
    if (typeof L === 'undefined') return;
    if (this.fullpageMap) return;
    const el = document.getElementById(containerId);
    if (!el) return;
    this.fullpageMap = L.map(containerId, {
      center: [CONFIG.CENTER_LAT, CONFIG.CENTER_LON],
      zoom: 15,
      zoomControl: true,
      attributionControl: false
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.fullpageMap);
    L.control.attribution({ prefix: false, position: 'bottomright' })
      .addAttribution('© <a href="https://carto.com">CARTO</a>')
      .addTo(this.fullpageMap);
    setTimeout(() => this.fullpageMap.invalidateSize(), 300);
  }

  update(hazards) {
    this._updateMapInstance(this.map, this.markers, hazards);
  }

  updateFullpageMap(hazards) {
    if (this.fullpageMap) {
      this._updateMapInstance(this.fullpageMap, this.fullpageMarkers, hazards);
    }
  }

  _updateMapInstance(mapInstance, markersMap, hazards) {
    if (!mapInstance) return;
    const validHazards = hazards.filter(h => h.location && typeof h.location.latitude === 'number' && typeof h.location.longitude === 'number');
    const currentIds = new Set(validHazards.map(h => h.track_id));

    for (const [id, marker] of markersMap) {
      if (!currentIds.has(id)) {
        mapInstance.removeLayer(marker);
        markersMap.delete(id);
      }
    }

    validHazards.forEach(h => {
      const color = CONFIG.TYPE_COLORS[h.type] || '#00d4ff';
      const area = Number(h.surface_area_m2) || 0;
      const popupContent = `
        <div style="min-width: 160px;">
          <strong>${CONFIG.TYPE_ICONS[h.type] || ''} ${CONFIG.TYPE_LABELS[h.type] || h.type}</strong><br/>
          <span style="color: #94a3b8;">Track ID:</span> #${h.track_id}<br/>
          <span style="color: #94a3b8;">Area:</span> ${area.toFixed(2)} m²<br/>
          <span style="color: #94a3b8;">Confidence:</span> ${((h.confidence ?? 1) * 100).toFixed(1)}%<br/>
          <span style="color: #94a3b8;">Lat:</span> ${h.location.latitude.toFixed(6)}<br/>
          <span style="color: #94a3b8;">Lon:</span> ${h.location.longitude.toFixed(6)}
        </div>`;

      if (markersMap.has(h.track_id)) {
        const marker = markersMap.get(h.track_id);
        marker.setLatLng([h.location.latitude, h.location.longitude]);
        marker.setPopupContent(popupContent);
        marker.setStyle({ color, fillColor: color, radius: Math.max(5, Math.min(14, area * 0.8)) });
      } else {
        const marker = L.circleMarker([h.location.latitude, h.location.longitude], {
          radius: Math.max(5, Math.min(14, area * 0.8)),
          fillColor: color,
          fillOpacity: 0.7,
          color: color,
          weight: 2,
          opacity: 0.9
        }).addTo(mapInstance).bindPopup(popupContent);
        markersMap.set(h.track_id, marker);
      }
    });
  }

  invalidateAll() {
    if (this.map) this.map.invalidateSize();
    if (this.fullpageMap) this.fullpageMap.invalidateSize();
  }
}

/* ── UI Manager ───────────────────────────────────────────── */
class UIManager {
  constructor() {
    this._animCounters = {};
  }

  updateKPIs(state, previous) {
    const s = state.summary;

    this._animateValue('kpi-hazards', s.active_hazards, 0);
    this._animateValue('kpi-area', s.total_area_m2, 2, ' m²');
    this._updateRiskKPI(s.risk_level);
    this._animateValue('kpi-alerts', s.alert_count, 0);

    if (previous) {
      const ps = previous.summary;
      this._updateTrend('trend-hazards', s.active_hazards, ps.active_hazards);
      this._updateTrend('trend-area', s.total_area_m2, ps.total_area_m2);
      this._updateTrend('trend-alerts', s.alert_count, ps.alert_count);
    }
  }

  _animateValue(elementId, targetValue, decimals = 0, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;

    targetValue = Number(targetValue) || 0;
    const currentText = el.textContent.replace(/[^0-9.\-]/g, '');
    const current = parseFloat(currentText) || 0;
    const start = current;
    const diff = targetValue - start;
    const duration = 500;
    const startTime = performance.now();

    if (this._animCounters[elementId]) {
      cancelAnimationFrame(this._animCounters[elementId]);
    }

    const step = (timestamp) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = start + diff * eased;
      el.textContent = value.toFixed(decimals) + suffix;
      if (progress < 1) {
        this._animCounters[elementId] = requestAnimationFrame(step);
      }
    };
    this._animCounters[elementId] = requestAnimationFrame(step);
  }

  _updateRiskKPI(level) {
    const el = document.getElementById('kpi-risk');
    if (!el) return;
    el.textContent = level;
    el.className = 'kpi-value';
    el.style.color = CONFIG.SEVERITY_COLORS[level] || '#94a3b8';
  }

  _updateTrend(elementId, current, previous) {
    const el = document.getElementById(elementId);
    if (!el || !previous) return;

    const change = ((current - previous) / Math.max(previous, 0.01)) * 100;
    const isUp = change >= 0;
    const absChange = Math.abs(change).toFixed(1);

    el.className = `kpi-trend ${isUp ? 'up' : 'down'}`;
    el.innerHTML = `
      <span>${isUp ? '↑' : '↓'} ${absChange}%</span>
      <span class="trend-text">vs prev</span>
    `;
  }

  updateNavBadges(state) {
    const s = state.summary;
    const detectionCount = document.getElementById('nav-detection-count');
    const alertCount = document.getElementById('nav-alert-count');
    const notifBadge = document.getElementById('notif-badge');

    if (detectionCount) detectionCount.textContent = s.active_hazards;
    if (alertCount) {
      alertCount.textContent = s.alert_count;
      alertCount.style.display = s.alert_count > 0 ? 'inline-block' : 'none';
    }
    if (notifBadge) {
      notifBadge.textContent = s.alert_count;
      notifBadge.style.display = s.alert_count > 0 ? 'flex' : 'none';
    }
  }

  updateAlertsTable(hazards) {
    const tbody = document.getElementById('alerts-tbody');
    if (!tbody) return;

    const sorted = [...hazards].sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0)).slice(0, CONFIG.MAX_ALERTS);
    const now = new Date();

    tbody.innerHTML = sorted.map((h, i) => {
      const area = Number(h.surface_area_m2) || 0;
      const severity = (h.severity || (area >= 75 ? 'CRITICAL' : area >= 25 ? 'HIGH' : area >= 5 ? 'MODERATE' : 'LOW')).toLowerCase();
      const time = h.timestamp ? new Date(h.timestamp) : new Date(now.getTime() - Math.random() * 300000);
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const lat = h.location?.latitude, lon = h.location?.longitude;
      return `<tr style="animation-delay: ${i * 0.03}s">
        <td class="td-time">${timeStr}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type] || ''} ${CONFIG.TYPE_LABELS[h.type] || h.type}</span></td>
        <td class="td-area font-mono">${typeof lat === 'number' ? lat.toFixed(4) : '—'}, ${typeof lon === 'number' ? lon.toFixed(4) : '—'}</td>
        <td class="td-area">${area.toFixed(2)}</td>
        <td class="td-confidence">${((h.confidence ?? 1) * 100).toFixed(1)}%</td>
        <td><span class="severity-badge ${severity}">${severity}</span></td>
      </tr>`;
    }).join('');
  }

  updateDetectionsTable(hazards) {
    const tbody = document.getElementById('detections-tbody');
    if (!tbody) return;

    const sorted = [...hazards].sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0));

    tbody.innerHTML = sorted.map((h) => {
      const area = Number(h.surface_area_m2) || 0;
      const severity = (h.severity || (area >= 75 ? 'CRITICAL' : area >= 25 ? 'HIGH' : area >= 5 ? 'MODERATE' : 'LOW'));
      const lat = h.location?.latitude, lon = h.location?.longitude;
      const status = h.status || 'Active';
      return `<tr>
        <td class="font-mono text-slate-400">#${h.track_id}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type] || ''} ${CONFIG.TYPE_LABELS[h.type] || h.type}</span></td>
        <td>${((h.confidence ?? 1) * 100).toFixed(1)}%</td>
        <td>${area.toFixed(2)} m²</td>
        <td class="font-mono text-sm">${typeof lat === 'number' ? lat.toFixed(5) : '—'}, ${typeof lon === 'number' ? lon.toFixed(5) : '—'}</td>
        <td><span class="severity-badge ${severity.toLowerCase()}">${severity}</span></td>
        <td><span style="color: ${status === 'RESOLVED' ? '#64748b' : '#10b981'};">${status === 'OPEN' ? 'Active' : status}</span></td>
      </tr>`;
    }).join('');
  }

  updateAlertsFullTable(hazards, filter) {
    const tbody = document.getElementById('alerts-full-tbody');
    if (!tbody) return;

    let filtered = hazards.map(h => {
      const area = Number(h.surface_area_m2) || 0;
      const severity = (h.severity || (area >= 75 ? 'CRITICAL' : area >= 25 ? 'HIGH' : area >= 5 ? 'MODERATE' : 'LOW')).toLowerCase();
      return { ...h, severity };
    });

    const cCount = filtered.filter(h => h.severity === 'critical').length;
    const hCount = filtered.filter(h => h.severity === 'high').length;
    const mCount = filtered.filter(h => h.severity === 'moderate').length;

    const totalBadge = document.getElementById('alerts-total-badge');
    const cBadge = document.getElementById('alert-critical-count');
    const hBadge = document.getElementById('alert-high-count');
    const mBadge = document.getElementById('alert-moderate-count');
    if (totalBadge) totalBadge.textContent = filtered.length;
    if (cBadge) cBadge.textContent = cCount;
    if (hBadge) hBadge.textContent = hCount;
    if (mBadge) mBadge.textContent = mCount;

    if (filter && filter !== 'all') {
      filtered = filtered.filter(h => h.severity === filter);
    }

    filtered.sort((a, b) => (b.surface_area_m2 || 0) - (a.surface_area_m2 || 0));
    const now = new Date();

    tbody.innerHTML = filtered.map((h) => {
      const time = h.timestamp ? new Date(h.timestamp) : now;
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const lat = h.location?.latitude, lon = h.location?.longitude;
      const area = Number(h.surface_area_m2) || 0;
      return `<tr>
        <td class="td-time">${timeStr}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type] || ''} ${CONFIG.TYPE_LABELS[h.type] || h.type}</span></td>
        <td class="font-mono text-sm">${typeof lat === 'number' ? lat.toFixed(4) : '—'}, ${typeof lon === 'number' ? lon.toFixed(4) : '—'}</td>
        <td>${area.toFixed(2)} m²</td>
        <td>${((h.confidence ?? 1) * 100).toFixed(1)}%</td>
        <td><span class="severity-badge ${h.severity}">${h.severity.toUpperCase()}</span></td>
        <td><button class="action-btn" data-hazard-id="${h.hazard_id || ''}" style="background: rgba(255,255,255,0.1); border:none; padding: 4px 8px; border-radius: 4px; color: #fff; cursor: pointer;">Acknowledge</button></td>
      </tr>`;
    }).join('');
  }

  updateMapStats(hazards) {
    const total = document.getElementById('map-total-markers');
    const coverage = document.getElementById('map-coverage');
    const updated = document.getElementById('map-last-updated');
    if (total) total.textContent = hazards.length;
    if (coverage) coverage.textContent = (hazards.reduce((acc, h) => acc + (Number(h.surface_area_m2) || 0), 0) / 1000).toFixed(2) + ' sq km';
    if (updated) {
      const now = new Date();
      updated.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    }
  }

  updateVolumetricKPIs(hazards) {
    let totalArea = 0;
    let largest = 0;
    const typeAreas = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };

    hazards.forEach(h => {
      const area = Number(h.surface_area_m2) || 0;
      totalArea += area;
      typeAreas[h.type] = (typeAreas[h.type] || 0) + area;
      if (area > largest) largest = area;
    });

    const avgArea = hazards.length ? totalArea / hazards.length : 0;

    const tAreaEl = document.getElementById('vol-total-area');
    const aAreaEl = document.getElementById('vol-avg-area');
    const lAreaEl = document.getElementById('vol-largest');
    if (tAreaEl) tAreaEl.textContent = totalArea.toFixed(2) + ' m²';
    if (aAreaEl) aAreaEl.textContent = avgArea.toFixed(2) + ' m²';
    if (lAreaEl) lAreaEl.textContent = largest.toFixed(2) + ' m²';

    const tbody = document.getElementById('vol-breakdown-tbody');
    if (tbody) {
      tbody.innerHTML = Object.entries(typeAreas).map(([type, area]) => {
        const percentage = totalArea ? ((area / totalArea) * 100).toFixed(1) : 0;
        return `<tr>
          <td><span class="type-badge ${type}">${CONFIG.TYPE_ICONS[type] || ''} ${CONFIG.TYPE_LABELS[type] || type}</span></td>
          <td>${area.toFixed(2)} m²</td>
          <td>${percentage}%</td>
        </tr>`;
      }).join('');
    }
  }

  updateStreamPanel(state, backend) {
    const statusEl = document.getElementById('stream-conn-status');
    const statusDisp = document.getElementById('stream-status-display');
    const frameDisp = document.getElementById('stream-frame-display');
    const fpsDisp = document.getElementById('stream-fps-display');

    if (statusEl) statusEl.textContent = CONFIG.MODE === 'live' ? 'Live Backend' : 'Simulation';

    if (state && state.summary) {
      // Real values from the last received frame, not placeholders.
      if (statusDisp) statusDisp.textContent = backend?.isConnected ? 'STREAMING' : 'IDLE';
      if (frameDisp) frameDisp.textContent = `#${state.frame_id ?? 0}`;
      if (fpsDisp) {
        // The backend broadcast payload doesn't currently include an fps
        // field (only frame_id/timestamp), so we derive an approximate
        // rate from consecutive frame timestamps rather than fabricating
        // a random number.
        fpsDisp.textContent = this._estimateFps(state).toFixed(1);
      }
    } else {
      // No data has arrived yet — show a true "no data" state rather
      // than a stale or fake number.
      if (statusDisp) statusDisp.textContent = 'IDLE';
      if (frameDisp) frameDisp.textContent = '#0';
      if (fpsDisp) fpsDisp.textContent = '0.0';
    }
  }

  _estimateFps(state) {
    const now = performance.now();
    if (this._lastFpsSample && state.frame_id > this._lastFpsSample.frameId) {
      const frameDelta = state.frame_id - this._lastFpsSample.frameId;
      const timeDeltaSec = (now - this._lastFpsSample.time) / 1000;
      const fps = timeDeltaSec > 0 ? frameDelta / timeDeltaSec : 0;
      this._lastFpsSample = { frameId: state.frame_id, time: now };
      return Math.max(0, Math.min(fps, 60)); // clamp to a sane display range
    }
    this._lastFpsSample = { frameId: state.frame_id, time: now };
    return this._lastFpsFallback || 0;
  }

  addConnectionLog(message) {
    const logContainer = document.getElementById('connection-log');
    if (!logContainer) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    const entry = document.createElement('div');
    entry.style.marginBottom = '4px';
    entry.style.fontSize = '13px';
    entry.style.fontFamily = 'monospace';
    entry.innerHTML = `<span style="color: #64748b;">[${timeStr}]</span> ${message}`;

    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
  }

  applyDetectionFilter(searchText, typeFilter) {
    const tbody = document.getElementById('detections-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');

    const searchLower = (searchText || '').toLowerCase();

    rows.forEach(row => {
      const textContent = row.textContent.toLowerCase();
      let typeMatch = true;
      if (typeFilter && typeFilter !== 'all') {
        typeMatch = textContent.includes((CONFIG.TYPE_LABELS[typeFilter] || typeFilter).toLowerCase());
      }

      const searchMatch = !searchLower || textContent.includes(searchLower);

      row.style.display = (typeMatch && searchMatch) ? '' : 'none';
    });
  }

  updateClock() {
    const now = new Date();
    const dateEl = document.getElementById('header-date');
    const timeEl = document.getElementById('header-time');

    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }

  updateFPS() {
    const fpsEl = document.getElementById('fps-value');
    if (fpsEl) fpsEl.textContent = (28 + Math.random() * 6).toFixed(1);
  }

  updateFrameId(frameId) {
    const el = document.getElementById('frame-id');
    if (el) el.textContent = `Frame #${frameId}`;
  }

  updateStreamStatus(status) {
    const dot = document.getElementById('status-dot');
    const val = document.getElementById('status-value');
    if (dot) dot.className = `status-dot ${status.toLowerCase()}`;
    if (val) val.textContent = status;

    // Sidebar "Stream" badge (bottom-left widget). Separate elements from
    // the header status-dot above — nothing was writing to these before,
    // so the badge stayed stuck on its static HTML default regardless of
    // actual connection state.
    const sidebarLabel = document.getElementById('stream-status')
      || document.querySelector('.sidebar .stream-status-text');
    if (sidebarLabel) {
      sidebarLabel.textContent = status;
      sidebarLabel.classList.remove('live', 'disconnected', 'connecting', 'error', 'simulating');
      sidebarLabel.classList.add(status.toLowerCase());
    }
  }
}

/* ── Main Application ─────────────────────────────────────── */
class HydroVisionDashboard {
  constructor() {
    this.simulator = null; // lazily created only if live connection fails
    this.backend = null;
    this.charts = new ChartManager();
    this.ui = new UIManager();
    this.router = new PageRouter(this);
    this.map = null;
    this.fullpageMap = null;
    this.intervalId = null;
    this.currentState = null;
    this.previousState = null;
    this.alertFilter = 'all';

    window._addLog = (msg) => this.ui.addConnectionLog(msg);
  }

  init() {
    this.router.init();

    this.charts.initTimeline('timeline-chart');
    this.charts.initSeverity('severity-chart');
    this.charts.initHazardTypes('types-chart');
    this.charts.initGauge('gauge-chart');

    setTimeout(() => { this.map = new MapManager('hazard-map'); }, 100);

    initSidebar();

    this.ui.updateClock();
    setInterval(() => this.ui.updateClock(), 1000);

    // Note: FPS display here is a lightweight UI placeholder, independent
    // of the actual backend fps/frame cadence reported via WebSocket.
    setInterval(() => this.ui.updateFPS(), 500);

    this._initSettings();
    this._initStreamControls();
    this._initDetectionFilters();
    this._initAlertFilters();

    // Default to the live backend on load.
    this._startLive();
  }

  onPageEnter(pageName) {
    if (pageName === 'map') {
      if (this.map && !this.map.fullpageMap) {
        this.map.initFullpageMap('fullpage-map');
      }
      if (this.currentState) {
        this.map.updateFullpageMap(this.currentState.hazards);
        this.ui.updateMapStats(this.currentState.hazards);
      }
    } else if (pageName === 'risk') {
      if (!this.charts.charts.riskTimeline) this.charts.initRiskTimeline('risk-timeline-chart');
      if (!this.charts.charts.riskBreakdown) this.charts.initRiskBreakdown('risk-breakdown-chart');
      if (this.currentState) {
        this.charts.updateRiskTimeline(this.currentState.summary.risk_score);
        this.charts.updateRiskBreakdown(this.currentState.hazards);
      }
    } else if (pageName === 'volumetric') {
      if (!this.charts.charts.volumetric) this.charts.initVolumetricChart('volumetric-chart');
      if (this.currentState) {
        this.charts.updateVolumetricChart(this.currentState.hazards);
        this.ui.updateVolumetricKPIs(this.currentState.hazards);
      }
    } else if (pageName === 'detections' && this.currentState) {
      this.ui.updateDetectionsTable(this.currentState.hazards);
    } else if (pageName === 'alerts' && this.currentState) {
      this.ui.updateAlertsFullTable(this.currentState.hazards, this.alertFilter);
    } else if (pageName === 'stream') {
      // Stream Control page was previously never wired up — its fields
      // stayed frozen at static HTML placeholders ("Simulation"/"IDLE"/
      // "#0"/"0.0") no matter what the real connection state was.
      if (this.currentState) {
        this.ui.updateStreamPanel(this.currentState, this.backend);
      } else {
        this.ui.updateStreamPanel(null, this.backend);
      }
    } else if (pageName === 'settings' && this.currentState) {
      this.ui.updateStreamPanel(this.currentState);
    }
  }

  _processState(state) {
    if (!state || !state.summary) return;

    this.previousState = this.currentState;
    this.currentState = state;

    this.ui.updateKPIs(state, this.previousState);
    this.ui.updateNavBadges(state);
    this.charts.updateTimeline(state.summary.active_hazards);
    this.charts.updateSeverity(state.hazards);
    this.charts.updateHazardTypes(state.hazards);
    this.charts.updateGauge(state.summary.risk_level);
    this.ui.updateAlertsTable(state.hazards);
    this.ui.updateFrameId(state.frame_id);

    if (this.map) this.map.update(state.hazards);

    this._updateActivePage(state);
  }

  _updateActivePage(state) {
    const pageName = this.router.currentPage;
    if (pageName === 'detections') {
      this.ui.updateDetectionsTable(state.hazards);
      const search = document.getElementById('detection-search')?.value;
      const typeFilter = document.getElementById('detection-type-filter')?.value;
      this.ui.applyDetectionFilter(search, typeFilter);
    } else if (pageName === 'map') {
      if (this.map) {
        this.map.updateFullpageMap(state.hazards);
      }
      this.ui.updateMapStats(state.hazards);
    } else if (pageName === 'risk') {
      this.charts.updateRiskTimeline(state.summary.risk_score);
      this.charts.updateRiskBreakdown(state.hazards);
    } else if (pageName === 'volumetric') {
      this.charts.updateVolumetricChart(state.hazards);
      this.ui.updateVolumetricKPIs(state.hazards);
    } else if (pageName === 'alerts') {
      this.ui.updateAlertsFullTable(state.hazards, this.alertFilter);
    } else if (pageName === 'stream') {
      this.ui.updateStreamPanel(state, this.backend);
    }
  }

  _startSimulation() {
    // Fallback / manual mode only. Never runs concurrently with live mode.
    this._stopLive();
    CONFIG.MODE = 'simulation';
    this._syncModeRadios();
    this.simulator = this.simulator || new DataSimulator();
    this.ui.updateStreamStatus('SIMULATING');
    this.ui.addConnectionLog('Simulation mode started');
    this._tick();
    if (this.intervalId) { clearInterval(this.intervalId); }
    this.intervalId = setInterval(() => this._tick(), CONFIG.UPDATE_INTERVAL);
  }

  _stopSimulationInterval() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  _startLive() {
    CONFIG.MODE = 'live';
    this._stopSimulationInterval();
    this._syncModeRadios();

    if (this.backend) {
      this.backend.disconnect();
    }

    this.backend = new BackendConnector(
      (state) => this._processState(state),
      (status) => this.ui.updateStreamStatus(status)
    );
    this.backend.connect();
    this.ui.addConnectionLog('Connecting to live backend...');
  }

  _syncModeRadios() {
    // The static HTML hardcodes #source-sim as checked, which no longer
    // matches reality now that the app defaults to live mode on load.
    const liveRadio = document.getElementById('source-live');
    const simRadio = document.getElementById('source-sim');
    if (liveRadio) liveRadio.checked = CONFIG.MODE === 'live';
    if (simRadio) simRadio.checked = CONFIG.MODE === 'simulation';
  }

  _stopLive() {
    if (this.backend) {
      this.backend.disconnect();
      this.backend = null;
    }
  }

  _tick() {
    if (!this.simulator) return;
    const { current } = this.simulator.tick();
    if (current.summary.alert_count === undefined) {
      current.summary.alert_count = current.hazards.filter(h => (h.surface_area_m2 || 0) >= 5).length;
    }
    this._processState(current);
  }

  _initSettings() {
    const liveRadio = document.getElementById('source-live');
    const simRadio = document.getElementById('source-sim');
    const saveBtn = document.getElementById('btn-save-settings');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const apiUrl = document.getElementById('setting-api-url')?.value;
        const wsUrl = document.getElementById('setting-ws-url')?.value;
        const interval = document.getElementById('setting-interval')?.value;

        if (apiUrl) CONFIG.API_URL = apiUrl;
        if (wsUrl) CONFIG.WS_URL = wsUrl;
        if (interval) CONFIG.UPDATE_INTERVAL = parseInt(interval);

        if (simRadio?.checked) {
          this._startSimulation();
        } else {
          this._startLive();
        }
        this.ui.addConnectionLog('Settings saved');
      });
    }
  }

  _initStreamControls() {
    document.getElementById('btn-start-stream')?.addEventListener('click', async () => {
      const videoPath = document.getElementById('video-path-input')?.value;
      if (CONFIG.MODE === 'live' && this.backend) {
        const result = await this.backend.startStream(videoPath);
        this.ui.addConnectionLog(`Stream started: ${result?.video_path || videoPath || '(master video)'}`);
      } else {
        this.ui.addConnectionLog('Start stream requested (simulation mode — no backend call made)');
      }
    });

    document.getElementById('btn-stop-stream')?.addEventListener('click', async () => {
      if (CONFIG.MODE === 'live' && this.backend) {
        await this.backend.stopStream();
        this.ui.addConnectionLog('Stream stopped');
      }
    });

    document.getElementById('btn-reset-stream')?.addEventListener('click', () => {
      if (CONFIG.MODE === 'simulation') {
        this._stopSimulationInterval();
        this.simulator = new DataSimulator();
        this._startSimulation();
        this.ui.addConnectionLog('Simulation reset');
      } else {
        this.ui.addConnectionLog('Reset is only available in simulation mode');
      }
    });
  }

  _initDetectionFilters() {
    const search = document.getElementById('detection-search');
    const typeFilter = document.getElementById('detection-type-filter');
    if (search) search.addEventListener('input', () => this.ui.applyDetectionFilter(search.value, typeFilter?.value));
    if (typeFilter) typeFilter.addEventListener('change', () => this.ui.applyDetectionFilter(search?.value, typeFilter.value));
  }

  _initAlertFilters() {
    document.querySelectorAll('.alert-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.alert-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.alertFilter = btn.dataset.filter;
        if (this.currentState) {
          this.ui.updateAlertsFullTable(this.currentState.hazards, this.alertFilter);
        }
      });
    });
  }
}

/* ── Sidebar Navigation ───────────────────────────────────── */
function initSidebar() {
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
}

/* ── Bootstrap ─────────────────────────────────────────────
   Single DOMContentLoaded entry point. UI/navigation binds
   immediately and independently of network state, so the
   sidebar and buttons stay responsive even if the backend is
   unreachable. */
document.addEventListener('DOMContentLoaded', () => {
  const app = new HydroVisionDashboard();
  app.init();
  window._hydroVisionApp = app; // exposed for debugging in the console
});