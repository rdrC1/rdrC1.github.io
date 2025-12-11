// Service Worker for reTerem PWA
const CACHE_NAME = 'reterem-v1';
const RUNTIME_CACHE = 'reterem-runtime-v1';

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/storage.js',
  '/jsonParser.js',
  '/pdfParser.js',
  '/notifications.js',
  '/androidlogo.webp',
  '/androidlogo.webp',
  'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/icon?family=Material+Symbols+Outlined'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Caching assets');
        return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.error('[Service Worker] Cache failed:', error);
      })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests (except fonts and icons)
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin && 
      !url.href.includes('fonts.googleapis.com') && 
      !url.href.includes('fonts.gstatic.com')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        // Return cached version if available
        if (cachedResponse) {
          return cachedResponse;
        }

        // Fetch from network
        return fetch(event.request)
          .then((response) => {
            // Don't cache non-successful responses
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the response
            caches.open(RUNTIME_CACHE)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(() => {
            // If network fails and no cache, return offline page if available
            if (event.request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Background sync for notifications (if supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(
      // Sync notifications logic can be added here
      Promise.resolve()
    );
  }
});

// Push notification event handler
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push notification received');
  
  let notificationData = {
    title: 'reTerem',
    body: 'Új teremváltozás',
    icon: '/androidlogo.webp',
    badge: '/androidlogo.webp',
    tag: 'room-change',
    requireInteraction: false,
    vibrate: [200, 100, 200],
    data: {}
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        ...notificationData,
        ...data
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      vibrate: notificationData.vibrate,
      data: notificationData.data,
      actions: [
        {
          action: 'open',
          title: 'Megnyitás'
        },
        {
          action: 'close',
          title: 'Bezárás'
        }
      ]
    })
  );
});

// Notification click event handler
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification clicked');
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // If app is already open, focus it
          for (let client of clientList) {
            if (client.url === self.location.origin && 'focus' in client) {
              return client.focus();
            }
          }
          // Otherwise, open new window
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});

// Scheduled notifications storage
const NOTIFICATIONS_DB = 'notifications-db';
const NOTIFICATIONS_STORE = 'scheduled-notifications';

// Initialize IndexedDB for notifications
async function initNotificationsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NOTIFICATIONS_DB, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(NOTIFICATIONS_STORE)) {
        const store = db.createObjectStore(NOTIFICATIONS_STORE, { keyPath: 'id' });
        store.createIndex('time', 'time', { unique: false });
      }
    };
  });
}

// Store scheduled notification
async function storeNotification(notification) {
  try {
    const db = await initNotificationsDB();
    const transaction = db.transaction([NOTIFICATIONS_STORE], 'readwrite');
    const store = transaction.objectStore(NOTIFICATIONS_STORE);
    await store.put(notification);
    console.log('[Service Worker] Notification stored:', notification.id);
  } catch (error) {
    console.error('[Service Worker] Error storing notification:', error);
  }
}

// Get all scheduled notifications
async function getScheduledNotifications() {
  try {
    const db = await initNotificationsDB();
    const transaction = db.transaction([NOTIFICATIONS_STORE], 'readonly');
    const store = transaction.objectStore(NOTIFICATIONS_STORE);
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Service Worker] Error getting notifications:', error);
    return [];
  }
}

// Remove notification
async function removeNotification(id) {
  try {
    const db = await initNotificationsDB();
    const transaction = db.transaction([NOTIFICATIONS_STORE], 'readwrite');
    const store = transaction.objectStore(NOTIFICATIONS_STORE);
    await store.delete(id);
    console.log('[Service Worker] Notification removed:', id);
  } catch (error) {
    console.error('[Service Worker] Error removing notification:', error);
  }
}

// Active timeouts for notifications
const activeTimeouts = new Map();

