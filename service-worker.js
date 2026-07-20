// Bump this on every deploy that changes app-shell files, to bust old caches.
const CACHE_NAME = 'not-hot-dog-v1';

// Spec 4.3: cache the app shell so the app loads offline once installed.
// TF.js + the locally bundled COCO-SSD model are cached at runtime on first successful
// fetch (see the fetch handler below) so that classification also works
// offline after the first run.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './bundle.js',
  './manifest.json',
  './icons/not-hot-dog-192.png',
  './icons/not-hot-dog-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function offlineResponse() {
  return new Response('Resource unavailable while offline.', {
    status: 503,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain' },
  });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.put(request, response.clone()))
        .catch(() => {});
    }
    return response;
  } catch (_error) {
    return (await caches.match(request)) || offlineResponse();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || networkFirst(request);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  event.respondWith(
    url.origin === self.location.origin ? networkFirst(request) : cacheFirst(request)
  );
});
