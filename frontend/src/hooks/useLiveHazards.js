import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase.js';

export function useLiveHazards() {
  const [hazards, setHazards] = useState([]); // Cumulative history for maps & tables
  const [activeFrameHazards, setActiveFrameHazards] = useState([]); // Live frame data for immediate alerts
  const [loading, setLoading] = useState(true);
  const [wsStatus, setWsStatus] = useState('connecting'); // 'connecting', 'online', 'offline'
  
  // Use a Map to deduplicate hazards and manage memory efficiently
  const hazardsMapRef = useRef(new Map());

  useEffect(() => {
    // ------------------------------------------------------------------
    // 1. INITIAL LOAD (Supabase Historical Data)
    // ------------------------------------------------------------------
    async function fetchHistoricalHazards() {
      try {
        const { data, error } = await supabase
          .from('hazards')
          .select('*')
          .order('last_detected', { ascending: false })
          .limit(100); // Limit initial load to prevent UI lag

        if (error) throw error;
        
        if (data) {
          const currentMap = hazardsMapRef.current;
          data.forEach(item => currentMap.set(item.hazard_id, item));
          setHazards(Array.from(currentMap.values()));
        }
      } catch (error) {
        console.error('[DB Error] Failed to fetch historical hazards:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchHistoricalHazards();

    // ------------------------------------------------------------------
    // 2. ZERO-LATENCY LIVE STREAMING (FastAPI WebSocket)
    // ------------------------------------------------------------------
    let ws = null;
    let reconnectTimeout = null;

    const connectWebSocket = () => {
      ws = new WebSocket('ws://localhost:8000/api/ws/telemetry');

      ws.onopen = () => {
        console.log('[Telemetry] Connected to Live AI Pipeline');
        setWsStatus('online');
      };

      ws.onmessage = (event) => {
        try {
          const rawData = JSON.parse(event.data);
          
          // Map backend dictionary keys to frontend UI expectations
          const normalizedData = rawData.map(item => ({
            hazard_id: item.id,
            class_name: item.hazard,
            confidence: item.confidence,
            estimated_volume_m3: item.volume_m3,
            latitude: item.latitude,
            longitude: item.longitude,
            last_detected: item.timestamp,
            bbox: item.bbox
          }));

          // Set active hazards for things that need to flash on screen right now
          setActiveFrameHazards(normalizedData);

          if (normalizedData.length > 0) {
            const currentMap = hazardsMapRef.current;
            
            // Add new detections
            normalizedData.forEach(item => currentMap.set(item.hazard_id, item));

            // Convert to array, sort by newest
            let allHazards = Array.from(currentMap.values())
              .sort((a, b) => new Date(b.last_detected) - new Date(a.last_detected));

            // MEMORY PROTECTION: Keep only the latest 300 logs so the browser doesn't crash
            if (allHazards.length > 300) {
              const toRemove = allHazards.slice(300);
              toRemove.forEach(h => currentMap.delete(h.hazard_id));
              allHazards = allHazards.slice(0, 300);
            }

            // Trigger UI update
            setHazards(allHazards);
          }
        } catch (err) {
          console.error('[WS Parse Error] Failed to read telemetry packet:', err);
        }
      };

      ws.onclose = () => {
        console.warn('[Telemetry] Connection lost. Attempting reconnect...');
        setWsStatus('offline');
        // Auto-reconnect every 3 seconds if the backend restarts
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS Error] Network issue with FastAPI:', err);
        ws.close(); // Force close to trigger the reconnect loop
      };
    };

    // Start WebSocket
    connectWebSocket();

    // Cleanup on component unmount
    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) ws.close();
    };
  }, []);

  // ------------------------------------------------------------------
  // 3. DERIVED REALTIME METRICS (For GCS UI Counters & Charts)
  // ------------------------------------------------------------------
  const totalMarkers = hazards.length;
  // Safely sum volumes, handling potential nulls or undefined values
  const totalVolume = hazards.reduce((acc, curr) => acc + (curr.estimated_volume_m3 || 0), 0);
  
  // Calculate risk breakdown categories for charts
  const riskBreakdown = {
    low: hazards.filter((h) => h.estimated_volume_m3 < 0.05).length,
    moderate: hazards.filter((h) => h.estimated_volume_m3 >= 0.05 && h.estimated_volume_m3 < 0.15).length,
    high: hazards.filter((h) => h.estimated_volume_m3 >= 0.15 && h.estimated_volume_m3 < 0.3).length,
    critical: hazards.filter((h) => h.estimated_volume_m3 >= 0.3).length,
  };

  // Convert DB rows into GeoJSON FeatureCollection format for Mapbox/Leaflet
  const geojson = {
    type: 'FeatureCollection',
    features: hazards
      // Ensure we only map items that actually have valid GPS coordinates to prevent Map crashes
      .filter(h => h.longitude != null && h.latitude != null) 
      .map((h) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [h.longitude, h.latitude],
        },
        properties: {
          hazard_id: h.hazard_id,
          class_name: h.class_name,
          confidence: h.confidence,
          volume_m3: h.estimated_volume_m3,
          last_detected: h.last_detected,
        },
      })),
  };

  return { 
    hazards,             // Array of historical/accumulated logs
    activeFrameHazards,  // Array of what is strictly on-screen this exact millisecond
    totalMarkers, 
    totalVolume: totalVolume.toFixed(2), // Clean formatting for the UI
    riskBreakdown, 
    geojson, 
    loading,
    wsStatus             // Use this to change the "LIVE" green dot indicator in your UI Header!
  };
}