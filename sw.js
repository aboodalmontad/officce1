const CACHE_NAME = 'lawyer-app-cache-v4';
// Only cache essential, local app shell files. Other assets will be cached on demand by the fetch handler.
// This makes the service worker installation more robust.
const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json',
  './icon.svg',
];

self.addEventListener('install', event => {
  // Perform install steps
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
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

  // For navigation requests, use a network-first strategy to ensure users get the latest HTML.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }
  
  // For all other requests (JS, CSS, fonts, images), use a cache-first strategy.
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
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
            console.error('Fetching failed:', error);
            // You could return a fallback asset here if needed
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