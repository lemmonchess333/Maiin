/**
 * FCM Web push — background message handler (push arc #961, slice 3 / #965).
 *
 * Static service worker: it CANNOT read import.meta.env, so the registering
 * client passes the (all-public) Firebase config as URL search params — see
 * src/lib/pushNotifications.ts. Uses the firebase compat SDK because a service
 * worker can't consume the modular bundle. Pinned to the firebase version in
 * package.json (12.14.0).
 *
 * Payloads carry only generic copy + data { type, route } for deep-linking —
 * no PII / health data (Q7 locked: payloads transit FCM + show on lock screens).
 */
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
const ICON = "/Maiin/icons/icon-192x192.png";

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const title = n.title || "Tropos";
  self.registration.showNotification(title, {
    body: n.body || "",
    icon: ICON,
    badge: ICON,
    data: payload.data || {},
  });
});

// Deep-link on tap via data.route; focus an open tab if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route =
    (event.notification.data && event.notification.data.route) || "/";
  const target = "/Maiin" + route;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        for (const w of wins) {
          if ("focus" in w && w.url.includes("/Maiin")) return w.focus();
        }
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});
