/**
 * troposfit.com's service worker since App1 Q52: the one that retires the
 * app's.
 *
 * The website serves no app, but a browser that used the web app here
 * still holds its worker (public/sw.js, or the older
 * public/firebase-messaging-sw.js), with the app's caches and a push
 * subscription whose taps would open the website. A browser checks its
 * worker's script for changes when it next opens a page here, finds this
 * one at the same address, and installs it. Activated, it deletes every
 * cache this origin holds and unregisters itself, which ends its push
 * subscription. Pages already open keep running until they reload; the
 * next load has no worker at all.
 *
 * It has no fetch handler, so it never answers a request. The Hosting
 * build writes it at both workers' addresses
 * (scripts/website/websiteEntry.ts). The Pages build and the iPhone app
 * keep the real worker.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
      await self.registration.unregister();
    })()
  );
});
