import { toast } from "sonner";
import { logger } from "./logger";

/**
 * Clear all SW caches. Called when a chunk load fails to ensure
 * the next page load fetches fresh assets from the server.
 */
export async function clearSWCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
    logger.log("SW caches cleared");
  } catch {
    // Best-effort — ignore failures
  }
}

/** Detect if running inside a native Capacitor shell (iOS/Android) */
function isNativeApp(): boolean {
  return typeof window !== "undefined" && !!(window as unknown as Record<string, unknown>).Capacitor;
}

export function registerServiceWorker() {
  // Service workers can cause stale API responses and broken auth flows
  // inside native Capacitor shells — only register on web.
  if (isNativeApp()) return;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register(`${import.meta.env.BASE_URL}sw.js`)
        .then((registration) => {
          logger.log("SW registered:", registration.scope);

          // Check for updates when page becomes visible (avoids leaked interval)
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              registration.update().catch(() => {});
            }
          });

          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (
                  newWorker.state === "activated" &&
                  navigator.serviceWorker.controller
                ) {
                  // New SW activated — clear old caches and prompt refresh
                  clearSWCaches();
                  toast("New version available", {
                    action: {
                      label: "Refresh",
                      onClick: () => window.location.reload(),
                    },
                    duration: Infinity,
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          logger.log("SW registration failed:", error);
        });
    });
  }
}
