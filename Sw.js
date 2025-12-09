// Service Worker for Phone Lock PWA
const CACHE_NAME = 'phone-lock-v2.0';
const APP_CACHE = [
  '/',
  '/index.html',
  '/client.html',
  '/style.css',
  '/firebase-config.js',
  '/controller.js',
  '/client.js',
  '/manifest.json',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/assets/install-icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js'
];

// Install Event
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(APP_CACHE);
      })
      .then(() => {
        console.log('[SW] Installation complete');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// Activate Event
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Activation complete');
      return self.clients.claim();
    })
  );
});

// Fetch Event
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension requests
  if (event.request.url.startsWith('chrome-extension://')) return;
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(error => {
            console.log('[SW] Fetch failed:', error);
            // If offline and requesting HTML, return offline page
            if (event.request.headers.get('accept').includes('text/html')) {
              return caches.match('/client.html');
            }
          });
      })
  );
});

// Push Notification Event
self.addEventListener('push', event => {
  console.log('[SW] Push received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {
      title: 'Phone Lock Controller',
      body: event.data.text() || 'New notification',
      icon: '/icons/icon-192x192.png'
    };
  }
  
  const options = {
    body: data.body || 'Remote lock command received',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'phone-lock',
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: data.actions || [
      {
        action: 'unlock',
        title: 'Request Unlock'
      }
    ],
    data: {
      url: data.url || '/client.html',
      sessionId: data.sessionId,
      timestamp: Date.now()
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Phone Lock', options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data.url || '/client.html';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    })
    .then(windowClients => {
      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background Sync
self.addEventListener('sync', event => {
  if (event.tag === 'sync-lock-status') {
    console.log('[SW] Background sync triggered');
    event.waitUntil(syncLockStatus());
  }
});

async function syncLockStatus() {
  const db = await idb.openDB('lock-db', 1, {
    upgrade(db) {
      db.createObjectStore('commands', { keyPath: 'id' });
    }
  });
  
  const commands = await db.getAll('commands');
  
  for (const command of commands) {
    // Try to sync pending commands
    console.log('[SW] Syncing command:', command);
    await db.delete('commands', command.id);
  }
}

// Periodic Sync (for background updates)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'update-lock-status') {
    console.log('[SW] Periodic sync triggered');
    event.waitUntil(updateLockStatus());
  }
});

async function updateLockStatus() {
  // Update lock status in background
  const response = await fetch('/api/status');
  const data = await response.json();
  
  // Update local storage
  self.registration.active.postMessage({
    type: 'LOCK_STATUS_UPDATE',
    data: data
  });
}
