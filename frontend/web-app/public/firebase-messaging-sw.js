// Firebase Cloud Messaging Service Worker
// This file MUST be named 'firebase-messaging-sw.js' and placed in the /public directory.
// It handles push notifications when the app is in the background or the tab is closed.
//
// ⚠️  DO NOT hardcode credentials here.
// Values like __VITE_FIREBASE_API_KEY__ are automatically replaced at build/dev time
// by the custom Vite plugin in vite.config.ts using your .env file.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function (payload) {
  console.log('[SW] Received background message ', payload);

  const notificationTitle = payload.notification?.title || 'Transport System';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: payload.data,
    // Add action buttons depending on notification type
    actions: payload.data?.type === 'seat_alert' ? [
      { action: 'book', title: '🎟️ Book Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ] : [],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  const urlToOpen = event.notification.data?.type === 'seat_alert'
    ? '/explore'
    : '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      // Focus if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
