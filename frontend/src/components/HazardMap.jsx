import React, { useEffect, useRef, useState } from 'react';
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
};

export default function HazardMap({ fullpage = false }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef(new Map());
  const droneMarkerRef = useRef(null);
  const trajectoryRef = useRef(null);

  const [activeLayer, setActiveLayer] = useState('google-hybrid');
  const [selectedHazard, setSelectedHazard] = useState(null);
  const { hazards = [], telemetry = {}, trajectory = [], currentPage, connectionStatus } = useStore();

  // Helper to extract coordinates safely from various backend payload structures
  const extractCoords = (h) => {
    const lat = Number(h.latitude ?? h.lat ?? h.location?.latitude);
    const lon = Number(h.longitude ?? h.lng ?? h.location?.longitude);
    if (isNaN(lat) || isNaN(lon)) return null;
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

  // Update Hazard Markers in Real-Time
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = markersRef.current;

    const currentIds = new Set();

    hazards.forEach((h, index) => {
      const coords = extractCoords(h);
      if (!coords) return;

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
  }, [hazards]);

  // Live Drone Position Marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !telemetry.latitude || !telemetry.longitude) return;

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
  }, [telemetry.latitude, telemetry.longitude, telemetry.heading, telemetry.altitude, telemetry.speed]);

  // Live Drone Flight Trajectory
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !trajectory || trajectory.length === 0) return;

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
    hazards.forEach(h => {
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
        height: fullpage ? 'calc(100vh - 220px)' : '380px',
        minHeight: fullpage ? '550px' : '380px',
        borderRadius: '0 0 8px 8px',
        overflow: 'hidden',
      }}
    >
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