// ============================================================
// Service Worker - L'hams DJ ERP
// Cache-first for static assets, network-first for API,
// offline fallback for navigation, background sync for POS.
// ============================================================

const CACHE_VERSION = 'lhams-erp-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

// Assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/offline.html',
  '/dashboard',
  '/dashboard/pos',
  '/manifest.json',
  '/logo.png',
];

// ---- Helpers ----

function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|webp|ico|avif)(\?.*)?$/i.test(url.pathname);
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/api');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate';
}

// ---- Install ----

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        // Non-critical: some URLs might 404 during first deploy
        console.warn('[SW] Precache partial failure:', err);
      });
    })
  );
  // Activate immediately, don't wait for old SW to finish
  self.skipWaiting();
});

// ---- Activate ----

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            // Delete caches that don't belong to the current version
            return !key.startsWith(CACHE_VERSION);
          })
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ---- Fetch ----

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip non-GET for caching (POST/PUT/DELETE go through normally, or via background sync)
  if (event.request.method !== 'GET') return;

  // 1) Static assets -> cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // 2) API requests -> network-first with cache fallback
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // 3) Navigation requests -> network-first with offline fallback
  if (isNavigationRequest(event.request)) {
    event.respondWith(navigationHandler(event.request));
    return;
  }

  // 4) Everything else -> network-first
  event.respondWith(networkFirst(event.request, PAGES_CACHE));
});

// ---- Strategy: Cache First ----

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // If both cache and network fail, return a basic error
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// ---- Strategy: Network First ----

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ---- Strategy: Navigation Handler ----

async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try to serve the cached version of the page
    const cached = await caches.match(request);
    if (cached) return cached;

    // Last resort: show offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    return new Response('Offline', { status: 503 });
  }
}

// ============================================================
// Background Sync - Queue failed POST requests (POS sales)
// ============================================================

const SYNC_TAG = 'pos-sale-sync';
const SYNC_STORE = 'pos-sync-queue';

// IndexedDB helper for queuing failed requests
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('lhams-sw-sync', 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveToSyncQueue(url, method, headers, body) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_STORE);
    store.add({
      url,
      method,
      headers: Object.fromEntries(headers.entries()),
      body,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueuedRequests() {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE, 'readonly');
    const store = tx.objectStore(SYNC_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE, 'readwrite');
    const store = tx.objectStore(SYNC_STORE);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Intercept failed POST requests to API endpoints and queue them
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (
    url.origin === self.location.origin &&
    event.request.method === 'POST' &&
    isApiRequest(url)
  ) {
    event.respondWith(handlePostWithSync(event.request));
  }
});

async function handlePostWithSync(request) {
  const clonedRequest = request.clone();

  try {
    const response = await fetch(request);
    return response;
  } catch {
    // Network failed - queue for background sync
    try {
      const body = await clonedRequest.text();
      await saveToSyncQueue(
        clonedRequest.url,
        clonedRequest.method,
        clonedRequest.headers,
        body
      );

      // Try to register a background sync
      if (self.registration.sync) {
        await self.registration.sync.register(SYNC_TAG);
      }

      return new Response(
        JSON.stringify({
          queued: true,
          message: 'Sin conexion. La venta se enviara automaticamente cuando vuelva la conexion.',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: 'offline', message: 'No se pudo guardar la solicitud.' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }
}

// Background sync event - replay queued requests
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) {
    event.waitUntil(replayQueuedRequests());
  }
});

async function replayQueuedRequests() {
  const queued = await getQueuedRequests();

  for (const item of queued) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });

      if (response.ok || response.status < 500) {
        // Success or client error (don't retry 4xx) - remove from queue
        await removeFromQueue(item.id);
      }
      // 5xx errors will remain in queue for next sync attempt
    } catch {
      // Still offline, stop trying - sync will be retried by the browser
      break;
    }
  }

  // Notify all clients that sync completed
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'SYNC_COMPLETE', remaining: (await getQueuedRequests()).length });
  }
}

// Listen for manual sync trigger from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    replayQueuedRequests();
  }
});
