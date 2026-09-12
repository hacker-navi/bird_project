const {
  RiskZone, WeatherData, SensorReading, SatelliteData, EarthquakeData,
  HistoricalEvent, CitizenReport, FieldReport, RiskPrediction
} = require('../db/models');

function levelFromScore(score) {
  if (score <= 25) return 'LOW';
  if (score <= 50) return 'MEDIUM';
  if (score <= 75) return 'HIGH';
  return 'CRITICAL';
}

function clamp(v, min = 0, max = 100) {
  return Math.max(min, Math.min(max, v));
}

// ---------- LAYER 1: STATIC SUSCEPTIBILITY ----------
async function computeStaticSusceptibility(zoneId) {
  const zone = await RiskZone.findById(zoneId);
  const histCount = await HistoricalEvent.countDocuments({ risk_zone_id: zoneId });

  const slopeScore = clamp((zone.slope_deg / 50) * 100);
  const historyScore = clamp(histCount * 20);
  const soilRisk = { 'Thin/Exposed': 90, 'Clayey': 70, 'Sandy-Loam': 45, 'Loamy': 25 }[zone.soil_type] ?? 40;
  const landCoverRisk = { 'Deforested Cut Slope': 90, 'Sparse Vegetation': 65, 'Mixed': 40, 'Cultivated': 25 }[zone.land_cover] ?? 40;

  const score = clamp(
    slopeScore * 0.35 +
    historyScore * 0.20 +
    soilRisk * 0.25 +
    landCoverRisk * 0.20
  );

  zone.static_susceptibility = score;
  await zone.save();

  return {
    score,
    components: {
      slope: { value: zone.slope_deg, contribution: slopeScore },
      historicalEvents: { value: histCount, contribution: historyScore },
      soilType: { value: zone.soil_type, contribution: soilRisk },
      landCover: { value: zone.land_cover, contribution: landCoverRisk }
    }
  };
}

// ---------- LAYER 2: DYNAMIC TRIGGER ANALYSIS ----------
async function computeDynamicTrigger(zoneId) {
  const weather = await WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const sensor = await SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const sat = await SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });
  const eq = await EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 });

  const rainfallScore = clamp((weather.rainfall_24h / 200) * 100);
  const soilMoistureScore = clamp(sensor.soil_moisture);
  const groundMovementScore = clamp((sensor.ground_movement_mm / 20) * 100);
  // Dynamic Satellite calculation with Sentinel-2 & InSAR change detection
  let satelliteScore = 0;
  let satellitePassConfirmed = false;
  let satelliteDetail = 'No change detected';
  let satelliteBoost = 0;

  if (sat) {
    if (sat.change_detected) {
      satellitePassConfirmed = true;
      satelliteBoost = sat.confidence_boost || 16;
      const vegLossScore = clamp((sat.vegetation_loss_pct || 0) * 1.2);
      const scarScore = clamp(((sat.scar_area_sqm || 0) / 20000) * 100);
      const insarScore = clamp(((sat.surface_displacement_cm || 0) / 30) * 100);
      satelliteScore = clamp(vegLossScore * 0.40 + scarScore * 0.35 + insarScore * 0.25);
      satelliteDetail = `Scar: ${(sat.scar_area_sqm || 0).toLocaleString()} m² | NDVI: -${sat.vegetation_loss_pct}% | InSAR: ${sat.surface_displacement_cm} cm`;
    } else {
      satelliteScore = clamp((sat.surface_change || 2) * 5 + (sat.wetness_index || 20) * 0.5);
      satelliteDetail = `Stable: NDVI ${(sat.ndvi_current || 0.74).toFixed(2)} | InSAR: ${sat.surface_displacement_cm || 0.4} cm`;
    }
  }

  const seismicScore = clamp((eq ? (eq.magnitude / 6) * 100 * (eq.distance_km < 50 ? 1 : 0.4) : 10));

  const score = clamp(
    rainfallScore * 0.30 +
    soilMoistureScore * 0.25 +
    groundMovementScore * 0.25 +
    satelliteScore * 0.10 +
    seismicScore * 0.10
  );

  return {
    score,
    components: {
      rainfall24h: { value: weather?.rainfall_24h ?? 0, unit: 'mm', contribution: rainfallScore, source: weather?.source ?? 'SIMULATOR', status: weather?.status ?? 'SIMULATED' },
      soilMoisture: { value: sensor?.soil_moisture ?? 0, unit: '%', contribution: soilMoistureScore, source: sensor?.source ?? 'SIMULATOR', status: sensor?.status ?? 'SIMULATED' },
      groundMovement: { value: sensor?.ground_movement_mm ?? 0, unit: 'mm', contribution: groundMovementScore, source: sensor?.source ?? 'SIMULATOR', status: sensor?.status ?? 'SIMULATED' },
      satelliteSurfaceChange: {
        value: sat?.surface_change ?? 0,
        contribution: satelliteScore,
        detail: satelliteDetail,
        source: sat?.source ?? 'SENTINEL_COPERNICUS',
        status: sat?.status ?? 'DEMO DATA',
        confirmed: satellitePassConfirmed,
        boost: satelliteBoost,
        satRecord: sat ? sat.toJSON() : null
      },
      seismicActivity: { value: eq?.magnitude ?? 0, unit: 'Mw', contribution: seismicScore, source: eq?.source ?? 'MODELLED', status: eq?.status ?? 'MODELLED' },
      satellitePassConfirmed,
      satelliteConfidenceBoost: satelliteBoost
    }
  };
}

