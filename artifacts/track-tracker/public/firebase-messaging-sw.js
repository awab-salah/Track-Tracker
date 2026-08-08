/**
 * Firebase Cloud Messaging — Service Worker for background push.
 *
 * This file is imported by the Workbox-generated service worker via
 * `importScripts` (configured in vite.config.ts workbox.importScripts).
 * It handles push messages from FCM when the app is not in the
 * foreground (browser tab closed or minimized).
 *
 * IMPORTANT: We use the Firebase compat SDK's onBackgroundMessage()
 * instead of a raw push event listener. This is required for the
 * foreground onMessage() handler in AppContext to work correctly.
 * Without this, FCM foreground messages won't be delivered.
 *
 * This MUST be plain JS (no TypeScript, no ESM imports) because it runs
 * inside the service worker context and is loaded via importScripts.
 */

// Import Firebase compat SDK for service worker
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker.
// These values come from the Firebase project console — they are public (not secret).
firebase.initializeApp({
  apiKey: 'AIzaSyC-0D4K-Rzq3jdWjkduWCihlD1rSb_BqQI',
  authDomain: 'track-tracker-ca74a.firebaseapp.com',
  projectId: 'track-tracker-ca74a',
  messagingSenderId: '659715394517',
  appId: '1:659715394517:web:5e02f9a2e7541f92a68b5c',
});

const messaging = firebase.messaging();

// Background message handler — shows a system notification.
// This is called when a push message arrives while the app is in the background.
// The Edge Function sends data-only messages (no `notification` key), so we
// construct the notification manually from payload.data.
messaging.onBackgroundMessage((payload) => {
  // Data-only messages: all fields are in payload.data.
  // (Legacy notification-key messages: title/body also in payload.notification.)
  const saleId = payload.data?.saleId || '';
  const title = payload.notification?.title || payload.data?.title || 'عملية بيع جديدة';
  const body = payload.notification?.body || payload.data?.body || 'سجّل سائق عملية بيع جديدة';
  const icon = payload.notification?.icon || payload.data?.icon || '/icons/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    // Use saleId in the tag for browser-level dedup: if a notification with
    // the same tag is already visible, the browser replaces it instead of
    // showing a second one. This prevents duplicate notifications for the
    // same sale (e.g., if FCM re-delivers the message).
    tag: saleId ? 'sale-' + saleId : 'sale-' + Date.now(),
    data: payload.data,
  });
});

// Handle notification click — focus or open the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window client is already open, focus it.
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window.
      return self.clients.openWindow('/');
    })
  );
});
