const CACHE_NAME = "tropos-v13";
// Per-deploy build stamp — scripts/stamp-sw.mjs replaces the placeholder at
// build time so EVERY deploy changes this file's bytes. Browsers only run the
// SW update cycle (→ the "New version available" refresh toast) when sw.js
// changes; before this stamp, only manual CACHE_NAME bumps triggered it and
// most deploys shipped silently to long-lived sessions.
const BUILD_STAMP = "__TROPOS_BUILD__";
void BUILD_STAMP;
// Derived from the SW's own URL so the one file works whether it's served at
// /Maiin/sw.js (GitHub Pages) or /sw.js (Firebase Hosting, served at root —
// which is what makes OAuth same-origin with the auth handler on iOS Safari).
const BASE_PATH = self.location.pathname.replace(/sw\.js$/, "");

// ── FCM background push (packet 17) ──────────────────────────────────────
// This canonical worker now also handles background push, so offline caching
// and FCM share ONE registration/scope. The notificationclick listener is
// installed BEFORE importScripts so a tap is never dropped while the Firebase
// Messaging library loads. Config travels in the worker URL's query string
// (a static worker can't read import.meta.env); a build with no Firebase
// config (or a temporarily-unreachable CDN) still installs for offline caching.
const ICON = BASE_PATH + "icons/icon-192x192.png";

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route =
    (event.notification.data && event.notification.data.route) || "/";
  const target = BASE_PATH.replace(/\/$/, "") + route;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ("focus" in client && client.url.includes(BASE_PATH)) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(target);
      })
  );
});

const fcmParams = new URL(self.location).searchParams;
const fcmConfig = {
  apiKey: fcmParams.get("apiKey") || "",
  authDomain: fcmParams.get("authDomain") || "",
  projectId: fcmParams.get("projectId") || "",
  storageBucket: fcmParams.get("storageBucket") || "",
  messagingSenderId: fcmParams.get("messagingSenderId") || "",
  appId: fcmParams.get("appId") || "",
};

if (
  fcmConfig.apiKey &&
  fcmConfig.projectId &&
  fcmConfig.messagingSenderId &&
  fcmConfig.appId
) {
  try {
    importScripts(
      "https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js"
    );
    importScripts(
      "https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js"
    );
    firebase.initializeApp(fcmConfig);
    firebase.messaging().onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const notification = payload.notification || {};
      const title = data.title || notification.title || "Tropos";
      self.registration.showNotification(title, {
        body: data.body || notification.body || "",
        icon: ICON,
        badge: ICON,
        data,
      });
    });
  } catch (error) {
    // FCM setup must not make offline caching unavailable if the CDN fails.
    console.warn("[push] FCM worker setup skipped", error);
  }
}

const MAX_CACHE_ENTRIES = 150;

// Public exercise art is downloaded on demand, separately from the app shell.
// Filenames may be reused, so the build stamp invalidates old artwork caches.
const ART_CACHE_NAME = `${CACHE_NAME}-form-art-${BUILD_STAMP}`;
const ART_MAX_ENTRIES = 48;
const ART_MAX_BYTES = 24 * 1024 * 1024;
const ART_MAX_FILE_BYTES = 2 * 1024 * 1024;
let artWriteQueue = Promise.resolve();

function storeFormArtwork(request, response) {
  // Serialize writes and eviction so parallel preloads cannot exceed the budget.
  artWriteQueue = artWriteQueue.catch(() => {}).then(async () => {
    if (response.status !== 200 || response.redirected ||
        !response.headers.get("content-type")?.startsWith("image/")) return;
    const data = await response.arrayBuffer();
    if (!data.byteLength || data.byteLength > ART_MAX_FILE_BYTES) return;
    const cache = await caches.open(ART_CACHE_NAME);
    const headers = new Headers(response.headers);
    headers.delete("content-encoding");
    headers.set("content-length", String(data.byteLength));
    headers.set("x-tropos-art-bytes", String(data.byteLength));
    await cache.delete(request);
    await cache.put(request, new Response(data, { status: 200, headers }));
    const keys = await cache.keys();
    const sizes = await Promise.all(keys.map(async (key) => {
      const entry = await cache.match(key);
      const size = Number(entry?.headers.get("x-tropos-art-bytes"));
      return Number.isFinite(size) && size > 0 ? size : ART_MAX_FILE_BYTES;
    }));
    let total = sizes.reduce((sum, size) => sum + size, 0);
    let count = keys.length;
    for (let i = 0; count > ART_MAX_ENTRIES || total > ART_MAX_BYTES; i++) {
      await cache.delete(keys[i]);
      total -= sizes[i];
      count--;
    }
  }).catch(() => {
    // Quota/storage failures must not prevent displaying a network response.
  });
  return artWriteQueue;
}

