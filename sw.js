/**
 * NexZone Service Worker - PWA & Offline Support
 */
const CACHE_NAME = 'nexzone-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/nexzone.css',
  '/js/app.js',
  '/js/api.js',
  '/js/articles.js',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700;800&display=swap',
];

// Install event - cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip chrome-extension and non-http(s) requests
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  // Skip cross-origin API requests
  if (event.request.url.includes('api.espn.com') || 
      event.request.url.includes('api.jikan.moe') ||
      event.request.url.includes('graphql.anilist.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            // Only cache http/https resources
            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          }
        );
      })
      .catch(() => {
        // Fallback for offline
        if (event.request.headers.get('Accept') && event.request.headers.get('Accept').includes('text/html')) {
          return caches.match('/index.html');
        }
      })
  );
});
