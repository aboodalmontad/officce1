const CACHE_NAME = 'lawyer-app-cache-v29';
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
    // Let non-GET requests and Supabase API calls pass through.
    if (event.request.method !== 'GET' || event.request.url.includes('supabase.co')) {
        return;
    }

    // Use a more robust network-first strategy for navigation requests (the app shell).
    if (event.request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkResponse = await fetch(event.request);
                    // If successful, cache the response for next time and return it.
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                } catch (error) {
                    // If the network fails, serve the main app page from the cache. This is the core of offline functionality.
                    console.log('Network fetch failed for navigation; serving from cache.');
                    const cache = await caches.open(CACHE_NAME);
                    return await cache.match('./index.html') || await cache.match('./');
                }
            })()
        );
        return;
    }

    // For all other requests (assets like JS, CSS, fonts), use a cache-first strategy for speed.
    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            // Check if the request is already in the cache.
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }

            // If not in cache, fetch from the network.
            try {
                const networkResponse = await fetch(event.request);
                // If the fetch is successful, clone the response and store it in the cache for next time.
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            } catch (error) {
                // If the asset can't be fetched either, return a simple error response.
                console.error('Asset fetch failed:', event.request.url, error);
                return new Response(`Asset (${event.request.url}) not available offline.`, { status: 404 });
            }
        })
    );
});