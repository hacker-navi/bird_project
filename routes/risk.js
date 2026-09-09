const express = require('express');
const { RiskPrediction, ImpactAssessment } = require('../db/models');
const { getLatestPrediction } = require('../services/riskEngine');
const { runPipeline } = require('../services/pipeline');
const router = express.Router();

router.get('/risk-predictions', async (req, res) => {
  const preds = await RiskPrediction.find().sort({ created_at: -1 }).limit(100);
  res.json(preds.map(p => p.toJSON()));
});

router.get('/risk-zones/:id/risk', async (req, res) => {
  const latest = await getLatestPrediction(req.params.id);
  if (!latest) return res.status(404).json({ error: 'No prediction yet for this zone' });
  res.json(latest);
});

router.get('/risk-zones/:id/impact', async (req, res) => {
  const impact = await ImpactAssessment.findOne({ risk_zone_id: req.params.id }).sort({ created_at: -1 });
  if (!impact) return res.status(404).json({ error: 'No impact assessment yet' });
  res.json(impact.toJSON());
});

router.get('/impact-assessments', async (req, res) => {
  const rows = await ImpactAssessment.find().sort({ created_at: -1 }).limit(100);
  res.json(rows.map(r => r.toJSON()));
});

router.post('/risk/calculate', async (req, res) => {
  const { risk_zone_id } = req.body;
  if (!risk_zone_id) return res.status(400).json({ error: 'risk_zone_id required' });
  const result = await runPipeline(risk_zone_id, { triggeredBy: 'MANUAL_API', reason: 'Manual recalculation requested' });
  res.json(result);
});

module.exports = router;
