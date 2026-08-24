import { useEffect, useRef, useState } from 'react';
import { useStore, CONFIG } from '../store.js';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const TILE_LAYERS = {
  'google-hybrid': {
    name: '🛰️ Satellite',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '© Google Maps Satellite',
  },
  'google-streets': {
    name: '🗺️ Map',
    url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 20,
    attribution: '© Google Maps',
  },
  'dark': {
    name: '🌙 Dark',
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

  const [activeLayer, setActiveLayer] = useState('google-hybrid');
  const { hazards, telemetry, currentPage } = useStore();

  // Initialize Map
  useEffect(() => {
    if (mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [CONFIG.CENTER_LAT, CONFIG.CENTER_LON],
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

  // Update Hazard Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const valid = hazards.filter(h => h.location?.latitude && h.location?.longitude);
    const currentIds = new Set(valid.map(h => h.track_id));

    for (const [id, marker] of markers) {
      if (!currentIds.has(id)) {
        map.removeLayer(marker);
        markers.delete(id);
      }
    }

    valid.forEach(h => {
      const className = h.class_name || h.type || 'pothole_dry';
      const color = CONFIG.TYPE_COLORS[className] || CONFIG.TYPE_COLORS[h.type] || '#10b981';
      const confidenceStr = `${((h.confidence ?? 0.95) * 100).toFixed(1)}%`;
      const volumeStr = `${Number(h.estimated_volume_m3 || 0.05).toFixed(2)} m³`;
      const detectionsStr = `${h.detections_count || 1} frame passes`;
      const hazardId = h.hazard_id || `HAZ-${String(h.track_id).padStart(4, '0')}`;
      const radius = Math.max(7, Math.min(18, (Number(h.estimated_volume_m3) || 0.1) * 35));

      const popup = `
        <div style="min-width:185px;font-family:'Segoe UI',sans-serif;font-size:12px;color:#0f172a;padding:2px">
          <div style="font-weight:800;color:${color};font-size:13px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:4px">
            <span style="display:flex;align-items:center;gap:4px">
              <span>${CONFIG.TYPE_ICONS[className] || CONFIG.TYPE_ICONS[h.type] || '⚠️'}</span>
              <span>${(CONFIG.TYPE_LABELS[className] || className).toUpperCase()}</span>
            </span>
            <span style="font-size:10px;color:#64748b;font-family:monospace">${hazardId}</span>
          </div>
          <div style="line-height:1.7;font-size:11px">
            <div><span style="color:#64748b;font-weight:600">Class Name:</span> <code style="background:#f1f5f9;padding:1px 5px;border-radius:3px;color:#0f172a;font-weight:700">${className}</code></div>
            <div><span style="color:#64748b;font-weight:600">Confidence:</span> <strong>${confidenceStr}</strong></div>
            <div><span style="color:#64748b;font-weight:600">Estimated Volume:</span> <strong>${volumeStr}</strong></div>
            <div><span style="color:#64748b;font-weight:600">Detection Count:</span> <strong>${detectionsStr}</strong></div>
            <div style="font-family:monospace;color:#64748b;margin-top:4px;font-size:10px;border-top:1px dashed #cbd5e1;padding-top:3px">
              📍 ${h.location.latitude.toFixed(6)}, ${h.location.longitude.toFixed(6)}
            </div>
          </div>
        </div>
      `;

      if (markers.has(h.track_id)) {
        const m = markers.get(h.track_id);
        m.setLatLng([h.location.latitude, h.location.longitude]);
        m.setPopupContent(popup);
        m.setStyle({ color: '#ffffff', fillColor: color, radius: radius });
      } else {
        const m = L.circleMarker([h.location.latitude, h.location.longitude], {
          radius: radius,
          fillColor: color,
          fillOpacity: 0.85,
          color: '#ffffff',
          weight: 2.5,
          opacity: 1,
        }).addTo(map).bindPopup(popup);
        markers.set(h.track_id, m);
      }
    });
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
          🚁 LIVE DRONE POSITION<br/>
          <span style="font-size:11px;color:#64748b;font-weight:normal">
            ALT: ${telemetry.altitude.toFixed(1)}m | SPD: ${telemetry.speed.toFixed(1)}m/s
          </span>
        </div>
      `);
    }
  }, [telemetry.latitude, telemetry.longitude, telemetry.heading, telemetry.altitude, telemetry.speed]);

  // Recenter / Fit All Hazards
  const handleRecenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const points = [];
    if (telemetry.latitude && telemetry.longitude) {
      points.push([telemetry.latitude, telemetry.longitude]);
    }
    hazards.forEach(h => {
      if (h.location?.latitude && h.location?.longitude) {
        points.push([h.location.latitude, h.location.longitude]);
      }
    });

    if (points.length > 1) {
      map.fitBounds(points, { padding: [40, 40], maxZoom: 18 });
    } else if (points.length === 1) {
      map.setView(points[0], 18);
    } else {
      map.setView([CONFIG.CENTER_LAT, CONFIG.CENTER_LON], 17);
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
              background: activeLayer === key ? 'var(--amber)' : 'transparent',
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
            fontSize: '1rem',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          }}
        >
          🎯
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
    </div>
  );
}
