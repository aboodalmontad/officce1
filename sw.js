const CACHE_NAME = 'lawyer-app-cache-v25';
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
  'https://esm.sh/@google/genai@1.20.0',
  'https://esm.sh/@supabase/supabase-js@2.44.4',
  'https://esm.sh/recharts@2.12.7',
  'https://esm.sh/react@18.3.1',
  'https://esm.sh/react-dom@18.3.1/client',
  'https://esm.sh/react@18.3.1/jsx-runtime',
  'https://esm.sh/idb@8.0.0',
  'https://esm.sh/docx-preview@0.3.2',
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
  // The JS library itself is hosted on esm.sh and will be cached.
  if (event.request.url.includes('supabase.co')) {
    // We don't call event.respondWith, so the browser handles it as usual (network).
    return;
  }

  // For all other GET requests, use a robust cache-first strategy.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 1. Try to find a response in the cache.
      const cachedResponse = await cache.match(event.request);
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. If not in cache, fetch from the network.
      try {
        const networkResponse = await fetch(event.request);
        
        // We cache successful responses (status 200) and opaque responses (for no-cors CDNs).
        // This is important for caching assets like tailwindcss.
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          // Clone the response because it can only be consumed once.
          const responseToCache = networkResponse.clone();
          await cache.put(event.request, responseToCache);
        }
        
        return networkResponse;
      } catch (error) {
        // 3. If the network fails (e.g., offline), provide a fallback.
        console.error('Fetch failed; returning offline fallback if available for:', event.request.url, error);

        // For navigation requests (i.e., loading a page), return the cached root file.
        if (event.request.mode === 'navigate') {
          const fallbackResponse = await cache.match('./');
          if (fallbackResponse) {
            return fallbackResponse;
          }
        }
        
        // For other failed requests (images, scripts, etc.), there's no specific fallback,
        // so we return a generic error response to make debugging easier.
        return new Response('Network error: The resource could not be fetched and is not in the cache.', {
          status: 408, // Request Timeout
          statusText: 'Request Timeout',
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    })
  );
});