const express = require('express');
const { State, District, Village, RiskZone, RiskPrediction } = require('../db/models');
const router = express.Router();

router.get('/states', async (req, res) => {
  res.json((await State.find()).map(s => s.toJSON()));
});

router.get('/districts', async (req, res) => {
  const { state_id } = req.query;
  const q = state_id ? { state_id } : {};
  res.json((await District.find(q)).map(d => d.toJSON()));
});

router.get('/villages', async (req, res) => {
  const { district_id } = req.query;
  const q = district_id ? { district_id } : {};
  res.json((await Village.find(q)).map(v => v.toJSON()));
});

router.get('/risk-zones', async (req, res) => {
  const { village_id } = req.query;
  const q = village_id ? { village_id } : {};
  const zones = await RiskZone.find(q);

  const enriched = await Promise.all(zones.map(async (z) => {
    const latest = await RiskPrediction.findOne({ risk_zone_id: z._id }).sort({ created_at: -1 })
      .select('risk_level final_score confidence created_at');
    const zj = z.toJSON();
    zj.latestRisk = latest ? {
      risk_level: latest.risk_level, final_score: latest.final_score,
      confidence: latest.confidence, created_at: latest.created_at
    } : null;
    return zj;
  }));
  res.json(enriched);
});

router.get('/risk-zones/:id', async (req, res) => {
  const zone = await RiskZone.findById(req.params.id);
  if (!zone) return res.status(404).json({ error: 'Risk zone not found' });
  const village = await Village.findById(zone.village_id);
  res.json({ ...zone.toJSON(), village: village ? village.toJSON() : null });
});

module.exports = router;
