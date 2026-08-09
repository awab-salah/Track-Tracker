/**
 * TrackTracker Service Worker with Firebase Cloud Messaging
 *
 * Used by vite-plugin-pwa in injectManifest mode.
 * Workbox injects the precache manifest (self.__WB_MANIFEST) at build time.
 *
 * Firebase Cloud Messaging:
 * - onBackgroundMessage: receives FCM push when the page is closed/backgrounded
 * - notificationclick: opens/focuses the app when the user taps the notification
 */

// ── Workbox Precache (injected by vite-plugin-pwa) ────────────────────────────
// eslint-disable-next-line no-undef
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];

// Load Workbox from CDN
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

if (workbox) {
  workbox.precaching.precacheAndRoute(PRECACHE_MANIFEST);

  // Navigation fallback for SPA
  workbox.routing.registerRoute(
    new workbox.routing.NavigationRoute(
      workbox.precaching.createHandlerBoundToURL('/index.html'),
      { denylist: [/^\/api\//] }
    )
  );

  // Runtime caching strategies
  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.googleapis.com',
    new workbox.strategies.StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.origin === 'https://fonts.gstatic.com',
    new workbox.strategies.CacheFirst({
      cacheName: 'google-fonts-webfonts',
      plugins: [
        new workbox.expiration.Plugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        new workbox.cacheableResponse.Plugin({ statuses: [0, 200] }),
      ],
    })
  );

  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === 'https://qexafenusvjkyzfhtpda.supabase.co' &&
      url.pathname.startsWith('/storage/'),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'supabase-storage',
      plugins: [
        new workbox.expiration.Plugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }),
        new workbox.cacheableResponse.Plugin({ statuses: [0, 200] }),
      ],
    })
  );

  workbox.routing.registerRoute(
    ({ url }) => url.hostname.includes('tile.openstreetmap.org'),
    new workbox.strategies.CacheFirst({
      cacheName: 'leaflet-tiles',
      plugins: [
        new workbox.expiration.Plugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
        new workbox.cacheableResponse.Plugin({ statuses: [0, 200] }),
      ],
    })
  );
}

// ── Firebase Cloud Messaging ──────────────────────────────────────────────────
// Firebase config values are passed as global variables from the app
// via postMessage after the SW installs. Stored in a module-level map.
let firebaseInitialized = false;

function initFirebase(config) {
  if (firebaseInitialized || !config || !config.apiKey) return;

  try {
    importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js');

    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    // ── Background message handler ──────────────────────────────────────────
    // Called when a push message arrives AND the page is NOT in the foreground.
    // This is the ONLY place that shows a notification for background/closed-app
    // sales — ensuring exactly ONE notification per sale.
    messaging.onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const saleId = data.saleId || '';
      const title = data.title || 'عملية بيع جديدة';
      const body = data.body || 'تم تسجيل عملية بيع جديدة';
      const icon = data.icon || '/icons/icon-192.png';

      // Deterministic tag using saleId — browser dedup if same sale is
      // delivered twice (e.g., FCM retry or reconnect).
      const tag = saleId ? `sale-${saleId}` : `sale-${Date.now()}`;

      const notificationOptions = {
        body,
        icon,
        tag,
        data: {
          saleId,
          driverId: data.driverId || '',
          companyId: data.companyId || '',
          type: data.type || 'sale',
          clickAction: data.clickAction || '/',
        },
      };

      return self.registration.showNotification(title, notificationOptions);
    });

    firebaseInitialized = true;
    console.log('[SW] Firebase Cloud Messaging initialized');
  } catch (err) {
    console.error('[SW] Firebase initialization failed:', err);
  }
}

// Listen for Firebase config from the app via postMessage
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    initFirebase(event.data.config);
  }
});

// ── Notification Click Handler ────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickAction = event.notification.data?.clickAction || '/';
  const saleId = event.notification.data?.saleId || '';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If a window client is already open, focus it
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      return self.clients.openWindow(clickAction);
    })
  );
});
