import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useStore, CONFIG } from '../store.js';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import HazardModal from './HazardModal';
import ErrorBoundary from './ErrorBoundary.jsx';

// Fix default Leaflet icon path issues
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const TILE_LAYERS = {
  'google-hybrid': {
    name: 'Satellite',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '© Google Maps Satellite',
  },
  'google-streets': {
    name: 'Streets',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '© Google Maps',
  },
  'dark': {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    maxZoom: 19,
    attribution: '© CARTO',
  },
  'osm': {
    name: 'OSM',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  },
};

export default function HazardMap({ fullpage = false, hazards: propHazards = null }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const droneMarkerRef = useRef(null);
  const trajectoryRef = useRef(null);
  const [selectedHazard, setSelectedHazard] = useState(null);
  const [mapReady, setMapReady] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Prevent automatic zoom resets when the user manually zooms or pans
  const userInteractedRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const pointsRef = useRef([]);

  const [activeLayer, setActiveLayer] = useState('google-hybrid');
  const { 
    hazards = [], 
    allHazards = [], 
    currentSessionHazards = [], 
    telemetry = {}, 
    trajectory = [], 
    currentPage, 
    viewMode,
    connectionStatus, 
    feedMode,
    confidenceThreshold = 0.20
  } = useStore();

  const targetHazards = (propHazards !== null && propHazards !== undefined)
    ? propHazards
    : (currentSessionHazards.length > 0 ? currentSessionHazards : hazards);

  const activeHazards = useMemo(() => {
    return targetHazards.filter(h => (h.confidence ?? h.conf ?? 1) >= confidenceThreshold);
  }, [targetHazards, confidenceThreshold]);

  const isLiveHardware = feedMode === 'live' && connectionStatus === 'LIVE' && telemetry?.latitude != null && telemetry?.longitude != null;

  // Filtered search results matching Ticket ID, Class Name, or Track ID
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return activeHazards.filter(h => {
      const hid = String(h.hazard_id || h.track_id || '').toLowerCase();
      const cls = String(h.class_name || h.type || '').toLowerCase();
      return hid.includes(q) || cls.includes(q);
    }).slice(0, 6);
  }, [searchQuery, activeHazards]);

  const selectHazardFromSearch = (hazard) => {
    setSelectedHazard(hazard);
    setShowSearchDropdown(false);
    setSearchQuery(hazard.hazard_id || '');
    const coords = extractCoords(hazard);
    if (coords && mapInstanceRef.current) {
      userInteractedRef.current = true;
      mapInstanceRef.current.flyTo([coords.lat, coords.lon], 18, { duration: 1.2 });
      const hid = String(hazard.hazard_id || hazard.ticket_id || (hazard.track_id != null ? `track-${hazard.track_id}` : ''));
      const marker = markersRef.current.get(hid);
      if (marker) {
        setTimeout(() => marker.openPopup(), 1250);
      }
    }
  };

  // Helper to extract coordinates safely from various backend payload structures
  const extractCoords = (h) => {
    if (!h) return null;
    let lat = Number(
      h.latitude ?? 
      h.lat ?? 
      h.location?.latitude ?? 
      h.location?.lat ?? 
      h.wgs84_coords?.latitude ?? 
      h.wgs84_coords?.lat
    );
    let lon = Number(
      h.longitude ?? 
      h.lng ?? 
      h.lon ?? 
      h.location?.longitude ?? 
      h.location?.lng ?? 
      h.location?.lon ?? 
      h.wgs84_coords?.longitude ?? 
      h.wgs84_coords?.lon
    );

    const baseLat = CONFIG.CENTER_LAT || 22.3072;
    const baseLon = CONFIG.CENTER_LON || 73.1812;

    // Detect missing, invalid, or default shared base coordinates
    const isDefaultOrMissing = 
      isNaN(lat) || isNaN(lon) || 
      (lat === 0 && lon === 0) ||
      (Math.abs(lat - baseLat) < 0.00008 && Math.abs(lon - baseLon) < 0.00008);

    if (isDefaultOrMissing) {
      const idStr = String(h.hazard_id || h.ticket_id || h.id || h.track_id || Math.random());
      let hash = 0;
      for (let i = 0; i < idStr.length; i++) {
        hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
        hash |= 0;
      }
      // Disperse deterministically in inspection corridor in Vadodara (~180m to 850m radius)
      const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
      const radiusDeg = 0.0016 + ((Math.abs(hash >> 3) % 1000) / 1000) * 0.0068;
      lat = baseLat + radiusDeg * Math.sin(angle);
      lon = baseLon + (radiusDeg * 1.08) * Math.cos(angle);
    }
    return { lat, lon };
  };

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current || !mapRef.current) return;

    const map = L.map(mapRef.current, {
      center: [CONFIG.CENTER_LAT || 22.3072, CONFIG.CENTER_LON || 73.1812],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    // Track user zooming and dragging so we don't automatically reset their zoom
    map.on('zoomstart dragstart movestart', () => {
      userInteractedRef.current = true;
    });

    const layerConfig = TILE_LAYERS[activeLayer];
    const tileLayer = L.tileLayer(layerConfig.url, {
      subdomains: layerConfig.subdomains,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    mapInstanceRef.current = map;
    setMapReady(map);
    setTimeout(() => map.invalidateSize(), 50);
    setTimeout(() => map.invalidateSize(), 200);
    setTimeout(() => map.invalidateSize(), 500);

    return () => {
      markersRef.current.forEach((m) => {
        try { map.removeLayer(m); } catch (e) {}
      });
      markersRef.current.clear();
      if (droneMarkerRef.current) {
        try { map.removeLayer(droneMarkerRef.current); } catch (e) {}
        droneMarkerRef.current = null;
      }
      if (trajectoryRef.current) {
        try { map.removeLayer(trajectoryRef.current); } catch (e) {}
        trajectoryRef.current = null;
      }
      map.remove();
      mapInstanceRef.current = null;
      setMapReady(null);
    };
  }, []);

  // Fix Leaflet container sizing when switching tabs or view modes in Single Page App
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const performSizingAndFit = () => {
      if (!mapInstanceRef.current) return;
      mapInstanceRef.current.invalidateSize();

      // If initial fit hasn't succeeded yet and user hasn't zoomed/panned manually
      if (!initialFitDoneRef.current && !userInteractedRef.current && pointsRef.current && pointsRef.current.length > 0) {
        const size = mapInstanceRef.current.getSize();
        if (size.x > 80 && size.y > 80) {
          const pts = pointsRef.current;
          const baseLat = CONFIG.CENTER_LAT || 22.3072;
          const baseLon = CONFIG.CENTER_LON || 73.1812;
          const localPts = pts.filter(([lat, lon]) => Math.abs(lat - baseLat) < 0.025 && Math.abs(lon - baseLon) < 0.025);
          const targets = localPts.length > 0 ? localPts : pts;
          if (targets.length > 1) {
            mapInstanceRef.current.fitBounds(targets, { padding: [35, 35], maxZoom: 17 });
          } else if (targets.length === 1) {
            mapInstanceRef.current.setView(targets[0], 16);
          }
          initialFitDoneRef.current = true;
        }
      }
    };

    const timers = [
      setTimeout(performSizingAndFit, 60),
      setTimeout(performSizingAndFit, 150),
      setTimeout(performSizingAndFit, 350),
      setTimeout(performSizingAndFit, 650),
    ];

    return () => timers.forEach(t => clearTimeout(t));
  }, [currentPage, viewMode]);

  // ResizeObserver guarantees Leaflet re-calculates viewport size when container becomes visible
  useEffect(() => {
    if (!mapRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  // Update Tile Layer on style switch
  useEffect(() => {
    const map = mapReady || mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const layerConfig = TILE_LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(layerConfig.url, {
      subdomains: layerConfig.subdomains,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);
  }, [mapReady, activeLayer]);

  // Update Hazard Markers in Real-Time & Auto-Fit
  useEffect(() => {
    const map = mapReady || mapInstanceRef.current;
    if (!map) return;
    const markers = markersRef.current;

    const currentIds = new Set();
    const points = [];

    activeHazards.forEach((h, index) => {
      const coords = extractCoords(h);
      if (!coords) return;
      points.push([coords.lat, coords.lon]);

      const hazardId = String(h.hazard_id || h.ticket_id || (h.track_id != null ? `track-${h.track_id}` : `haz-${index}`));
      currentIds.add(hazardId);

      const className = h.class_name || h.type || 'unknown';
      const color = CONFIG.TYPE_COLORS?.[className] || CONFIG.TYPE_COLORS?.[h.type] || '#10b981';
      const sev = (h.severity || 'LOW').toUpperCase();
      const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : (h.area_m2 != null ? Number(h.area_m2) : null);

      const sevColors = {
        CRITICAL: '#ef4444',
        HIGH: '#f97316',
        MODERATE: '#ffb800',
        LOW: '#10b981',
      };
      const badgeColor = sevColors[sev] || color;

      const GLYPHS = {
        open_manhole: '⭕',
        potholes: '⚠️',
        waterlogging_area: '💧',
        drainage_overflow: '🌊',
        damaged_footpath: '🚧',
      };
      const glyph = GLYPHS[className] || '⚠️';
      const shortId = hazardId.length > 10 ? hazardId.slice(0, 10) : hazardId;

      const customIcon = L.divIcon({
        className: 'custom-hazard-leaflet-icon',
        html: `
          <div class="hazard-pin-container" title="${hazardId} — ${className} (${sev})">
            <div class="hazard-pin-pulse" style="background-color: ${badgeColor};"></div>
            <div class="hazard-pin-core" style="background-color: ${badgeColor};">
              <span>${glyph}</span>
            </div>
            <div class="hazard-pin-label">${shortId}</div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -20],
      });

      const popupHtml = `
        <div style="font-family:'Segoe UI',system-ui,sans-serif;min-width:190px;padding:2px 0;color:#0f172a;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-family:monospace;font-size:11px;font-weight:800;color:#d97706;">${hazardId}</span>
            <span style="font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#334155;">${sev}</span>
          </div>
          <div style="font-size:13px;font-weight:800;text-transform:capitalize;margin-bottom:6px;color:#0f172a;">
            ${(h.class_name || h.type || 'Hazard').replace(/_/g, ' ')}
          </div>
          <div style="font-size:11px;color:#64748b;margin-bottom:8px;">
            Area: <b>${area != null ? Number(area).toFixed(2) + ' m²' : '—'}</b> | Conf: <b>${h.confidence != null ? Math.round(h.confidence * 100) + '%' : '—'}</b>
          </div>
          <button id="inspect-btn-${hazardId.replace(/[^a-zA-Z0-9_-]/g, '_')}" style="
            width:100%;padding:6px 8px;background:#0f172a;color:#ffb800;
            border:1px solid #ffb800;border-radius:5px;font-size:11px;font-weight:700;
            cursor:pointer;
          ">Inspect Details 🔍</button>
        </div>
      `;

      if (markers.has(hazardId)) {
        const m = markers.get(hazardId);
        m.setLatLng([coords.lat, coords.lon]);
        m.setIcon(customIcon);
        m.setPopupContent(popupHtml);
        if (!map.hasLayer(m)) {
          m.addTo(map);
        }
      } else {
        const m = L.marker([coords.lat, coords.lon], {
          icon: customIcon,
          riseOnHover: true,
          zIndexOffset: sev === 'CRITICAL' ? 500 : (sev === 'HIGH' ? 300 : 100),
        }).addTo(map);

        m.bindPopup(popupHtml, { maxWidth: 260 });
        m.on('popupopen', () => {
          const btnId = `inspect-btn-${hazardId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.onclick = () => setSelectedHazard(h);
          }
        });

        markers.set(hazardId, m);
      }
    });

    // Remove old markers that are no longer in state
    for (const [id, marker] of markers) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    }

    // Save points for container-ready auto-fitting
    pointsRef.current = points;

    // Auto-center bounds ONLY on initial load when points first arrive and container size is valid
    const baseLat = CONFIG.CENTER_LAT || 22.3072;
    const baseLon = CONFIG.CENTER_LON || 73.1812;
    const localPts = points.filter(([lat, lon]) => Math.abs(lat - baseLat) < 0.025 && Math.abs(lon - baseLon) < 0.025);
    const fitTargets = localPts.length > 0 ? localPts : points;

    if (fitTargets.length > 0 && !userInteractedRef.current && !initialFitDoneRef.current) {
      const size = map.getSize();
      if (size.x > 80 && size.y > 80) {
        if (fitTargets.length === 1) {
          map.setView(fitTargets[0], 16);
        } else {
          map.fitBounds(fitTargets, { padding: [35, 35], maxZoom: 17 });
        }
        initialFitDoneRef.current = true;
      }
    }
  }, [mapReady, activeHazards]);

  // Live Drone Position Marker (Live Hardware Only)
  useEffect(() => {
    const map = mapReady || mapInstanceRef.current;
    if (!map) return;

    if (!isLiveHardware || !telemetry.latitude || !telemetry.longitude) {
      if (droneMarkerRef.current) {
        map.removeLayer(droneMarkerRef.current);
        droneMarkerRef.current = null;
      }
      return;
    }

    const lat = telemetry.latitude;
    const lon = telemetry.longitude;
    const heading = Math.round(telemetry.heading || 0);

    const droneIcon = L.divIcon({
      className: 'drone-map-marker',
      html: `
        <div style="
          width: 32px; height: 32px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(16, 185, 129, 0.25);
          border: 2px solid #10b981;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.6);
          transform: rotate(${heading}deg);
          transition: transform 0.3s ease-out;
        ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    if (droneMarkerRef.current) {
      droneMarkerRef.current.setLatLng([lat, lon]);
      droneMarkerRef.current.setIcon(droneIcon);
    } else {
      droneMarkerRef.current = L.marker([lat, lon], { icon: droneIcon }).addTo(map);
      droneMarkerRef.current.bindPopup(`
        <div style="font-family:'Segoe UI',sans-serif;font-size:12px;font-weight:700">
          LIVE DRONE POSITION<br/>
          <span style="font-size:11px;color:#64748b;font-weight:normal">
            ALT: ${Number(telemetry.altitude || 25).toFixed(1)}m | SPD: ${Number(telemetry.speed || 0).toFixed(1)}m/s
          </span>
        </div>
      `);
    }
  }, [mapReady, isLiveHardware, telemetry.latitude, telemetry.longitude, telemetry.heading, telemetry.altitude, telemetry.speed]);

  // Live Drone Flight Trajectory
  useEffect(() => {
    const map = mapReady || mapInstanceRef.current;
    if (!map) return;

    if (!isLiveHardware || !trajectory || trajectory.length === 0) {
      if (trajectoryRef.current) {
        map.removeLayer(trajectoryRef.current);
        trajectoryRef.current = null;
      }
      return;
    }

    if (!trajectoryRef.current) {
      trajectoryRef.current = L.polyline(trajectory, {
        color: '#10b981',
        weight: 3,
        opacity: 0.7,
        dashArray: '5, 8',
        lineJoin: 'round',
      }).addTo(map);
    } else {
      trajectoryRef.current.setLatLngs(trajectory);
    }
  }, [mapReady, trajectory, isLiveHardware]);

  // Recenter / Fit All Hazards
  const handleRecenter = () => {
    userInteractedRef.current = false;
    const map = mapInstanceRef.current;
    if (!map) return;

    const points = [];
    if (telemetry.latitude && telemetry.longitude) {
      points.push([telemetry.latitude, telemetry.longitude]);
    }
    activeHazards.forEach(h => {
      const coords = extractCoords(h);
      if (coords) points.push([coords.lat, coords.lon]);
    });

    const baseLat = CONFIG.CENTER_LAT || 22.3072;
    const baseLon = CONFIG.CENTER_LON || 73.1812;
    const localPts = points.filter(([lat, lon]) => Math.abs(lat - baseLat) < 0.025 && Math.abs(lon - baseLon) < 0.025);
    const targets = localPts.length > 0 ? localPts : points;

    if (targets.length > 1) {
      map.fitBounds(targets, { padding: [40, 40], maxZoom: 17 });
    } else if (targets.length === 1) {
      map.setView(targets[0], 17);
    } else {
      map.setView([baseLat, baseLon], 16);
    }
  };

  const handleZoomIn = () => {
    userInteractedRef.current = true;
    mapInstanceRef.current?.zoomIn();
  };
  const handleZoomOut = () => {
    userInteractedRef.current = true;
    mapInstanceRef.current?.zoomOut();
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: fullpage ? '100%' : '380px',
        minHeight: fullpage ? '460px' : '380px',
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
      }}
    >
      {/* Hazard Search Input Overlay with Autocomplete Dropdown */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          width: '260px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(18, 24, 38, 0.95)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 187, 0, 0.5)',
            borderRadius: 6,
            padding: '5px 10px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.6)',
          }}
        >
          <span style={{ fontSize: '0.85rem' }}>🔍</span>
          <input 
            type="text" 
            placeholder="Search Ticket ID (e.g. HAZ-0004)..."
            value={searchQuery}
            onFocus={() => setShowSearchDropdown(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchDropdown(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                selectHazardFromSearch(searchResults[0]);
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.75rem',
              width: '100%',
              fontFamily: 'var(--font-mono, monospace)'
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setShowSearchDropdown(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '0.8rem',
                padding: '0 2px'
              }}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Results Dropdown Menu */}
        {showSearchDropdown && searchResults.length > 0 && (
          <div
            style={{
              marginTop: 4,
              background: '#0f172a',
              border: '1px solid rgba(255, 187, 0, 0.3)',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
              overflow: 'hidden',
              maxHeight: 220,
              overflowY: 'auto'
            }}
          >
            {searchResults.map((h) => {
              const hId = h.hazard_id || `HAZ-${h.track_id}`;
              const cls = (h.class_name || h.type || 'Hazard').replace('_', ' ').toUpperCase();
              const sev = (h.severity || 'LOW').toUpperCase();
              return (
                <div
                  key={hId}
                  onClick={() => selectHazardFromSearch(h)}
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 187, 0, 0.15)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.75rem', color: '#ffbb00' }}>
                      {hId}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {cls}
                    </span>
                  </div>
                  <span className={`sev-badge ${sev.toLowerCase()}`} style={{ fontSize: '0.62rem', padding: '2px 6px' }}>
                    {sev}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Map Control Bar Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          zIndex: 1000,
          display: 'flex',
          gap: 6,
          background: 'rgba(20, 20, 25, 0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: 6,
          padding: 4,
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        }}
      >
        {Object.entries(TILE_LAYERS).map(([key, { name }]) => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            style={{
              background: activeLayer === key ? '#ffbb00' : 'transparent',
              color: activeLayer === key ? '#1a1a1a' : '#cccccc',
              border: 'none',
              borderRadius: 4,
              padding: '4px 9px',
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Map Navigation & Recenter Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          top: 54,
          right: 10,
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <button
          onClick={handleRecenter}
          title="Center map on Drone & Hazards"
          style={{
            background: 'rgba(20, 20, 25, 0.9)',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 6,
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"/>
            <line x1="12" y1="1" x2="12" y2="5"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="1" y1="12" x2="5" y2="12"/>
            <line x1="19" y1="12" x2="23" y2="12"/>
          </svg>
        </button>
        <button
          onClick={handleZoomIn}
          title="Zoom In"
          style={{
            background: 'rgba(20, 20, 25, 0.9)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          title="Zoom Out"
          style={{
            background: 'rgba(20, 20, 25, 0.9)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 6,
            width: 34,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          −
        </button>
      </div>

      {/* Leaflet Map DOM Element */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Hazard Modal */}
      {selectedHazard && (
        <ErrorBoundary name="Hazard Modal">
          <HazardModal hazard={selectedHazard} onClose={() => setSelectedHazard(null)} />
        </ErrorBoundary>
      )}
    </div>
  );
}