// Check and show due notifications
async function checkScheduledNotifications() {
  const now = Date.now();
  const notifications = await getScheduledNotifications();
  
  for (const notification of notifications) {
    const delay = notification.time - now;
    
    if (delay <= 0) {
      // Show notification immediately if due
      await self.registration.showNotification(notification.title, {
        body: notification.body,
        icon: notification.icon || '/androidlogo.webp',
        badge: notification.badge || '/androidlogo.webp',
        tag: notification.tag || 'room-change',
        requireInteraction: notification.requireInteraction || false,
        vibrate: notification.vibrate || [200, 100, 200],
        data: notification.data || {}
      });
      
      // Remove from storage
      await removeNotification(notification.id);
      
      // Clear timeout if exists
      if (activeTimeouts.has(notification.id)) {
        clearTimeout(activeTimeouts.get(notification.id));
        activeTimeouts.delete(notification.id);
      }
    } else if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      // If due within 24 hours and not already scheduled, set timeout
      if (!activeTimeouts.has(notification.id)) {
        const timeoutId = setTimeout(async () => {
          await self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: notification.icon || '/androidlogo.webp',
            badge: notification.badge || '/androidlogo.webp',
            tag: notification.tag || 'room-change',
            requireInteraction: notification.requireInteraction || false,
            vibrate: notification.vibrate || [200, 100, 200],
            data: notification.data || {}
          });
          
          await removeNotification(notification.id);
          activeTimeouts.delete(notification.id);
        }, delay);
        
        activeTimeouts.set(notification.id, timeoutId);
        console.log(`[Service Worker] Scheduled notification ${notification.id} in ${Math.round(delay / 1000)}s`);
      }
    }
  }
}

// Periodic check for scheduled notifications (every minute when active)
// Note: On iOS, this may not run when app is closed, but will run when app opens
let checkInterval = null;

function startPeriodicCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  // Check immediately
  checkScheduledNotifications();
  
  // Then check every minute
  checkInterval = setInterval(() => {
    checkScheduledNotifications();
  }, 60000); // Check every minute
}

// Start periodic check when service worker activates
self.addEventListener('activate', async (event) => {
  event.waitUntil(
    Promise.all([
      checkScheduledNotifications(),
      startPeriodicCheck()
    ])
  );
});

// Also check when service worker starts
startPeriodicCheck();

// Message event handler (for communication with main app)
self.addEventListener('message', async (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(RUNTIME_CACHE).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
  
  // Schedule notification via Service Worker
  if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
    const notification = event.data.notification;
    await storeNotification(notification);
    console.log('[Service Worker] Notification scheduled:', notification.id);
    
    // Check and schedule timeout immediately
    await checkScheduledNotifications();
  }
  
  // Cancel notification
  if (event.data && event.data.type === 'CANCEL_NOTIFICATION') {
    await removeNotification(event.data.id);
  }
  
  // Cancel all notifications
  if (event.data && event.data.type === 'CANCEL_ALL_NOTIFICATIONS') {
    const notifications = await getScheduledNotifications();
    for (const notification of notifications) {
      await removeNotification(notification.id);
      // Clear timeout if exists
      if (activeTimeouts.has(notification.id)) {
        clearTimeout(activeTimeouts.get(notification.id));
        activeTimeouts.delete(notification.id);
      }
    }
  }
  
  // Cancel specific notification
  if (event.data && event.data.type === 'CANCEL_NOTIFICATION') {
    await removeNotification(event.data.id);
    if (activeTimeouts.has(event.data.id)) {
      clearTimeout(activeTimeouts.get(event.data.id));
      activeTimeouts.delete(event.data.id);
    }
  }
  
  // Check notifications now
  if (event.data && event.data.type === 'CHECK_NOTIFICATIONS') {
    await checkScheduledNotifications();
  }
  
  // App activated - check notifications immediately
  if (event.data && event.data.type === 'APP_ACTIVATED') {
    await checkScheduledNotifications();
    startPeriodicCheck();
  }
});

