// Shared Web Push client helper used by citizen.js, agent.js, and sensor.js.
// This is real browser Push API + Service Worker code — when it succeeds,
// the phone is genuinely registered with the browser's push service
// (FCM on Android/Chrome, APNs-backed webpush on iOS 16.4+ Safari PWAs).

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported in this browser');
    return null;
  }
  return navigator.serviceWorker.register('/sw.js');
}

// pushConfig: { userId, deviceLabel, appRole: 'CITIZEN'|'FIELD_AGENT'|'GOVERNMENT'|'ADMIN', watchZoneId }
async function enablePushNotifications(pushConfig) {
  if (!('Notification' in window) || !('PushManager' in window)) {
    return { ok: false, reason: 'Push notifications are not supported on this browser/device.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'Notification permission was not granted.' };
  }

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: 'Could not register service worker.' };
  await navigator.serviceWorker.ready;

  const { publicKey } = await apiGet('/push/vapid-public-key');

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await apiPost('/push/subscribe', {
    subscription: subscription.toJSON(),
    userId: pushConfig.userId || null,
    deviceLabel: pushConfig.deviceLabel || navigator.userAgent.slice(0, 60),
    appRole: pushConfig.appRole,
    watchZoneId: pushConfig.watchZoneId || null
  });

  return { ok: true };
}

async function disablePushNotifications() {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return;
  const subscription = await reg.pushManager.getSubscription();
  if (subscription) {
    await apiPost('/push/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
}

function registerManifest(manifestPath, themeColor) {
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = manifestPath;
  document.head.appendChild(link);

  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = themeColor;
  document.head.appendChild(meta);

  // iOS Safari "Add to Home Screen" support
  const appleCapable = document.createElement('meta');
  appleCapable.name = 'apple-mobile-web-app-capable';
  appleCapable.content = 'yes';
  document.head.appendChild(appleCapable);

  const appleStatus = document.createElement('meta');
  appleStatus.name = 'apple-mobile-web-app-status-bar-style';
  appleStatus.content = 'black-translucent';
  document.head.appendChild(appleStatus);
}
