/**
 * Combined Service Worker: Workbox PWA + Firebase Cloud Messaging.
 *
 * This is the SINGLE service worker for the TrackTracker PWA.
 * It handles:
 *   1. Workbox precaching (offline support)
 *   2. Workbox runtime caching (fonts, images, tiles)
 *   3. FCM background messages (push notifications when app is closed)
 *   4. Notification click handling
 *   5. SKIP_WAITING for controlled SW updates
 *
 * vite-plugin-pwa uses `injectManifest` strategy: it compiles this file
 * with esbuild, then replaces `self.__WB_MANIFEST` with the precache manifest.
 *
 * FCM background messages are handled using the Firebase modular SDK
 * (`firebase/messaging/sw`) which is specifically designed for service worker
 * context and does NOT require importScripts or CDN loading.
 *
 * IMPORTANT: The Edge Function sends DATA-ONLY messages (no `notification`
 * field) so that onBackgroundMessage is always called, giving us full control
 * over the notification tag, icon, title, and body. This ensures each sale
 * produces an independent notification (tag: sale-${saleId}) instead of
 * replacing the previous one.
 */

// ── Workbox imports ──────────────────────────────────────────────────────────
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// ── Firebase imports ─────────────────────────────────────────────────────────
// `firebase/messaging/sw` is the special entry point for service workers.
// It provides getMessaging() and onBackgroundMessage() that work in SW context.
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// ── Firebase config (public values — safe to embed in SW) ────────────────────
const firebaseConfig = {
  apiKey:            'AIzaSyC-0D4K-Rzq3jdWjkduWCihlD1rSb_BqQI',
  authDomain:        'track-tracker-ca74a.firebaseapp.com',
  projectId:         'track-tracker-ca74a',
  storageBucket:     'track-tracker-ca74a.firebasestorage.app',
  messagingSenderId: '659715394517',
  appId:             '1:659715394517:web:5e02f9a2e7541f92a68b5c',
};

// Initialize Firebase in the service worker
const firebaseApp = initializeApp(firebaseConfig);
const messaging = getMessaging(firebaseApp);

// ── 1. Workbox precaching ───────────────────────────────────────────────────
// self.__WB_MANIFEST is replaced by vite-plugin-pwa with the precache entries.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── 2. Navigation fallback ──────────────────────────────────────────────────
registerRoute(
  new NavigationRoute(
    // createHandlerBoundToURL is not available in injectManifest mode,
    // so we use a precache-based approach directly.
    // Workbox will serve the precached /index.html for navigation requests.
    ({ request }) => caches.match('/index.html').then((r) => r || fetch(request)),
    { denylist: [/^\/api\//] },
  ),
);

// ── 3. Runtime caching ──────────────────────────────────────────────────────
// Google Fonts stylesheets
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets', plugins: [] }),
  'GET',
);

// Google Fonts webfonts
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET',
);

// Supabase Storage images (avatars, receipts)
registerRoute(
  ({ url }) =>
    url.origin === 'https://qexafenusvjkyzfhtpda.supabase.co' &&
    url.pathname.startsWith('/storage/'),
  new StaleWhileRevalidate({
    cacheName: 'supabase-storage',
    plugins: [
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET',
);

// Leaflet tile layers for offline map
registerRoute(
  ({ url }) => url.hostname.includes('tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'leaflet-tiles',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
  'GET',
);

// ── 4. FCM background message handler ───────────────────────────────────────
// This fires when a push message arrives AND no client (tab) is visible.
// It is the ONLY way to show a notification when the PWA is completely closed.
//
// The Edge Function sends DATA-ONLY messages with these fields:
//   type, title, body, companyId, saleId, tag, driverName, totalPrice
onBackgroundMessage(messaging, (payload) => {
  const data = payload.data ?? {};

  const type       = data.type       ?? 'sale';
  const saleId     = data.saleId     ?? '';
  const driverName = data.driverName ?? 'سائق';
  const totalPrice = data.totalPrice ?? '';

  // Title & body come from the Edge Function's data payload
  const title = data.title ?? 'عملية بيع جديدة';
  const body  = data.body
    ?? (totalPrice
      ? `${driverName} قام بعملية بيع بقيمة ${totalPrice} د.ع`
      : `${driverName} قام بعملية بيع جديدة`);

  // Unique tag per saleId → each sale shows a separate notification
  // Without tag, new notifications replace old ones with the same tag.
  // With sale-${saleId}, each sale gets its own independent notification.
  const tag = data.tag ?? (saleId ? `sale-${saleId}` : undefined);

  self.registration.showNotification(title, {
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    ...(tag && { tag }),
    data:  { saleId, type, driverName, totalPrice, clickAction: '/' },
    dir:   'rtl',
    lang:  'ar',
  });
});

// ── 5. Notification click handler ───────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickAction = event.notification.data?.clickAction ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing window if one is open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(clickAction);
    }),
  );
});

// ── 6. SKIP_WAITING (controlled SW updates from vite-plugin-pwa) ────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
