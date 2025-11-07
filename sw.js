// This version number is incremented to trigger the 'install' event and update the cache.
const CACHE_NAME = 'lawyer-app-cache-v22';

// The list of URLs to cache has been expanded to include all critical,
// external dependencies. This ensures the app is fully functional offline
// immediately after the service worker is installed.
const urlsToCache = [
  './',
  './index.html',
  './index.js',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
  // Google Fonts files (specific woff2 files often used by browsers)
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzSBC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGFC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGVC45I.woff2',
  'https://fonts.gstatic.com/s/tajawal/v10/Iura6YBj_oCad4k1nzGjC45I.woff2',
  // Pinning specific versions from esm.sh for better cache stability.
  'https://esm.sh/@google/genai@^1.20.0',
  'https://esm.sh/@supabase/supabase-js@^2.44.4',
  'https://esm.sh/react@^19.1.1',
  'https://esm.sh/react-dom@^19.1.1/client',
  'https://esm.sh/react@^19.1.1/jsx-runtime',
  'https://esm.sh/recharts@^2.12.7',
  'https://esm.sh/idb@^8.0.0',
  'https://esm.sh/docx-preview@^0.1.20',
  'https://esm.sh/pdfjs-dist@^4.4.178',
  'https://esm.sh/pdfjs-dist@4.4.178/build/pdf.worker.mjs',
];

self.addEventListener('install', event => {
  console.log('Service Worker: Installing...');
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching app shell and essential assets.');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Service Worker: Failed to cache assets during install:', error);
      })
  );
});

self.addEventListener('activate', event => {
  console.log('Service Worker: Activating...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients.');
      return self.clients.claim(); // Take control of open pages immediately
    })
  );
});

self.addEventListener('fetch', event => {
  // We only want to handle GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // Supabase API calls (for auth and data) should always go to the network.
  // They should not be cached.
  const isSupabaseApi = event.request.url.includes('supabase.co');
  if (isSupabaseApi) {
    // Let the browser handle it as a normal network request.
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
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          // Clone the response because it's a stream and can only be consumed once.
          const responseToCache = networkResponse.clone();
          await cache.put(event.request, responseToCache);
        }
        
        return networkResponse;
      } catch (error) {
        // 3. If the network fails (e.g., user is offline), provide a fallback.
        console.warn('Service Worker: Network fetch failed, returning offline fallback.', { url: event.request.url, error });

        // For navigation requests (i.e., loading a page), return the cached root HTML file.
        // This is the key to making the PWA work offline.
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