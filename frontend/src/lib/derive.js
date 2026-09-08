// export function computeSessionRisk(hazards = [], summary = {}) {
//   // If backend provided a direct risk score, use it directly (0-100)
//   if (summary.risk_score !== undefined) {
//     const rawScore = Number(summary.risk_score);
//     const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));
//     const riskLevel = summary.overall_risk || summary.risk_level || 
//                       (riskScore > 75 ? 'CRITICAL' : riskScore > 50 ? 'HIGH' : riskScore > 25 ? 'MODERATE' : 'LOW');
//     return { riskScore, riskLevel };
//   }

//   // Otherwise, compute it on the frontend based on the actual hazards
//   if (hazards.length === 0) {
//     return { riskScore: 0, riskLevel: 'LOW' };
//   }

//   // Calculate based on severity breakdown
//   let critical = 0, high = 0, moderate = 0, low = 0;
  
//   hazards.forEach(h => {
//     const sev = (h.severity || '').toUpperCase();
//     if (sev === 'CRITICAL') critical++;
//     else if (sev === 'HIGH') high++;
//     else if (sev === 'MODERATE') moderate++;
//     else low++; // Treat empty or unknown as low for fallback
//   });

//   // Simple weighted score
//   const total = hazards.length;
//   // Weights: CRITICAL=100, HIGH=75, MODERATE=40, LOW=10
//   const weightedSum = (critical * 100) + (high * 75) + (moderate * 40) + (low * 10);
//   const rawScore = Math.round(weightedSum / total);
  
//   const riskScore = Math.min(100, Math.max(0, rawScore));
  
//   const riskLevel = critical > 0 || riskScore > 75 ? 'CRITICAL' 
//                   : high > 0 || riskScore > 50 ? 'HIGH' 
//                   : moderate > 0 || riskScore > 25 ? 'MODERATE' 
//                   : 'LOW';

//   return { riskScore, riskLevel };
// }
/**
 * Session risk comes from the backend, which computes it from published,
 * documented weights (see docs/SEVERITY.md). The frontend formats; it does
 * not score. A second scoring implementation here would silently disagree
 * with the one in the mission record.
 */
export function computeSessionRisk(hazards = [], summary = {}) {
  const score = summary.session_risk_score;
  const band = summary.session_risk_band;

  if (score !== undefined && score !== null) {
    return {
      riskScore: Math.min(100, Math.max(0, Math.round(Number(score)))),
      riskLevel: band || 'LOW',
    };
  }

  // No session summary yet — derive the band from the highest-priority
  // hazard the backend has already scored. Still backend numbers.
  if (!hazards.length) return { riskScore: 0, riskLevel: 'LOW' };

  const top = hazards.reduce(
    (a, h) => ((h.priority_score ?? 0) > (a.priority_score ?? 0) ? h : a),
    hazards[0]
  );
  return {
    riskScore: Math.round(top.priority_score ?? 0),
    riskLevel: top.severity_band ?? 'LOW',
  };
}

/**
 * Formats hazard footprint area in square metres (m²).
 * Automatically converts raw pixel area (px²) using photogrammetric GSD when m² is not present.
 */
export function formatAreaM2(hazardOrArea, areaPx = null) {
  let m2 = null;
  let px = null;

  if (hazardOrArea != null && typeof hazardOrArea === 'object') {
    m2 = hazardOrArea.area_m2 ?? hazardOrArea.surface_area_m2;
    px = hazardOrArea.area_px;
    if (m2 == null && (hazardOrArea.estimated_volume_m3 != null || hazardOrArea.volumetric_m3 != null)) {
      const vol = Number(hazardOrArea.estimated_volume_m3 ?? hazardOrArea.volumetric_m3);
      m2 = vol / 0.05;
    }
  } else if (typeof hazardOrArea === 'number') {
    m2 = hazardOrArea;
    px = areaPx;
  } else {
    px = areaPx;
  }

  if (m2 != null && !isNaN(Number(m2)) && Number(m2) > 0) {
    return `${Number(m2).toFixed(1)} m²`;
  }

  if (px != null && !isNaN(Number(px)) && Number(px) > 0) {
    // Photogrammetric GSD conversion: ~0.00773 m/px -> area_px * (0.00773)^2 ≈ area_px * 0.00006
    const converted = Number(px) * 0.00006;
    return `${converted.toFixed(1)} m²`;
  }

  return '—';
}

/**
 * Calculates numeric area in m² from either m² or px².
 */
export function getNumericAreaM2(hazardOrArea, areaPx = null) {
  let m2 = null;
  let px = null;

  if (hazardOrArea != null && typeof hazardOrArea === 'object') {
    m2 = hazardOrArea.area_m2 ?? hazardOrArea.surface_area_m2;
    px = hazardOrArea.area_px;
    if (m2 == null && (hazardOrArea.estimated_volume_m3 != null || hazardOrArea.volumetric_m3 != null)) {
      const vol = Number(hazardOrArea.estimated_volume_m3 ?? hazardOrArea.volumetric_m3);
      m2 = vol / 0.05;
    }
  } else if (typeof hazardOrArea === 'number') {
    m2 = hazardOrArea;
    px = areaPx;
  } else {
    px = areaPx;
  }

  if (m2 != null && !isNaN(Number(m2))) {
    return Number(m2);
  }
  if (px != null && !isNaN(Number(px))) {
    return Number(px) * 0.00006;
  }
  return 0;
}