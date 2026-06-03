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

// We send DATA-ONLY messages (no top-level `notification` field) so this
// handler is reliably invoked on iOS PWAs — FCM's auto-display of
// `notification` messages doesn't fire onBackgroundMessage there, so nothing
// would show. Title/body therefore arrive in `data`. Falls back to the
// `notification` field for any legacy/auto-display payloads.
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
