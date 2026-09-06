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

/** Severity counts for charts. Reads severity_band, the actual schema field. */
export function severityCounts(hazards = []) {
  const counts = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
  hazards.forEach((h) => {
    const s = (h.severity_band || '').toUpperCase();
    if (counts[s] !== undefined) counts[s]++;
  });
  return counts;
}