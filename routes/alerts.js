const express = require('express');
const { Alert, RiskZone, Village } = require('../db/models');
const router = express.Router();

router.get('/alerts', async (req, res) => {
  const { risk_zone_id, status } = req.query;
  const q = {};
  if (risk_zone_id) q.risk_zone_id = risk_zone_id;
  if (status) q.status = status;

  const rows = await Alert.find(q).sort({ created_at: -1 }).limit(100);
  const zoneIds = [...new Set(rows.map(r => r.risk_zone_id.toString()))];
  const zones = await RiskZone.find({ _id: { $in: zoneIds } });
  const zoneMap = Object.fromEntries(zones.map(z => [z._id.toString(), z]));
  const villageIds = [...new Set(zones.map(z => z.village_id.toString()))];
  const villages = await Village.find({ _id: { $in: villageIds } });
  const villageMap = Object.fromEntries(villages.map(v => [v._id.toString(), v]));

  res.json(rows.map(r => {
    const z = zoneMap[r.risk_zone_id.toString()];
    const v = z ? villageMap[z.village_id.toString()] : null;
    return { ...r.toJSON(), zone_name: z?.name, zone_code: z?.code, village_name: v?.name };
  }));
});

router.post('/alerts', async (req, res) => {
  const { risk_zone_id, level, title, description, recommended_action } = req.body;
  if (!risk_zone_id || !level || !title) return res.status(400).json({ error: 'risk_zone_id, level, title required' });
  const alert = await Alert.create({ risk_zone_id, level, title, description: description || '', recommended_action: recommended_action || '', status: 'ACTIVE' });
  res.status(201).json(alert.toJSON());
});

router.patch('/alerts/:id', async (req, res) => {
  const { status } = req.body;
  const valid = ['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'EXPIRED'];
  if (!valid.includes(status)) return res.status(400).json({ error: `status must be one of ${valid.join(', ')}` });
  const alert = await Alert.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json(alert.toJSON());
});

module.exports = router;
