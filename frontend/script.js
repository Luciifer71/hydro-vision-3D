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
  MODE: 'simulation', // 'simulation' or 'live'
  HAZARD_TYPES: ['pothole', 'water_body', 'crack', 'flooding'],
  TYPE_LABELS: { pothole: 'Pothole', water_body: 'Water Body', crack: 'Crack', flooding: 'Flooding' },
  TYPE_ICONS: { pothole: '🕳️', water_body: '💧', crack: '⚡', flooding: '🌊' },
  TYPE_COLORS: { pothole: '#ef4444', water_body: '#00d4ff', crack: '#f59e0b', flooding: '#a855f7' },
  SEVERITY_COLORS: { LOW: '#10b981', MODERATE: '#f59e0b', HIGH: '#f97316', CRITICAL: '#ef4444' }
};

/* ── Data Simulator ───────────────────────────────────────── */
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
    // Evolve existing hazards with EMA smoothing
    this.hazards.forEach(h => {
      const noise = h._base_area * (0.85 + Math.random() * 0.3);
      h.surface_area_m2 = (1 - CONFIG.EMA_ALPHA) * h.surface_area_m2 + CONFIG.EMA_ALPHA * noise;
      h.confidence = Math.min(0.99, Math.max(0.5, h.confidence + (Math.random() - 0.5) * 0.04));
      // Slight GPS drift
      h.location.latitude += (Math.random() - 0.5) * 0.0001;
      h.location.longitude += (Math.random() - 0.5) * 0.0001;
    });

    // Remove expired hazards
    const now = Date.now();
    this.hazards = this.hazards.filter(h => now - h._created < h._ttl);

    // Occasionally add new hazards
    if (Math.random() < 0.15 && this.hazards.length < 18) {
      this.hazards.push(this._createHazard());
    }

    // Ensure minimum hazards
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

    const totalArea = this.hazards.reduce((s, h) => s + h.surface_area_m2, 0);
    const risk = this._computeRisk(totalArea);
    const alertCount = this.hazards.filter(h => {
      const r = this._computeRisk(h.surface_area_m2);
      return r.level === 'HIGH' || r.level === 'CRITICAL';
    }).length;

    const state = {
      frame_id: this.frameId,
      timestamp: (Date.now() - this.startTime) / 1000,
      summary: {
        active_hazards: this.hazards.length,
        total_area_m2: totalArea,
        risk_level: risk.level,
        risk_score: risk.score,
        action: risk.action,
        alert_count: Math.max(alertCount, Math.floor(this.hazards.length * 0.25))
      },
      hazards: this.hazards.map(h => ({
        track_id: h.track_id,
        type: h.type,
        confidence: h.confidence,
        surface_area_m2: h.surface_area_m2,
        bbox: h.bbox,
        location: { ...h.location }
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
    this.onStatusChange = onStatusChange;
    this.ws = null;
    this.reconnectTimer = null;
    this.isConnected = false;
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isConnected = false;
    this.onStatusChange('DISCONNECTED');
  }

  _connectWebSocket() {
    try {
      this.ws = new WebSocket(CONFIG.WS_URL);
      
      this.ws.onopen = () => {
        this.isConnected = true;
        this.onStatusChange('LIVE');
        if (window._addLog) window._addLog('WebSocket connected successfully');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Assuming backend returns similar structure to simulator's current state
          if (data && data.summary && data.hazards) {
            // Recalculate alert count just in case
            if (data.summary.alert_count === undefined) {
               data.summary.alert_count = data.hazards.filter(h => h.surface_area_m2 >= 5).length;
            }
            this.onData(data);
          }
        } catch (e) {
          console.error('Error parsing WS message', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.onStatusChange('DISCONNECTED');
        if (window._addLog) window._addLog('WebSocket disconnected. Reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this._connectWebSocket(), 3000);
      };
    } catch (err) {
      console.error('Failed to connect to WS', err);
      this.onStatusChange('ERROR');
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
    
    // 1. Remove 'page-active' from all .page sections
    document.querySelectorAll('.page').forEach(page => {
      page.classList.remove('page-active');
    });
    
    // 2. Add 'page-active' to target page
    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
      targetPage.classList.add('page-active');
    }
    
    // 3. Update nav-item active states
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-page') === pageName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // 4. Update header title text based on page
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
    
    // 5. Call page-specific init
    this.app.onPageEnter(pageName);
    
    // 6. Handle map invalidation when switching to map pages
    if (pageName === 'dashboard' || pageName === 'map') {
      setTimeout(() => {
        if (this.app.map) this.app.map.invalidateAll();
      }, 100); // Give time for CSS transitions
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
      const a = h.surface_area_m2;
      if (a >= 75)     counts.CRITICAL++;
      else if (a >= 25) counts.HIGH++;
      else if (a >= 5)  counts.MODERATE++;
      else              counts.LOW++;
    });

    const chart = this.charts.severity;
    if (!chart) return;
    chart.data.datasets[0].data = [counts.LOW, counts.MODERATE, counts.HIGH, counts.CRITICAL];
    chart.update('none');
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
    const gaugeAction = document.getElementById('gauge-action');

    if (gaugeValue) {
      gaugeValue.textContent = score;
      gaugeValue.style.color = color;
    }
    if (gaugeLabel) {
      gaugeLabel.innerHTML = `<span class="risk-badge ${riskLevel.toLowerCase()}">${riskLevel}</span>`;
    }
  }

  updateRiskTimeline(riskScore) {
    const chart = this.charts.riskTimeline;
    if (!chart) return;
    
    const now = new Date();
    const label = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    
    chart.data.labels.push(label);
    // Convert text risk to numeric or just use a synthetic score if needed. We assume riskScore is 1..4 based on DataSimulator, 
    // let's multiply by 25 to get a 100-scale
    chart.data.datasets[0].data.push(riskScore * 25);
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
      const a = h.surface_area_m2;
      if (a >= 75)     counts.CRITICAL++;
      else if (a >= 25) counts.HIGH++;
      else if (a >= 5)  counts.MODERATE++;
      else              counts.LOW++;
    });
    chart.data.datasets[0].data = [counts.LOW, counts.MODERATE, counts.HIGH, counts.CRITICAL];
    chart.update('none');
  }

  updateVolumetricChart(hazards) {
    const chart = this.charts.volumetric;
    if (!chart) return;
    
    const areas = { pothole: 0, water_body: 0, crack: 0, flooding: 0 };
    hazards.forEach(h => { areas[h.type] = (areas[h.type] || 0) + h.surface_area_m2; });
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
    if (this.fullpageMap) return; // already init
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
    const currentIds = new Set(hazards.map(h => h.track_id));

    // Remove gone markers
    for (const [id, marker] of markersMap) {
      if (!currentIds.has(id)) {
        mapInstance.removeLayer(marker);
        markersMap.delete(id);
      }
    }

    // Add/update markers
    hazards.forEach(h => {
      const color = CONFIG.TYPE_COLORS[h.type] || '#00d4ff';
      const popupContent = `
        <div style="min-width: 160px;">
          <strong>${CONFIG.TYPE_ICONS[h.type]} ${CONFIG.TYPE_LABELS[h.type]}</strong><br/>
          <span style="color: #94a3b8;">Track ID:</span> #${h.track_id}<br/>
          <span style="color: #94a3b8;">Area:</span> ${h.surface_area_m2.toFixed(2)} m²<br/>
          <span style="color: #94a3b8;">Confidence:</span> ${(h.confidence * 100).toFixed(1)}%<br/>
          <span style="color: #94a3b8;">Lat:</span> ${h.location.latitude.toFixed(6)}<br/>
          <span style="color: #94a3b8;">Lon:</span> ${h.location.longitude.toFixed(6)}
        </div>`;

      if (markersMap.has(h.track_id)) {
        const marker = markersMap.get(h.track_id);
        marker.setLatLng([h.location.latitude, h.location.longitude]);
        marker.setPopupContent(popupContent);
        marker.setStyle({ color, fillColor: color, radius: Math.max(5, Math.min(14, h.surface_area_m2 * 0.8)) });
      } else {
        const marker = L.circleMarker([h.location.latitude, h.location.longitude], {
          radius: Math.max(5, Math.min(14, h.surface_area_m2 * 0.8)),
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
    if (!el || previous === 0) return;

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

    const sorted = [...hazards].sort((a, b) => b.surface_area_m2 - a.surface_area_m2).slice(0, CONFIG.MAX_ALERTS);
    const now = new Date();

    tbody.innerHTML = sorted.map((h, i) => {
      const severity = h.surface_area_m2 >= 75 ? 'critical'
                     : h.surface_area_m2 >= 25 ? 'high'
                     : h.surface_area_m2 >= 5 ? 'moderate' : 'low';
      const time = new Date(now.getTime() - Math.random() * 300000);
      const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return `<tr style="animation-delay: ${i * 0.03}s">
        <td class="td-time">${timeStr}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type]} ${CONFIG.TYPE_LABELS[h.type]}</span></td>
        <td class="td-area font-mono">${h.location.latitude.toFixed(4)}, ${h.location.longitude.toFixed(4)}</td>
        <td class="td-area">${h.surface_area_m2.toFixed(2)}</td>
        <td class="td-confidence">${(h.confidence * 100).toFixed(1)}%</td>
        <td><span class="severity-badge ${severity}">${severity}</span></td>
      </tr>`;
    }).join('');
  }

  updateDetectionsTable(hazards) {
    const tbody = document.getElementById('detections-tbody');
    if (!tbody) return;
    
    // Sort descending by area by default
    const sorted = [...hazards].sort((a, b) => b.surface_area_m2 - a.surface_area_m2);
    
    tbody.innerHTML = sorted.map((h, i) => {
      const severity = h.surface_area_m2 >= 75 ? 'CRITICAL'
                     : h.surface_area_m2 >= 25 ? 'HIGH'
                     : h.surface_area_m2 >= 5 ? 'MODERATE' : 'LOW';
      return `<tr>
        <td class="font-mono text-slate-400">#${h.track_id}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type]} ${CONFIG.TYPE_LABELS[h.type]}</span></td>
        <td>${(h.confidence * 100).toFixed(1)}%</td>
        <td>${h.surface_area_m2.toFixed(2)} m²</td>
        <td class="font-mono text-sm">${h.location.latitude.toFixed(5)}, ${h.location.longitude.toFixed(5)}</td>
        <td><span class="severity-badge ${severity.toLowerCase()}">${severity}</span></td>
        <td><span style="color: #10b981;">Active</span></td>
      </tr>`;
    }).join('');
  }

  updateAlertsFullTable(hazards, filter) {
    const tbody = document.getElementById('alerts-full-tbody');
    if (!tbody) return;

    let filtered = hazards.map(h => {
      const severity = h.surface_area_m2 >= 75 ? 'critical'
                     : h.surface_area_m2 >= 25 ? 'high'
                     : h.surface_area_m2 >= 5 ? 'moderate' : 'low';
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
    
    filtered.sort((a, b) => b.surface_area_m2 - a.surface_area_m2);
    const now = new Date();

    tbody.innerHTML = filtered.map((h, i) => {
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      return `<tr>
        <td class="td-time">${timeStr}</td>
        <td><span class="type-badge ${h.type}">${CONFIG.TYPE_ICONS[h.type]} ${CONFIG.TYPE_LABELS[h.type]}</span></td>
        <td class="font-mono text-sm">${h.location.latitude.toFixed(4)}, ${h.location.longitude.toFixed(4)}</td>
        <td>${h.surface_area_m2.toFixed(2)} m²</td>
        <td>${(h.confidence * 100).toFixed(1)}%</td>
        <td><span class="severity-badge ${h.severity}">${h.severity.toUpperCase()}</span></td>
        <td><button class="action-btn" style="background: rgba(255,255,255,0.1); border:none; padding: 4px 8px; border-radius: 4px; color: #fff; cursor: pointer;">Acknowledge</button></td>
      </tr>`;
    }).join('');
  }

  updateMapStats(hazards) {
    const total = document.getElementById('map-total-markers');
    const coverage = document.getElementById('map-coverage');
    const updated = document.getElementById('map-last-updated');
    if (total) total.textContent = hazards.length;
    if (coverage) coverage.textContent = (hazards.reduce((acc, h) => acc + h.surface_area_m2, 0) / 1000).toFixed(2) + ' sq km';
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
      totalArea += h.surface_area_m2;
      typeAreas[h.type] = (typeAreas[h.type] || 0) + h.surface_area_m2;
      if (h.surface_area_m2 > largest) largest = h.surface_area_m2;
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
          <td><span class="type-badge ${type}">${CONFIG.TYPE_ICONS[type]} ${CONFIG.TYPE_LABELS[type]}</span></td>
          <td>${area.toFixed(2)} m²</td>
          <td>${percentage}%</td>
        </tr>`;
      }).join('');
    }
  }

  updateStreamPanel(state) {
    const statusEl = document.getElementById('stream-conn-status');
    const statusDisp = document.getElementById('stream-status-display');
    const frameDisp = document.getElementById('stream-frame-display');
    const fpsDisp = document.getElementById('stream-fps-display');
    
    if (statusEl) statusEl.textContent = CONFIG.MODE === 'live' ? 'LIVE' : 'SIMULATION';
    if (statusDisp) statusDisp.textContent = 'Processing';
    if (frameDisp) frameDisp.textContent = state.frame_id;
    if (fpsDisp) fpsDisp.textContent = (28 + Math.random() * 6).toFixed(1);
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
        typeMatch = textContent.includes(CONFIG.TYPE_LABELS[typeFilter].toLowerCase());
      }
      
      const searchMatch = !searchLower || textContent.includes(searchLower);
      
      if (typeMatch && searchMatch) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
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
  }
}

/* ── Main Application ─────────────────────────────────────── */
class HydroVisionDashboard {
  constructor() {
    this.simulator = new DataSimulator();
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
    
    // Attach log globally so backend can use it
    window._addLog = (msg) => this.ui.addConnectionLog(msg);
  }
  
  init() {
    // Init page router
    this.router.init();
    
    // Init dashboard charts (only for dashboard page)
    this.charts.initTimeline('timeline-chart');
    this.charts.initSeverity('severity-chart');
    this.charts.initHazardTypes('types-chart');
    this.charts.initGauge('gauge-chart');
    
    // Init main map
    setTimeout(() => { this.map = new MapManager('hazard-map'); }, 100);
    
    // Init sidebar
    initSidebar();
    
    // Clock
    this.ui.updateClock();
    setInterval(() => this.ui.updateClock(), 1000);
    
    // FPS
    setInterval(() => this.ui.updateFPS(), 500);
    
    // Setup settings page handlers
    this._initSettings();
    
    // Setup stream control handlers  
    this._initStreamControls();
    
    // Setup detection filters
    this._initDetectionFilters();
    
    // Setup alert filters
    this._initAlertFilters();
    
    // Start in simulation mode
    this._startSimulation();
  }
  
  onPageEnter(pageName) {
    // Called by router when switching pages
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
    } else if (pageName === 'settings' && this.currentState) {
      this.ui.updateStreamPanel(this.currentState);
    }
  }
  
  _processState(state) {
    this.previousState = this.currentState;
    this.currentState = state;
    
    // Update everything global/dashboard:
    this.ui.updateKPIs(state, this.previousState);
    this.ui.updateNavBadges(state);
    this.charts.updateTimeline(state.summary.active_hazards);
    this.charts.updateSeverity(state.hazards);
    this.charts.updateHazardTypes(state.hazards);
    this.charts.updateGauge(state.summary.risk_level);
    this.ui.updateAlertsTable(state.hazards);
    this.ui.updateFrameId(state.frame_id);
    
    if (this.map) this.map.update(state.hazards);
    
    // Update active page content
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
    } else if (pageName === 'settings') {
      this.ui.updateStreamPanel(state);
    }
  }
  
  _startSimulation() {
    CONFIG.MODE = 'simulation';
    this.ui.updateStreamStatus('STREAMING');
    this.ui.addConnectionLog('Simulation mode started');
    this._tick();
    if (this.intervalId) { clearInterval(this.intervalId); }
    this.intervalId = setInterval(() => this._tick(), CONFIG.UPDATE_INTERVAL);
  }
  
  _startLive() {
    CONFIG.MODE = 'live';
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
    
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
  
  _tick() {
    const { current } = this.simulator.tick();
    // Add alert_count if not present
    if (current.summary.alert_count === undefined) {
      current.summary.alert_count = current.hazards.filter(h => h.surface_area_m2 >= 5).length;
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
        
        if (liveRadio?.checked) {
          this._startLive();
        } else {
          this._startSimulation();
        }
        this.ui.addConnectionLog('Settings saved');
      });
    }
  }
  
  _initStreamControls() {
    document.getElementById('btn-start-stream')?.addEventListener('click', async () => {
      const videoPath = document.getElementById('video-path-input')?.value;
      if (CONFIG.MODE === 'live' && this.backend) {
        await this.backend.startStream(videoPath);
        this.ui.addConnectionLog(`Stream started: ${videoPath}`);
      } else {
        this.ui.addConnectionLog('Start stream (simulation mode — no backend)');
      }
    });
    
    document.getElementById('btn-stop-stream')?.addEventListener('click', async () => {
      if (CONFIG.MODE === 'live' && this.backend) {
        await this.backend.stopStream();
        this.ui.addConnectionLog('Stream stopped');
      }
    });
    
    document.getElementById('btn-reset-stream')?.addEventListener('click', () => {
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null; }
      this.simulator = new DataSimulator();
      this._startSimulation();
      this.ui.addConnectionLog('Simulation reset');
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

/* ── Bootstrap ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const app = new HydroVisionDashboard();
  app.init();
});
