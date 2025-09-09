// service-worker.js — cache dasar untuk shell offline dengan update untuk mendukung fitur notifikasi
const CACHE = "presensi-fupa-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./karyawan.html",
  "./admin.html",
  "./app.js",
  "./manifest.webmanifest",
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap",
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:FILL,GRAD@1,200",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"
];

// Install event - cache semua aset penting
self.addEventListener("install", (e) => {
  console.log('Service Worker installing.');
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => {
        console.log('Cache opened');
        return cache.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - bersihkan cache lama
self.addEventListener("activate", (e) => {
  console.log('Service Worker activating.');
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE)
          .map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - strategi cache pertama, fallback ke network
self.addEventListener("fetch", (e) => {
  // Skip cross-origin requests
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      // Return cached version if available
      if (cachedResponse) {
        return cachedResponse;
      }

      // Otherwise, get from network and cache it
      return fetch(e.request).then(response => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE).then(cache => {
          cache.put(e.request, responseToCache);
        });

        return response;
      }).catch(error => {
        console.log('Fetch failed; returning offline page:', error);
        // For HTML pages, return the offline page
        if (e.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Background sync untuk notifikasi
self.addEventListener('sync', (event) => {
  if (event.tag === 'notif-sync') {
    console.log('Background sync triggered');
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Implementasi background sync untuk notifikasi
  // Di sini kita bisa menambahkan logika untuk mengirim notifikasi
  // bahkan ketika aplikasi tidak sedang dibuka
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({
      type: 'background-sync',
      message: 'Aplikasi Presensi FUPA sedang berjalan di latar belakang'
    });
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: 'https://api.iconify.design/material-symbols/workspace-premium.svg?color=%23ffb300',
      badge: 'https://api.iconify.design/material-symbols/workspace-premium.svg?color=%23ffb300',
      vibrate: [200, 100, 200],
      tag: 'presensi-notification'
    };

    event.waitUntil(
      self.registration.showNotification('Presensi FUPA', options)
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({type: 'window'}).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});

// Handle background messages from Firebase
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});