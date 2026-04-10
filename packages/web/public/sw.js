/**
 * Millo Service Worker
 * Strategy:
 *   - Static assets (JS, CSS, fonts, images): Cache-first
 *   - API requests (/api/*): Network-first with offline fallback
 *   - HTML navigations: Network-first with offline page fallback
 * https://milloapp.com
 */

// Bump when shipped JS/CSS must bypass cache-first SW stale assets (keep in sync with deploys).
const CACHE_NAME = "millo-v2";
const OFFLINE_URL   = '/offline.html';
const API_PATTERNS  = ['/auth/', '/content/', '/live/', '/shop/', '/payments/', '/dm/', '/notifications/'];

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
];

// ── Install: pre-cache offline page ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(STATIC_ASSETS).catch(() => {})
    )
  );
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: routing strategy ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // API: network-first, fail silently
  if (API_PATTERNS.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: 'OFFLINE' }), {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        })
      )
    );
    return;
  }

  // Static assets (.js, .css, .woff, .png, .svg): cache-first
  if (/\.(js|css|woff2?|png|jpg|jpeg|svg|webp|ico|ttf)(\?.*)?$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML navigation: network-first with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }
});

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); }
  catch { payload = { title: 'Millo', body: event.data.text() }; }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Millo', {
      body:    payload.body || '',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      data:    payload.data || {},
      tag:     payload.tag  || 'millo-notification',
      vibrate: [200, 100, 200],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url  = data.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      return clients.openWindow(url);
    })
  );
});
