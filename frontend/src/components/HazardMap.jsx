import { useEffect, useRef } from 'react';
import { useStore, CONFIG } from '../store.js';
import L from 'leaflet';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function HazardMap({ fullpage = false }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef(new Map());
  const { hazards } = useStore();

  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapRef.current, {
      center: [CONFIG.CENTER_LAT, CONFIG.CENTER_LON],
      zoom: 15,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution('© <a href="https://carto.com">CARTO</a>').addTo(map);
    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 300);
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const markers = markersRef.current;
    const valid = hazards.filter(h => h.location?.latitude && h.location?.longitude);
    const currentIds = new Set(valid.map(h => h.track_id));

    for (const [id, marker] of markers) {
      if (!currentIds.has(id)) { map.removeLayer(marker); markers.delete(id); }
    }

    valid.forEach(h => {
      const color = CONFIG.TYPE_COLORS[h.type] || '#00d4ff';
      const area = Number(h.surface_area_m2) || 0;
      const popup = `<div style="min-width:150px;font-family:'Inter',sans-serif;font-size:12px">
        <strong style="color:${color}">${CONFIG.TYPE_ICONS[h.type] || ''} ${CONFIG.TYPE_LABELS[h.type] || h.type}</strong><br/>
        <span style="color:#94a3b8">Track:</span> #${h.track_id}<br/>
        <span style="color:#94a3b8">Area:</span> ${area.toFixed(2)} m²<br/>
        <span style="color:#94a3b8">Confidence:</span> ${((h.confidence ?? 1) * 100).toFixed(1)}%<br/>
        <span style="color:#94a3b8">Severity:</span> <strong style="color:${CONFIG.SEVERITY_COLORS[h.severity || 'LOW']}">${h.severity || 'LOW'}</strong><br/>
        <span style="color:#94a3b8">Lat:</span> ${h.location.latitude.toFixed(6)}<br/>
        <span style="color:#94a3b8">Lon:</span> ${h.location.longitude.toFixed(6)}
      </div>`;
      if (markers.has(h.track_id)) {
        const m = markers.get(h.track_id);
        m.setLatLng([h.location.latitude, h.location.longitude]);
        m.setPopupContent(popup);
        m.setStyle({ color, fillColor: color, radius: Math.max(5, Math.min(16, area * 0.8)) });
      } else {
        const m = L.circleMarker([h.location.latitude, h.location.longitude], {
          radius: Math.max(5, Math.min(16, area * 0.8)),
          fillColor: color, fillOpacity: 0.75,
          color: color, weight: 2, opacity: 0.9,
        }).addTo(map).bindPopup(popup);
        markers.set(h.track_id, m);
      }
    });
  }, [hazards]);

  useEffect(() => {
    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 200);
  });

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: fullpage ? 'calc(100vh - 220px)' : '380px', borderRadius: '0 0 10px 10px' }}
    />
  );
}
