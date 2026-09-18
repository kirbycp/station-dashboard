// Service worker: makes station-dashboard.html launchable with no network
// (e.g. from the iPad Home Screen). It only caches the app shell and the
// Google Fonts files. Live-data calls (NOAA, Open-Meteo, rss2json, VOACAP)
// are deliberately NOT intercepted — the page already has its own
// localStorage fetch -> cache -> fallback path for those.
//
// Bump CACHE_VERSION whenever the SHELL list below changes.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = 'hamdash-shell-' + CACHE_VERSION;
const FONT_CACHE = 'hamdash-fonts-v1';

const SHELL = [
  './station-dashboard.html',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// If the network hasn't answered in this long, serve the cached page instead —
// keeps the dashboard opening fast on a flaky shack connection.
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k.startsWith('hamdash-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // Page loads: network first (so edits show up when online), cache when offline.
    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req));
      return;
    }
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  }
  // Anything else (the live-data APIs) falls through to the network untouched.
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    // ignoreSearch so a launch URL with a query string still hits the cached page.
    const cached = await cache.match(req, { ignoreSearch: true }) || await cache.match('./station-dashboard.html');
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const refresh = fetch(req).then(res => {
    // Font requests come back opaque (type 'opaque', ok false) but are still cacheable.
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  });
  if (cached) {
    refresh.catch(() => {}); // offline: the cached copy is already being returned
    return cached;
  }
  return refresh;
}