// ---------- LAYER 3: REAL-WORLD EVIDENCE (with AI image scoring) ----------
async function computeEvidence(zoneId) {
  const reports = await CitizenReport.find({ risk_zone_id: zoneId, status: { $ne: 'REJECTED' } }).sort({ created_at: -1 }).limit(10);
  const fieldReports = await FieldReport.find({ risk_zone_id: zoneId }).sort({ created_at: -1 }).limit(5);

  let score = 0;
  const weightByType = {
    'Landslide': 40, 'Mud Movement': 30, 'Rock Fall': 30, 'Ground Crack': 25,
    'Road Crack': 15, 'Blocked Road': 20, 'Flooding': 15, 'Other Hazard': 10
  };

  let imageMatchCount = 0;
  let imageMatchMaxConf = 0;
  let hasGpsReport = false;

  for (const r of reports) {
    // Base type weight
    score += weightByType[r.incident_type] ?? 10;

    // AI image match boost: adds up to 30 pts per matched image
    if (r.image_analysis && r.image_analysis.match && !r.image_analysis.skipped) {
      const imgConf = r.image_analysis.confidence || 0;
      const imgBoost = Math.round((imgConf / 100) * 30); // 0–30 pts scaled by AI confidence
      score += imgBoost;
      imageMatchCount++;
      imageMatchMaxConf = Math.max(imageMatchMaxConf, imgConf);
    }

    // Text analysis boost: adds up to 10 pts
    if (r.text_analysis && r.text_analysis.severity_score) {
      score += Math.min(10, r.text_analysis.severity_score);
    }

    // GPS-verified report boost (real location = more credible)
    if (r.latitude && r.longitude) {
      score += 5;
      hasGpsReport = true;
    }
  }

  let agentImageConfirmed = false;
  for (const f of fieldReports) {
    if (f.verification_result === 'CONFIRMED') {
      score += 35;
      // Agent photo AI confirmation: adds up to 25 pts extra
      if (f.image_analysis && f.image_analysis.match && !f.image_analysis.skipped) {
        const agentImgBoost = Math.round((f.image_analysis.confidence / 100) * 25);
        score += agentImgBoost;
        agentImageConfirmed = true;
      }
    } else if (f.verification_result === 'PARTIAL') {
      score += 15;
    }
  }

  score = clamp(score);

  return {
    score,
    citizenReportCount: reports.length,
    fieldVerificationCount: fieldReports.filter(f => f.verification_result === 'CONFIRMED').length,
    imageMatchCount,
    imageMatchMaxConf,
    hasGpsReport,
    agentImageConfirmed,
    reports: reports.map(r => ({
      id: r._id.toString(), type: r.incident_type, status: r.status, created_at: r.created_at,
      has_image: !!r.photo_base64, image_match: r.image_analysis?.match, image_conf: r.image_analysis?.confidence,
      has_gps: !!(r.latitude && r.longitude)
    })),
    fieldReports: fieldReports.map(f => ({
      id: f._id.toString(), result: f.verification_result, notes: f.notes,
      agent_image_match: f.image_analysis?.match, agent_image_conf: f.image_analysis?.confidence
    }))
  };
}

