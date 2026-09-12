const express = require('express');
const { recordSatellitePass, processManualSatellitePass, getZoneSatelliteProfile, SATELLITE_SCENARIOS } = require('../services/satelliteService');
const { runPipeline, audit } = require('../services/pipeline');
const router = express.Router();

// Get satellite profile for a risk zone
router.get('/satellite/zones/:zoneId', async (req, res) => {
  try {
    const profile = await getZoneSatelliteProfile(req.params.zoneId);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger dynamic bi-temporal satellite change analysis
router.post('/satellite/analyze', async (req, res) => {
  const { risk_zone_id, scenario_type = 'CATASTROPHIC_SLIDE', custom_notes } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id is required' });

  try {
    const satRecord = await recordSatellitePass(risk_zone_id, scenario_type, custom_notes);

    await audit('SATELLITE_PASS_ANALYZED', 'satellite_data', {
      risk_zone_id, scenario_type,
      scar_area_sqm: satRecord.scar_area_sqm,
      vegetation_loss_pct: satRecord.vegetation_loss_pct,
      surface_displacement_cm: satRecord.surface_displacement_cm,
      change_detected: satRecord.change_detected
    });

    // Run pipeline to factor satellite change into risk score and boost confidence
    const pipeline = await runPipeline(risk_zone_id, {
      triggeredBy: 'SATELLITE_ORBITAL_PASS',
      reason: `Sentinel-2 & InSAR pass: ${satRecord.change_detected ? `Debris scar ${(satRecord.scar_area_sqm || 0).toLocaleString()} m² (-${satRecord.vegetation_loss_pct}% NDVI)` : 'Baseline stable'}`
    });

    res.json({
      satellite: satRecord,
      pipeline
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process custom manual satellite imagery (before & after) with AI analysis
router.post('/satellite/analyze-custom', async (req, res) => {
  const {
    risk_zone_id,
    before_image_base64,
    after_image_base64,
    before_image_url,
    after_image_url,
    custom_notes,
    client_metrics
  } = req.body;

  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id is required' });

  try {
    const satRecord = await processManualSatellitePass({
      zoneId: risk_zone_id,
      beforeImageBase64: before_image_base64,
      afterImageBase64: after_image_base64,
      beforeImageUrl: before_image_url,
      afterImageUrl: after_image_url,
      customNotes: custom_notes,
      clientMetrics: client_metrics
    });

    await audit('MANUAL_SATELLITE_ANALYZED', 'satellite_data', {
      risk_zone_id,
      scar_area_sqm: satRecord.scar_area_sqm,
      vegetation_loss_pct: satRecord.vegetation_loss_pct,
      surface_displacement_cm: satRecord.surface_displacement_cm,
      change_detected: satRecord.change_detected,
      custom_uploaded: true
    });

    const pipeline = await runPipeline(risk_zone_id, {
      triggeredBy: 'MANUAL_SATELLITE_ANALYSIS',
      reason: `Manual Sentinel pass analyzed: ${satRecord.change_detected ? `Debris scar ${(satRecord.scar_area_sqm || 0).toLocaleString()} m² (-${satRecord.vegetation_loss_pct}% NDVI)` : 'Baseline stable'}`
    });

    res.json({
      satellite: satRecord,
      pipeline
    });
  } catch (err) {
    console.error('[SatelliteRoute] Error analyzing custom satellite imagery:', err);
    res.status(500).json({ error: err.message });
  }
});

// List available satellite scenarios
router.get('/satellite/scenarios', (req, res) => {
  res.json(SATELLITE_SCENARIOS);
});

module.exports = router;
