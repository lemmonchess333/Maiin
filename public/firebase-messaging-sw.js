/**
 * FCM Web push — LEGACY background message handler (push arc #961, slice 3).
 *
 * Retained during the packet-17 service-worker migration: old app shells may
 * still request this script until they reload the new canonical sw.js. New
 * client code never registers this file. Do NOT delete it in this release —
 * removing it mid-migration would create a background-delivery gap.
 *
 * Static service worker: it CANNOT read import.meta.env, so the registering
 * client passes the (all-public) Firebase config as URL search params. Uses the
 * firebase compat SDK (a service worker can't consume the modular bundle),
 * pinned to the firebase version in package.json (12.14.0).
 *
 * notificationclick + BASE_PATH/ICON are declared BEFORE importScripts so a tap
 * is never dropped while the Firebase Messaging library loads.
 */
const BASE_PATH = self.location.pathname.replace(
  /firebase-messaging-sw\.js$/,
  ""
);
const ICON = BASE_PATH + "icons/icon-192x192.png";

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route =
    (event.notification.data && event.notification.data.route) || "/";
  // BASE_PATH keeps the trailing slash; route is leading-slash, so trim one.
  const target = BASE_PATH.replace(/\/$/, "") + route;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ("focus" in w && w.url.includes(BASE_PATH)) return w.focus();
        }
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});

importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js"
);

const params = new URL(self.location).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

// DATA-ONLY messages (no top-level `notification`) so this handler is reliably
// invoked on iOS PWAs — FCM's auto-display of `notification` messages doesn't
// fire onBackgroundMessage there. Title/body arrive in `data`.
messaging.onBackgroundMessage((payload) => {
  const d = payload.data || {};
  const n = payload.notification || {};
  const title = d.title || n.title || "Tropos";
  self.registration.showNotification(title, {
    body: d.body || n.body || "",
    icon: ICON,
    badge: ICON,
    data: d,
  });
});
