const CACHE_NAME = "tropos-v12";
const BASE_PATH = "/Maiin/";
const MAX_CACHE_ENTRIES = 150;

const STATIC_ASSETS = [
  BASE_PATH,
  BASE_PATH + "index.html",
  BASE_PATH + "manifest.json",
];

// Install: cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
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

  // Network-first for everything else
  event.respondWith(
    fetch(event.request)
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
