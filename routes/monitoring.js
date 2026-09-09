const express = require('express');
const { RiskZone, MonitoringNode, WeatherData, SensorReading, SatelliteData, EarthquakeData, HistoricalEvent } = require('../db/models');
const router = express.Router();

router.get('/monitoring-nodes', async (req, res) => {
  const { risk_zone_id } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  res.json((await MonitoringNode.find(q)).map(n => n.toJSON()));
});

router.get('/monitoring-nodes/:id', async (req, res) => {
  const node = await MonitoringNode.findById(req.params.id);
  if (!node) return res.status(404).json({ error: 'Node not found' });
  const zoneId = node.risk_zone_id;
  const [weather, sensor, satellite, earthquake] = await Promise.all([
    WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 })
  ]);
  res.json({
    node: node.toJSON(),
    weather: weather ? weather.toJSON() : null,
    sensor: sensor ? sensor.toJSON() : null,
    satellite: satellite ? satellite.toJSON() : null,
    earthquake: earthquake ? earthquake.toJSON() : null
  });
});

// Full "digital environmental profile" for a zone
router.get('/risk-zones/:id/profile', async (req, res) => {
  const zoneId = req.params.id;
  const zone = await RiskZone.findById(zoneId);
  if (!zone) return res.status(404).json({ error: 'Zone not found' });

  const [node, weather, sensor, satellite, earthquake, historicalEvents] = await Promise.all([
    MonitoringNode.findOne({ risk_zone_id: zoneId }),
    WeatherData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SensorReading.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    SatelliteData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    EarthquakeData.findOne({ risk_zone_id: zoneId }).sort({ timestamp: -1 }),
    HistoricalEvent.find({ risk_zone_id: zoneId })
  ]);

  res.json({
    zone: zone.toJSON(),
    node: node ? node.toJSON() : null,
    weather: weather ? weather.toJSON() : null,
    sensor: sensor ? sensor.toJSON() : null,
    satellite: satellite ? satellite.toJSON() : null,
    earthquake: earthquake ? earthquake.toJSON() : null,
    historicalEvents: historicalEvents.map(h => h.toJSON())
  });
});

module.exports = router;