// ---------- CONFIDENCE ENGINE (image-aware) ----------
function computeConfidence({ dynamic, evidence, staticLayer }) {
  let sourcesAvailable = 0;
  let freshnessPoints = 0;
  const totalSources = 5;

  if (dynamic.components.rainfall24h.value != null) { sourcesAvailable++; if (dynamic.components.rainfall24h.status === 'LIVE') freshnessPoints++; }
  if (dynamic.components.soilMoisture.value != null) { sourcesAvailable++; if (dynamic.components.soilMoisture.status === 'LIVE') freshnessPoints++; }
  if (dynamic.components.satelliteSurfaceChange.value != null) sourcesAvailable++;
  if (dynamic.components.seismicActivity.value != null) sourcesAvailable++;
  sourcesAvailable++; // static always available

  const dataAvailability = (sourcesAvailable / totalSources) * 100;
  const freshness = (freshnessPoints / 2) * 100;
  const independentAgreement = clamp(100 - Math.abs(staticLayer.score - dynamic.score) * 0.5);
  const evidenceBoost = evidence.citizenReportCount > 0 ? 15 : 0;
  const fieldVerificationBoost = evidence.fieldVerificationCount > 0 ? 20 : 0;

  // NEW: AI image evidence boosts confidence significantly
  const imageMatchBoost = evidence.imageMatchCount > 0
    ? Math.round((evidence.imageMatchMaxConf / 100) * 18) // up to +18 if AI very confident
    : 0;
  const gpsBoost = evidence.hasGpsReport ? 5 : 0;
  const agentPhotoBoost = evidence.agentImageConfirmed ? 12 : 0;
  
  // NEW: Satellite orbital verification boost (Sentinel-2 & InSAR confirmation)
  const satelliteBoost = dynamic.components.satellitePassConfirmed
    ? Math.round(dynamic.components.satelliteConfidenceBoost || 16)
    : 0;

  let confidence = (
    dataAvailability * 0.26 +
    freshness * 0.12 +
    independentAgreement * 0.22 +
    (evidence.score > 0 ? 60 : 30) * 0.14
  ) + evidenceBoost * 0.3 + fieldVerificationBoost * 0.4
    + imageMatchBoost + gpsBoost + agentPhotoBoost + satelliteBoost;

  confidence = clamp(confidence, 20, 99);
  return Math.round(confidence);
}

