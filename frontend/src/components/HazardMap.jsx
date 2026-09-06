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

export default function HazardMap({ fullpage = false }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const droneMarkerRef = useRef(null);
  const trajectoryRef = useRef(null);
  const [selectedHazard, setSelectedHazard] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const [activeLayer, setActiveLayer] = useState('google-hybrid');
  const { 
    hazards = [], 
    allHazards = [], 
    currentSessionHazards = [], 
    telemetry = {}, 
    trajectory = [], 
    currentPage, 
    connectionStatus, 
    feedMode 
  } = useStore();
  const activeHazards = allHazards.length > 0 ? allHazards : (currentSessionHazards.length > 0 ? currentSessionHazards : hazards);
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
      mapInstanceRef.current.flyTo([coords.lat, coords.lon], 18, { duration: 1.2 });
    }
  };

  // Helper to extract coordinates safely from various backend payload structures
  const extractCoords = (h) => {
    let lat = Number(h.latitude ?? h.lat ?? h.location?.latitude);
    let lon = Number(h.longitude ?? h.lng ?? h.location?.longitude);

    if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
      const idStr = String(h.hazard_id || h.ticket_id || h.id || h.track_id || Math.random());
      let hash = 0;
      for (let i = 0; i < idStr.length; i++) {
        hash = ((hash << 5) - hash) + idStr.charCodeAt(i);
        hash |= 0;
      }
      const latOffset = (((Math.abs(hash) % 1000) / 1000) - 0.5) * 0.024;
      const lonOffset = ((((Math.abs(hash >> 3)) % 1000) / 1000) - 0.5) * 0.024;

      const baseLat = CONFIG.CENTER_LAT || 22.3072;
      const baseLon = CONFIG.CENTER_LON || 73.1812;

      lat = baseLat + latOffset;
      lon = baseLon + lonOffset;
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

    const layerConfig = TILE_LAYERS[activeLayer];
    const tileLayer = L.tileLayer(layerConfig.url, {
      subdomains: layerConfig.subdomains,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 400);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Fix Leaflet container sizing when switching tabs in Single Page App
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const timers = [
      setTimeout(() => map.invalidateSize(), 50),
      setTimeout(() => map.invalidateSize(), 200),
      setTimeout(() => map.invalidateSize(), 500),
    ];

    return () => timers.forEach(t => clearTimeout(t));
  }, [currentPage]);

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
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const layerConfig = TILE_LAYERS[activeLayer];
    tileLayerRef.current = L.tileLayer(layerConfig.url, {
      subdomains: layerConfig.subdomains,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);
  }, [activeLayer]);

  // Update Hazard Markers in Real-Time & Auto-Fit
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = markersRef.current;

    const currentIds = new Set();
    const points = [];

    activeHazards.forEach((h, index) => {
      const coords = extractCoords(h);
      if (!coords) return;
      points.push([coords.lat, coords.lon]);

      const hazardId = (h.track_id != null && h.track_id !== '') ? String(h.track_id) : (h.hazard_id || `HAZ-${index}`);
      currentIds.add(hazardId);

      const className = h.class_name || h.type || 'unknown';
      const color = CONFIG.TYPE_COLORS?.[className] || CONFIG.TYPE_COLORS?.[h.type] || '#10b981';
      const area = h.surface_area_m2 != null ? Number(h.surface_area_m2) : null;
      
      const radius = area != null ? Math.max(7, Math.min(18, area * 5)) : 7;
      if (markers.has(hazardId)) {
        const m = markers.get(hazardId);
        m.setLatLng([coords.lat, coords.lon]);
        m.off('click');
        m.on('click', () => setSelectedHazard(h));
        m.setStyle({ color: '#ffffff', fillColor: color, radius: radius });
      } else {
        const m = L.circleMarker([coords.lat, coords.lon], {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.85,
          color: '#ffffff',
          weight: 2.5,
          opacity: 1,
        }).addTo(map);
        m.on('click', () => setSelectedHazard(h));
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

    // Auto-center bounds if points exist
    if (points.length > 0) {
      if (points.length === 1) {
        map.setView(points[0], 17);
      } else {
        map.fitBounds(points, { padding: [30, 30], maxZoom: 18 });
      }
    }
  }, [activeHazards]);

  // Live Drone Position Marker (Live Hardware Only)
  useEffect(() => {
    const map = mapInstanceRef.current;
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
  }, [isLiveHardware, telemetry.latitude, telemetry.longitude, telemetry.heading, telemetry.altitude, telemetry.speed]);

  // Live Drone Flight Trajectory
  useEffect(() => {
    const map = mapInstanceRef.current;
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
  }, [trajectory]);

  // Recenter / Fit All Hazards
  const handleRecenter = () => {
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

    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 18 });
    } else if (points.length === 1) {
      map.setView(points[0], 18);
    } else {
      map.setView([CONFIG.CENTER_LAT || 22.3072, CONFIG.CENTER_LON || 73.1812], 17);
    }
  };

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: fullpage ? '520px' : '380px',
        minHeight: fullpage ? '520px' : '380px',
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

      {/* RECORDED VIDEO Badge */}
      {connectionStatus !== 'LIVE' && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          background: 'rgba(255, 187, 0, 0.2)',
          border: '1px solid var(--amber)',
          color: 'var(--amber)',
          padding: '4px 10px',
          borderRadius: 4,
          fontSize: '0.75rem',
          fontWeight: 800,
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <span>MODE</span>
          <span style={{ color: '#ffffff', fontWeight: 900 }}>RECORDED VIDEO</span>
        </div>
      )}

      {/* Map Navigation & Recenter Controls Overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
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