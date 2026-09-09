const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const { PushSubscription } = require('../db/models');

const KEYFILE = path.join(__dirname, '..', 'vapid-keys.json');

function loadOrCreateVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (fs.existsSync(KEYFILE)) {
    return JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(KEYFILE, JSON.stringify(keys, null, 2));
  console.log('\n[Push] Generated new VAPID keypair -> vapid-keys.json');
  console.log('[Push] For a stable identity across restarts, copy these into your .env file:');
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}\n`);
  return keys;
}

const vapidKeys = loadOrCreateVapidKeys();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@nerlirp.local';

webpush.setVapidDetails(VAPID_SUBJECT, vapidKeys.publicKey, vapidKeys.privateKey);

function getPublicKey() {
  return vapidKeys.publicKey;
}

async function saveSubscription({ subscription, userId, deviceLabel, appRole, watchZoneId }) {
  const doc = await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_id: userId || null,
      device_label: deviceLabel || 'Unknown device',
      app_role: appRole,
      watch_zone_id: watchZoneId || null
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  return doc.toJSON();
}

async function removeSubscription(endpoint) {
  await PushSubscription.deleteOne({ endpoint });
}

// Send a real push notification to every device currently watching this zone,
// plus every GOVERNMENT/ADMIN device (command staff always sees everything).
async function sendAlertPush(zoneId, { title, body, level, zoneName }) {
  const subs = await PushSubscription.find({
    $or: [
      { watch_zone_id: zoneId },
      { app_role: { $in: ['GOVERNMENT', 'ADMIN'] } }
    ]
  });

  const payload = JSON.stringify({
    title, body, level, zoneName,
    icon: '/icons/icon-citizen-192.png',
    badge: '/icons/badge-72.png',
    timestamp: Date.now(),
    url: '/'
  });

  let sent = 0, failed = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
      sent++;
    } catch (err) {
      failed++;
      // 404/410 = subscription is dead (user uninstalled, permissions revoked, etc.) — clean it up
      if (err.statusCode === 404 || err.statusCode === 410) {
        await PushSubscription.deleteOne({ endpoint: sub.endpoint });
      }
    }
  }));

  return { sent, failed, targeted: subs.length };
}

module.exports = { getPublicKey, saveSubscription, removeSubscription, sendAlertPush };