const STATIC_ASSETS = [
  BASE_PATH,
  BASE_PATH + "index.html",
  BASE_PATH + "manifest.json",
];

// Install: cache static assets. The HTML entries are fetched no-store so
// the precached SPA shell (the offline fallback) can't be a stale index
// pointing at deleted asset hashes — same staleness that blanks the app
// online (see the navigation handler).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(new Request(url, { cache: "no-store" }))
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: clean old caches and limit cache size
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ART_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => {
      // Trim cache to MAX_CACHE_ENTRIES
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.keys().then((requests) => {
          if (requests.length > MAX_CACHE_ENTRIES) {
            const toDelete = requests.slice(0, requests.length - MAX_CACHE_ENTRIES);
            return Promise.all(toDelete.map((req) => cache.delete(req)));
          }
        });
      });
    })
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip Firebase/API and external API requests
  const url = new URL(event.request.url);
  // Run before the broad Firebase-host skip: these are our own public files,
  // even on Firebase Hosting. No API, account data or external origin is cached.
  if (url.origin === self.location.origin &&
      url.pathname.startsWith(BASE_PATH + "form-frames/") &&
      /\.(webp|png|avif)$/.test(url.pathname)) {
    const task = (async () => {
      const cached = await caches.open(ART_CACHE_NAME)
        .then((cache) => cache.match(event.request)).catch(() => undefined);
      return { response: cached || await fetch(event.request, { cache: "no-cache" }), cached: Boolean(cached) };
    })();
    const write = task.then(({ response, cached }) =>
      cached ? undefined : storeFormArtwork(event.request, response.clone())
    ).catch(() => {});
    event.waitUntil(write);
    event.respondWith(task.then(({ response }) => response));
    return;
  }
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("openfoodfacts.org") ||
    url.hostname.includes("stripe.com") ||
    url.hostname.includes("generativelanguage") ||
    // Firebase EMULATOR suite (auth 9099 / firestore 8080 / storage
    // 9199): a loopback origin that is NOT the app's own origin. The
    // production skip-list above matches production hostnames only, so
    // emulator traffic used to fall through to the network-first branch
    // below — whose cache.put(clone) never resolves on a Firestore
    // WebChannel long-poll (an infinite stream), pinning that
    // connection until Chrome's 6-per-origin pool is exhausted and
    // every later emulator request hangs. Surfaced by the two-account
    // offline-queue E2E, the first spec to drive one browser context
    // through enough page sessions to drain the pool.
    (url.origin !== self.location.origin &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost"))
  ) {
    return;
  }

  // Stale-while-revalidate for fonts and images
  if (url.pathname.match(/\.(woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico|avif)$/)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.status === 200) cache.put(event.request, response.clone());
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Cache-first for Vite-hashed assets (immutable — URL changes when content changes)
  if (url.pathname.startsWith(BASE_PATH + "assets/")) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else (HTML navigations included). Use
  // `cache: "no-store"` so the browser HTTP cache can NEVER hand back a
  // stale index.html: a stale index references Vite asset hashes that the
  // latest deploy already replaced, so the entry chunk 404s and the app
  // boots to a blank screen (unrecoverable — the entry script isn't a lazy
  // chunk, so lazyRetry can't catch it). Always fetching a fresh document
  // guarantees its asset refs exist on the server. Falls back to the
  // cached index only when truly offline.
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;

          // For navigation requests, return the cached index.html (SPA)
          if (event.request.mode === "navigate") {
            return caches.match(BASE_PATH + "index.html");
          }

          return new Response("Offline", {
            status: 503,
            statusText: "Offline",
          });
        });
      })
  );
});

// Handle messages from clients
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
