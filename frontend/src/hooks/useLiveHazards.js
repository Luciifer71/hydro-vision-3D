import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useLiveHazards() {
  const [hazards, setHazards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial Fetch of All PostGIS Hazards
    async function fetchHazards() {
      const { data, error } = await supabase
        .from('hazards')
        .select('*')
        .order('last_detected', { ascending: false });

      if (error) {
        console.error('Error fetching hazards:', error);
      } else {
        setHazards(data || []);
      }
      setLoading(false);
    }

    fetchHazards();

    // 2. Realtime WebSocket Subscription
    const channel = supabase
      .channel('realtime-hazards')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hazards' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setHazards((prev) => [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setHazards((prev) =>
              prev.map((item) => (item.hazard_id === payload.new.hazard_id ? payload.new : item))
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 3. Derived Realtime Metrics for GCS UI Counters
  const totalMarkers = hazards.length;
  const totalVolume = hazards.reduce((acc, curr) => acc + (curr.estimated_volume_m3 || 0), 0);
  
  // Calculate risk breakdown categories
  const riskBreakdown = {
    low: hazards.filter((h) => h.estimated_volume_m3 < 0.05).length,
    moderate: hazards.filter((h) => h.estimated_volume_m3 >= 0.05 && h.estimated_volume_m3 < 0.15).length,
    high: hazards.filter((h) => h.estimated_volume_m3 >= 0.15 && h.estimated_volume_m3 < 0.3).length,
    critical: hazards.filter((h) => h.estimated_volume_m3 >= 0.3).length,
  };

  // Convert DB rows into GeoJSON FeatureCollection format for Mapbox/Leaflet
  const geojson = {
    type: 'FeatureCollection',
    features: hazards.map((h) => ({
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
        detections_count: h.detections_count,
        last_detected: h.last_detected,
      },
    })),
  };

  return { hazards, totalMarkers, totalVolume, riskBreakdown, geojson, loading };
}