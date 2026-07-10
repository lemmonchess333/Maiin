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
const MAX_CACHE_ENTRIES = 150;

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
          .filter((key) => key !== CACHE_NAME)
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
  if (
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebase") ||
    url.hostname.includes("identitytoolkit") ||
    url.hostname.includes("openfoodfacts.org") ||
    url.hostname.includes("stripe.com") ||
    url.hostname.includes("generativelanguage")
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
