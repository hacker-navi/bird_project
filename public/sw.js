// NER-LIRP service worker — shared by all three app shells (citizen, agent, sensor).
// Handles: installability (offline app-shell caching) + REAL push notification display.

const CACHE_NAME = 'ner-lirp-shell-v1';
const SHELL_FILES = [
  '/css/style.css',
  '/js/common.js',
  '/icons/icon-citizen-192.png',
  '/icons/icon-agent-192.png',
  '/icons/icon-sensor-192.png',
  '/icons/icon-admin-192.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Network-first for API calls (always want fresh data), cache-first for static shell assets.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return; // never intercept live data
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});

// ---- THE REAL PART: actually showing a push notification on the device ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'NER-LIRP Alert', body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'NER-LIRP Alert';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-citizen-192.png',
    badge: data.badge || '/icons/badge-72.png',
    tag: data.level || 'ner-lirp-alert',
    renotify: true,
    requireInteraction: data.level === 'EMERGENCY' || data.level === 'HIGH ALERT',
    data: { url: data.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
