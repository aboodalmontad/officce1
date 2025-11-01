const CACHE_NAME = 'lawyer-app-cache-v27';
// The list of URLs to cache has been expanded to include all critical,
// external dependencies. This ensures the app is fully functional offline
// immediately after the service worker is installed, preventing failures
// if the user goes offline before these assets are dynamically cached.
const urlsToCache = [
  './',
  './index.html',
  './index.js',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
  // Google Fonts files
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzSBC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGFC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGVC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGjC45I.woff2',
  // Pinning specific versions from esm.sh for better cache stability
  // Using bundled versions for more robust caching.
  'https://esm.sh/@google/genai@1.20.0?bundle',
  'https://esm.sh/@supabase/supabase-js@2.44.4?bundle',
  'https://esm.sh/recharts@2.12.7?bundle',
  'https://esm.sh/react@18.3.1',
  'https://esm.sh/react-dom@18.3.1/client',
  'https://esm.sh/react@18.3.1/jsx-runtime',
  'https://esm.sh/idb@8.0.0?bundle',
  'https://esm.sh/docx-preview@0.3.2?bundle',
];

self.addEventListener('install', event => {
  // Perform install steps
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache and caching URLs');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open pages immediately
  );
});

self.addEventListener('fetch', event => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // Supabase API calls should always go to the network and not be cached.
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  // For navigation requests (e.g., loading the main page), use a Network-first strategy.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Try to fetch from the network first.
          const networkResponse = await fetch(event.request);
          return networkResponse;
        } catch (error) {
          // If the network fails, serve the cached index.html as a fallback.
          console.log('Network request for navigation failed, serving from cache.');
          const cache = await caches.open(CACHE_NAME);
          // './' is the key we used to cache index.html
          const cachedResponse = await cache.match('./');
          return cachedResponse || new Response("You are offline and the app shell is not cached.", { status: 500, statusText: "Offline Fallback Not Found" });
        }
      })()
    );
    return;
  }
  
  // For all other requests (assets like JS, CSS, fonts), use a Cache-first strategy.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Check if the request is in the cache.
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. If not in cache, fetch from the network.
      try {
        const networkResponse = await fetch(event.request);
        
        // We cache successful responses (status 200) and opaque responses (for no-cors CDNs).
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          await cache.put(event.request, responseToCache);
        }
        
        return networkResponse;
      } catch (error) {
        // 3. If the network fails (e.g., offline), provide a fallback.
        console.error('Fetch failed and not in cache:', event.request.url, error);
        return new Response('Asset not available offline.', {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })
  );
});