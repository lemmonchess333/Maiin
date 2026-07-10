import { toast } from "@/lib/toast";
import { logger } from "./logger";
import { isNativePlatform } from "./platform";

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

export function registerServiceWorker() {
  // Service workers can cause stale API responses and broken auth flows
  // inside native Capacitor shells — only register on web. Uses the
  // shared isNativePlatform() (Capacitor.isNativePlatform()); the old
  // `!!window.Capacitor` check was truthy on web too, so the SW was
  // never registering on web.
  if (isNativePlatform()) return;

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

          // Wire the update toast onto an installing worker. Extracted so
          // BOTH paths attach it: the updatefound event, and a worker whose
          // install was already in flight when we got here — on fast
          // networks the update check can complete before this .then()
          // runs, so listening for updatefound alone silently missed the
          // toast for that deploy (the register() call itself triggers the
          // very check whose event we were racing).
          const wireUpdateToast = (newWorker: ServiceWorker | null) => {
            // Only a real UPDATE has a previous active worker being
            // replaced. The old `navigator.serviceWorker.controller`
            // check inside statechange misfired on the very first
            // install: sw.js calls clients.claim(), which sets
            // .controller during activation — so a brand-new visitor
            // (or anyone who just cleared website data) got a bogus
            // "New version available" toast seconds after first paint.
            const isUpdate = !!registration.active;
            if (newWorker) {
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "activated" && isUpdate) {
                  // New SW activated — clear old caches and prompt refresh.
                  clearSWCaches();
                  toast("New version available", {
                    action: {
                      label: "Refresh",
                      onClick: () => window.location.reload(),
                    },
                    // Finite on purpose. duration: Infinity parked this
                    // toast over the bottom tab bar forever (pre-
                    // mobileOffset fix it sat ON the nav and ate every
                    // tap — "app navigation dead on iOS"). The prompt is
                    // a convenience, not a gate: the new SW is already
                    // active and any later cold start gets the new
                    // bundle without it.
                    duration: 10_000,
                  });
                }
              });
            }
          };

          // Path 1: an update discovered after this point.
          registration.addEventListener("updatefound", () =>
            wireUpdateToast(registration.installing)
          );
          // Path 2: an update whose install already started (the race).
          wireUpdateToast(registration.installing);
        })
        .catch((error) => {
          logger.log("SW registration failed:", error);
        });
    });
  }
}