// ---------- FUSION: FINAL RISK ----------
async function calculateRisk(zoneId) {
  const staticLayer = await computeStaticSusceptibility(zoneId);
  const dynamic = await computeDynamicTrigger(zoneId);
  const evidence = await computeEvidence(zoneId);

  const finalScore = clamp(
    staticLayer.score * 0.35 +
    dynamic.score * 0.45 +
    evidence.score * 0.20
  );

  const level = levelFromScore(finalScore);
  const confidence = computeConfidence({ dynamic, evidence, staticLayer });

  const factorCandidates = [
    { name: 'Rainfall (24h)', contribution: dynamic.components.rainfall24h.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.rainfall24h.value} mm`, source: dynamic.components.rainfall24h.source, status: dynamic.components.rainfall24h.status },
    { name: 'Soil Moisture', contribution: dynamic.components.soilMoisture.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.soilMoisture.value}%`, source: dynamic.components.soilMoisture.source, status: dynamic.components.soilMoisture.status },
    { name: 'Ground Movement', contribution: dynamic.components.groundMovement.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.groundMovement.value} mm`, source: dynamic.components.groundMovement.source, status: dynamic.components.groundMovement.status },
    { name: 'Satellite Surface Change', contribution: dynamic.components.satelliteSurfaceChange.contribution, layer: 'DYNAMIC', detail: dynamic.components.satelliteSurfaceChange.detail || `index ${dynamic.components.satelliteSurfaceChange.value}`, source: dynamic.components.satelliteSurfaceChange.source, status: dynamic.components.satelliteSurfaceChange.status },
    { name: 'Seismic Activity', contribution: dynamic.components.seismicActivity.contribution, layer: 'DYNAMIC', detail: `${dynamic.components.seismicActivity.value} Mw`, source: dynamic.components.seismicActivity.source, status: dynamic.components.seismicActivity.status },
    { name: 'Slope', contribution: staticLayer.components.slope.contribution, layer: 'STATIC', detail: `${staticLayer.components.slope.value}°`, source: 'GIS/DEM', status: 'STATIC' },
    { name: 'Historical Landslides', contribution: staticLayer.components.historicalEvents.contribution, layer: 'STATIC', detail: `${staticLayer.components.historicalEvents.value} recorded events`, source: 'DISTRICT_RECORD', status: 'STATIC' },
    { name: 'Soil & Land Cover', contribution: (staticLayer.components.soilType.contribution + staticLayer.components.landCover.contribution) / 2, layer: 'STATIC', detail: `${staticLayer.components.soilType.value} / ${staticLayer.components.landCover.value}`, source: 'GSI', status: 'STATIC' },
    { name: 'Citizen Reports', contribution: evidence.citizenReportCount > 0 ? clamp(evidence.citizenReportCount * 20) : 0, layer: 'EVIDENCE', detail: `${evidence.citizenReportCount} report(s)`, source: 'CITIZEN', status: evidence.citizenReportCount > 0 ? 'LIVE' : 'NONE' },
    { name: 'Field Verification', contribution: evidence.fieldVerificationCount > 0 ? 90 : 0, layer: 'EVIDENCE', detail: `${evidence.fieldVerificationCount} confirmed`, source: 'FIELD_AGENT', status: evidence.fieldVerificationCount > 0 ? 'VERIFIED' : 'NONE' }
  ];

  const primaryFactors = factorCandidates
    .filter(f => f.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5)
    .map(f => ({ ...f, level: f.contribution >= 70 ? 'HIGH' : f.contribution >= 40 ? 'MEDIUM' : 'LOW' }));

  const prediction = await RiskPrediction.create({
    risk_zone_id: zoneId,
    static_score: staticLayer.score,
    dynamic_score: dynamic.score,
    evidence_score: evidence.score,
    final_score: finalScore,
    risk_level: level,
    confidence,
    factors: primaryFactors,
    evidence_summary: evidence
  });

  return {
    id: prediction._id.toString(),
    risk_zone_id: zoneId.toString(),
    riskZoneId: zoneId.toString(),
    staticScore: Math.round(staticLayer.score),
    dynamicScore: Math.round(dynamic.score),
    evidenceScore: Math.round(evidence.score),
    finalScore: Math.round(finalScore),
    riskLevel: level,
    confidence,
    primaryFactors,
    evidence,
    dataStatus: {
      weather: dynamic.components.rainfall24h.status,
      sensors: dynamic.components.soilMoisture.status,
      satellite: dynamic.components.satelliteSurfaceChange.status,
      seismic: dynamic.components.seismicActivity.status
    },
    createdAt: prediction.created_at
  };
}

async function getLatestPrediction(zoneId) {
  const p = await RiskPrediction.findOne({ risk_zone_id: zoneId }).sort({ created_at: -1 });
  if (!p) return null;
  const pj = p.toJSON();
  pj.factors = pj.factors || [];
  pj.evidence = pj.evidence_summary || {};
  return pj;
}

module.exports = { calculateRisk, getLatestPrediction, levelFromScore };
