const express = require('express');
const { WeatherData } = require('../db/models');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

router.get('/weather', async (req, res) => {
  const { risk_zone_id } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await WeatherData.find(q).sort({ timestamp: -1 }).limit(risk_zone_id ? 20 : 50);
  res.json(rows.map(r => r.toJSON()));
});

// Real-world weather API ingestion endpoint (production extensibility)
router.post('/weather/ingest', async (req, res) => {
  const { risk_zone_id, rainfall_1h, rainfall_6h, rainfall_24h, rainfall_72h, temperature, humidity, source = 'WEATHER_API' } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });

  const trend = rainfall_24h > 100 ? 'RISING' : rainfall_24h > 40 ? 'STABLE' : 'FALLING';
  const intensity = rainfall_1h > 30 ? 'HIGH' : rainfall_1h > 10 ? 'MEDIUM' : 'LOW';

  await WeatherData.create({
    risk_zone_id, rainfall_1h, rainfall_6h, rainfall_24h, rainfall_72h,
    rainfall_intensity: intensity, rainfall_trend: trend, temperature, humidity, source, status: 'LIVE'
  });

  const result = await runPipeline(risk_zone_id, { triggeredBy: 'WEATHER_INGEST', reason: 'New weather data ingested' });
  res.json({ ingested: true, pipeline: result });
});

module.exports = router;
