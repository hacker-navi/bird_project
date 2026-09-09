const express = require('express');
const { MonitoringNode, WeatherData, SensorReading, SatelliteData, EarthquakeData, CitizenReport, FieldReport, User } = require('../db/models');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

async function getNode(zoneId) {
  return MonitoringNode.findOne({ risk_zone_id: zoneId });
}

// ---- Rainfall slider ----
router.post('/simulation/rainfall', async (req, res) => {
  const { risk_zone_id, rainfall_24h } = req.body;
  if (!risk_zone_id || rainfall_24h == null) return res.status(400).json({ error: 'risk_zone_id and rainfall_24h required' });

  const trend = rainfall_24h > 100 ? 'RISING' : rainfall_24h > 40 ? 'STABLE' : 'FALLING';
  const intensity = rainfall_24h > 120 ? 'HIGH' : rainfall_24h > 50 ? 'MEDIUM' : 'LOW';

  await WeatherData.create({
    risk_zone_id, rainfall_1h: Math.round(rainfall_24h / 8), rainfall_6h: Math.round(rainfall_24h / 3),
    rainfall_24h, rainfall_72h: rainfall_24h * 1.8, rainfall_intensity: intensity, rainfall_trend: trend,
    temperature: 21, humidity: 85, source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Rainfall set to ${rainfall_24h} mm (24h)` });
  res.json(result);
});

// ---- Soil moisture slider ----
router.post('/simulation/soil-moisture', async (req, res) => {
  const { risk_zone_id, soil_moisture } = req.body;
  if (!risk_zone_id || soil_moisture == null) return res.status(400).json({ error: 'risk_zone_id and soil_moisture required' });

  const node = await getNode(risk_zone_id);
  const prev = await SensorReading.findOne({ risk_zone_id }).sort({ timestamp: -1 });

  await SensorReading.create({
    monitoring_node_id: node?._id, risk_zone_id, soil_moisture,
    ground_movement_mm: prev?.ground_movement_mm ?? 0.5, tilt_deg: prev?.tilt_deg ?? 0.2,
    vibration: prev?.vibration ?? 0.1, source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Soil moisture set to ${soil_moisture}%` });
  res.json(result);
});

// ---- Ground movement slider ----
router.post('/simulation/ground-movement', async (req, res) => {
  const { risk_zone_id, ground_movement_mm } = req.body;
  if (!risk_zone_id || ground_movement_mm == null) return res.status(400).json({ error: 'risk_zone_id and ground_movement_mm required' });

  const node = await getNode(risk_zone_id);
  const prev = await SensorReading.findOne({ risk_zone_id }).sort({ timestamp: -1 });

  await SensorReading.create({
    monitoring_node_id: node?._id, risk_zone_id, soil_moisture: prev?.soil_moisture ?? 35,
    ground_movement_mm, tilt_deg: prev?.tilt_deg ?? 0.2, vibration: ground_movement_mm > 5 ? 2.5 : 0.1,
    source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Ground movement set to ${ground_movement_mm} mm` });
  res.json(result);
});

// ---- Satellite change toggle ----
router.post('/simulation/satellite-change', async (req, res) => {
  const { risk_zone_id, enabled } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const surfaceChange = enabled ? 18 : 3;
  const vegChange = enabled ? 15 : 2;
  const wetness = enabled ? 55 : 20;

  await SatelliteData.create({
    risk_zone_id, vegetation_change: vegChange, surface_change: surfaceChange, wetness_index: wetness,
    land_disturbance: enabled ? 12 : 4, source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Satellite surface change ${enabled ? 'detected' : 'cleared'}` });
  res.json(result);
});

// ---- Seismic activity ----
router.post('/simulation/seismic', async (req, res) => {
  const { risk_zone_id, magnitude, distance_km } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  await EarthquakeData.create({
    risk_zone_id, magnitude: magnitude ?? 2, distance_km: distance_km ?? 80, depth_km: 15,
    recent_seismic_activity: (magnitude ?? 2) > 4 ? 'ELEVATED' : 'LOW', source: 'SIMULATOR', status: 'SIMULATED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Seismic event simulated: M${magnitude ?? 2}` });
  res.json(result);
});

// ---- Citizen report (simulator shortcut) ----
router.post('/simulation/citizen-report', async (req, res) => {
  const { risk_zone_id, incident_type = 'Road Crack', description = 'Simulated citizen report for demo' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const { RiskZone } = require('../db/models');
  const zone = await RiskZone.findById(risk_zone_id);
  const citizen = await User.findOne({ role: 'CITIZEN' });

  const report = await CitizenReport.create({
    risk_zone_id, user_id: citizen?._id ?? null, incident_type, description,
    latitude: zone.latitude, longitude: zone.longitude, photo_note: '[demo photo attached]', status: 'NEW', sync_status: 'SYNCED'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Citizen report: ${incident_type}` });
  res.json({ reportId: report._id.toString(), pipeline: result });
});

// ---- Field verification (simulator shortcut) ----
router.post('/simulation/field-verification', async (req, res) => {
  const { risk_zone_id, result: verificationResult = 'CONFIRMED', notes = 'Field verification confirmed via demo panel' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const agent = await User.findOne({ role: 'FIELD_AGENT' });
  const fieldReport = await FieldReport.create({
    risk_zone_id, agent_id: agent?._id ?? null, notes, verification_result: verificationResult, photo_note: '[demo field photo]'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: `Field verification: ${verificationResult}` });
  res.json({ fieldReportId: fieldReport._id.toString(), pipeline: result });
});

// ---- Reset a zone back to calm baseline ----
router.post('/simulation/reset', async (req, res) => {
  const { risk_zone_id } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const node = await getNode(risk_zone_id);
  await WeatherData.create({ risk_zone_id, rainfall_1h: 2, rainfall_6h: 8, rainfall_24h: 40, rainfall_72h: 90, rainfall_intensity: 'LOW', rainfall_trend: 'STABLE', temperature: 22, humidity: 75, source: 'SIMULATOR', status: 'SIMULATED' });
  await SensorReading.create({ monitoring_node_id: node?._id, risk_zone_id, soil_moisture: 35, ground_movement_mm: 0.5, tilt_deg: 0.2, vibration: 0.1, source: 'SIMULATOR', status: 'SIMULATED' });
  await SatelliteData.create({ risk_zone_id, vegetation_change: 2, surface_change: 3, wetness_index: 20, land_disturbance: 5, source: 'SIMULATOR', status: 'SIMULATED' });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'SENSOR_OPERATOR', reason: 'Reset to baseline' });
  res.json(result);
});

module.exports = router;
