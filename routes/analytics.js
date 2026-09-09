const express = require('express');
const { RiskZone, RiskPrediction, WeatherData, Alert, CitizenReport, AgentAssignment, AuditLog, DataSource, User } = require('../db/models');
const router = express.Router();

router.get('/analytics/summary', async (req, res) => {
  const zones = await RiskZone.find().select('_id');
  let low = 0, medium = 0, high = 0, critical = 0;

  await Promise.all(zones.map(async (z) => {
    const latest = await RiskPrediction.findOne({ risk_zone_id: z._id }).sort({ created_at: -1 }).select('risk_level');
    const level = latest?.risk_level || 'LOW';
    if (level === 'LOW') low++; else if (level === 'MEDIUM') medium++; else if (level === 'HIGH') high++; else critical++;
  }));

  const [activeAlerts, pendingReports, activeOperations] = await Promise.all([
    Alert.countDocuments({ status: 'ACTIVE' }),
    CitizenReport.countDocuments({ status: { $in: ['NEW', 'UNDER REVIEW'] } }),
    AgentAssignment.countDocuments({ status: { $ne: 'COMPLETED' } })
  ]);

  res.json({ totalZones: zones.length, low, medium, high, critical, activeAlerts, pendingReports, activeOperations });
});

router.get('/analytics/risk-trend', async (req, res) => {
  const { risk_zone_id, limit = 50 } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await RiskPrediction.find(q).sort({ created_at: 1 }).limit(Number(limit))
    .select('final_score risk_level confidence created_at risk_zone_id');
  res.json(rows.map(r => r.toJSON()));
});

router.get('/analytics/rainfall-trend', async (req, res) => {
  const { risk_zone_id, limit = 50 } = req.query;
  const q = risk_zone_id ? { risk_zone_id } : {};
  const rows = await WeatherData.find(q).sort({ timestamp: 1 }).limit(Number(limit)).select('rainfall_24h timestamp risk_zone_id');
  res.json(rows.map(r => r.toJSON()));
});

router.get('/audit-logs', async (req, res) => {
  const rows = await AuditLog.find().sort({ created_at: -1 }).limit(200);
  res.json(rows.map(r => r.toJSON()));
});

router.get('/data-sources', async (req, res) => {
  res.json((await DataSource.find()).map(d => d.toJSON()));
});

router.get('/users', async (req, res) => {
  const rows = await User.find().select('name email role phone status agent_status created_at');
  res.json(rows.map(r => r.toJSON()));
});

module.exports = router;
