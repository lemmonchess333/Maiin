import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/* Retry wrapper for lazy imports — handles stale cache serving old
   HTML that references chunk hashes that no longer exist after a
   deploy. Also catches "Failed to fetch dynamically imported module"
   errors from stale Service Worker caches.

   Extracted from App.tsx (where it lived for page-level lazy loads)
   so sub-component lazy loads (e.g. Social.tsx's FullLeaderboard /
   ChallengeList per Soc5 item 10) can share the same chunk-error
   recovery path. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends { default: ComponentType<any> }>(
  factory: () => Promise<T>
): LazyExoticComponent<T["default"]> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      const isChunkError =
        message.includes("Failed to fetch dynamically imported module") ||
        message.includes("Importing a module script failed") ||
        message.includes("error loading dynamically imported module") ||
        message.includes("Loading chunk") ||
        message.includes("Loading CSS chunk");

      if (isChunkError) {
        // Clear SW caches so the next reload fetches fresh assets
        if ("caches" in window) {
          caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
        }
        // Only auto-reload once per session to avoid infinite loops
        const key = "chunk-retry";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          window.location.reload();
          // Return a never-resolving promise to prevent React from rendering
          // the error while the page is reloading
          return new Promise<T>(() => {});
        }
      }
      throw err;
    })
  );
}
