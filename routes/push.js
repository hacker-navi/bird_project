const express = require('express');
const { getPublicKey, saveSubscription, removeSubscription, sendAlertPush } = require('../services/pushService');
const { User } = require('../db/models');
const router = express.Router();

router.get('/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: getPublicKey() });
});

// Body: { subscription: PushSubscriptionJSON, userId?, deviceLabel, appRole, watchZoneId? }
router.post('/push/subscribe', async (req, res) => {
  const { subscription, userId, deviceLabel, appRole, watchZoneId } = req.body;
  if (!subscription || !subscription.endpoint || !appRole) {
    return res.status(400).json({ error: 'subscription and appRole are required' });
  }
  const saved = await saveSubscription({ subscription, userId, deviceLabel, appRole, watchZoneId });
  res.status(201).json(saved);
});

router.post('/push/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint required' });
  await removeSubscription(endpoint);
  res.json({ ok: true });
});

// Manual test button in the UI hits this to prove push actually reaches the device
router.post('/push/test', async (req, res) => {
  const { watch_zone_id } = req.body;
  if (!watch_zone_id) return res.status(400).json({ error: 'watch_zone_id required' });
  const result = await sendAlertPush(watch_zone_id, {
    title: 'NER-LIRP Test Alert',
    body: 'This is a real push notification test from the platform.',
    level: 'INFO',
    zoneName: 'Test'
  });
  res.json(result);
});

module.exports = router;
