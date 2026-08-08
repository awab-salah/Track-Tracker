/**
 * Firebase Cloud Messaging — Service Worker for background push.
 *
 * This file is imported by the Workbox-generated service worker via
 * `importScripts` (configured in vite.config.ts workbox.importScripts).
 * It handles push messages from FCM when the app is not in the
 * foreground (browser tab closed or minimized).
 *
 * This MUST be plain JS (no TypeScript, no ESM imports) because it runs
 * inside the service worker context and is loaded via importScripts.
 */

// ── Handle incoming push messages ─────────────────────────────────────────────
self.addEventListener('push', function(event) {
  var payload;
  try {
    payload = event.data ? event.data.json() : null;
  } catch (e) {
    payload = null;
  }
  if (!payload) return;

  // FCM HTTP v1 API sends the data payload under `payload.data`
  var data = payload.data || {};
  var title = data.title || 'عملية بيع جديدة';
  var body = data.body || '';
  var icon = data.icon || '/icons/icon-192.png';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: icon,
      // Use a unique tag so each sale gets its own notification
      // (instead of replacing the previous one).
      tag: 'sale-' + Date.now()
    })
  );
});

// ── Handle notification click ─────────────────────────────────────────────────
// When the user clicks the notification, focus or open the app.
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      // If the app is already open in a tab, focus it.
      if (windowClients.length > 0) {
        return windowClients[0].focus();
      }
      // Otherwise, open a new tab.
      return self.clients.openWindow('/');
    })
  );
});
