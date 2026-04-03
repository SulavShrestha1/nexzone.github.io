/**
 * NexZone Service Worker - PWA & Offline Support
 * Cache version is set via the ?v= query param on registration.
 * Bump SW_VERSION in index.html to invalidate all caches on deploy.
 */
const CACHE_NAME = 'nexzone-' + (self.location.search.match(/[?&]v=([^&]+)/) || ['', 'v1'])[1];
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/nexzone.css',
  '/js/app.js',
  '/js/api.js',
  '/js/articles.js',
  '/manifest.json',
  '/icons/favicon.ico',
  '/icons/favicon-16x16.png',
  '/icons/favicon-32x32.png',
  '/icons/apple-touch-icon.png',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800&display=swap',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(() => {}) // Silently fail if some assets aren't available
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-http(s) requests
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // Skip cross-origin API requests (don't cache external APIs)
  if (event.request.url.includes('api.espn.com') ||
      event.request.url.includes('api.jikan.moe') ||
      event.request.url.includes('graphql.anilist.co') ||
      event.request.url.includes('script.google.com') ||
      event.request.url.includes('images.unsplash.com')) {
    return;
  }

  // Cache-first strategy for static assets
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) return response;
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
      .catch(() => {
        // Offline fallback
        if (event.request.headers.get('Accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      })
  );
});
