const CACHE_NAME = 'lawyer-app-cache-v8';
// FIX: The list of URLs to cache has been expanded to include all critical,
// external dependencies. This ensures the app is fully functional offline
// immediately after the service worker is installed, preventing failures
// if the user goes offline before these assets are dynamically cached.
const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json',
  './icon.svg',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap',
  // Pinning specific versions from esm.sh for better cache stability
  'https://esm.sh/v135/react@18.2.0/es2022/react.mjs',
  'https://esm.sh/v135/react@18.2.0/es2022/jsx-runtime.mjs',
  'https://esm.sh/v135/react-dom@18.2.0/es2022/client.mjs',
  'https://esm.sh/v135/react-dom@18.2.0/es2022/react-dom.mjs',
  'https://esm.sh/v135/react-router-dom@7.9.1/es2022/react-router-dom.mjs',
  'https://esm.sh/v135/@google/genai@1.20.0/es2022/genai.mjs',
  'https://esm.sh/v135/@supabase/supabase-js@2.44.4/es2022/supabase-js.mjs',
  'https://esm.sh/v135/recharts@2.12.7/es2022/recharts.mjs'
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
  // We only want to cache GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  // Use a cache-first strategy for all requests.
  // This is suitable for an offline-first application.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Not in cache, fetch from network
        return fetch(event.request).then(
          networkResponse => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200) {
              return networkResponse;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // We don't cache Supabase API calls, only static assets
                if (!event.request.url.includes('supabase.co')) {
                    cache.put(event.request, responseToCache);
                }
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('Fetching failed:', error);
            // For navigation requests, return the cached index.html as a fallback.
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
        });
      })
  );
});


// --- Helper functions for periodic notifications ---

const isBeforeToday = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of today
    return date < today;
};

const DB_NAME = 'LawyerAppDB';
const DB_VERSION = 1;
const SESSIONS_STORE_NAME = 'sessions';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject("Error opening DB");
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE_NAME)) {
        db.createObjectStore(SESSIONS_STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

function getSessions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SESSIONS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(SESSIONS_STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject("Error fetching sessions");
    request.onsuccess = () => resolve(request.result);
  });
}


self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-unpostponed-sessions') {
    event.waitUntil(
      checkForUnpostponedSessions()
    );
  }
});

async function checkForUnpostponedSessions() {
    try {
        const db = await openDB();
        const sessions = await getSessions(db);
        
        const revivedSessions = sessions.map(s => ({
            ...s,
            date: new Date(s.date)
        }));
        
        const unpostponed = revivedSessions.filter(s => !s.isPostponed && isBeforeToday(s.date));

        if (unpostponed.length > 0) {
            await self.registration.showNotification('تنبيه بالجلسات غير المرحلة', {
                body: `لديك ${unpostponed.length} جلسات سابقة لم يتم ترحيلها. الرجاء مراجعتها.`,
                icon: './icon.svg',
                lang: 'ar',
                dir: 'rtl',
                tag: 'unpostponed-sessions-notification' // Use a tag to prevent multiple notifications
            });
        }
    } catch (error) {
        console.error('Failed to check for unpostponed sessions in SW:', error);
    }
}