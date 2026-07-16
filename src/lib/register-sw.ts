import { toast } from "@/lib/toast";
import { logger } from "./logger";
import { isNativePlatform } from "./platform";
import {
  APP_SERVICE_WORKER_SCOPE,
  APP_SERVICE_WORKER_URL,
} from "./firebaseConfig";

/**
 * Canonical service-worker registration (packet 17).
 *
 * ONE worker for the application scope: public/sw.js with the public Firebase
 * config in its query string (offline caching + FCM background handler in one
 * worker). Previously offline caching (sw.js) and background push
 * (firebase-messaging-sw.js) registered two different scripts at the SAME
 * default scope, so they replaced/updated one registration depending on timing.
 * Every getToken() call must receive THIS ServiceWorkerRegistration; never rely
 * on Firebase's implicit default-worker lookup.
 */

const wiredRegistrations = new WeakSet<ServiceWorkerRegistration>();

export async function clearSWCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
    logger.log("SW caches cleared");
  } catch {
    // Best-effort cache recovery must never block a reload.
  }
}

function wireRegistration(registration: ServiceWorkerRegistration): void {
  if (wiredRegistrations.has(registration)) return;
  wiredRegistrations.add(registration);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      registration.update().catch(() => {});
    }
  });

  const wireUpdateToast = (worker: ServiceWorker | null) => {
    // Only a real UPDATE has a previous active worker being replaced; a
    // brand-new install has no active worker, so it must not toast.
    const isUpdate = Boolean(registration.active);
    if (!worker) return;
    worker.addEventListener("statechange", () => {
      if (worker.state !== "activated" || !isUpdate) return;
      void clearSWCaches();
      toast("New version available", {
        action: {
          label: "Refresh",
          onClick: () => window.location.reload(),
        },
        // Finite on purpose — an Infinity toast parked over the nav bar and
        // ate taps on iOS. The prompt is a convenience, not a gate.
        duration: 10_000,
      });
    });
  };

  registration.addEventListener("updatefound", () => {
    wireUpdateToast(registration.installing);
  });
  wireUpdateToast(registration.installing);
}

async function waitForCanonicalActivation(
  registration: ServiceWorkerRegistration
): Promise<void> {
  const expectedScriptUrl = new URL(
    APP_SERVICE_WORKER_URL,
    window.location.href
  ).href;

  if (registration.active?.scriptURL === expectedScriptUrl) return;

  // register() can resolve while the replacement worker is still installing.
  // This short yield makes the worker visible on browsers that publish the
  // registration before setting .installing or .waiting.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  const worker = registration.installing ?? registration.waiting;
  if (!worker) {
    if (registration.active?.scriptURL === expectedScriptUrl) return;
    throw new Error("Canonical service worker did not begin installation.");
  }

  await new Promise<void>((resolve, reject) => {
    const onStateChange = () => {
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      } else if (worker.state === "redundant") {
        worker.removeEventListener("statechange", onStateChange);
        reject(new Error("Canonical service worker became redundant."));
      }
    };
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });

  if (registration.active?.scriptURL !== expectedScriptUrl) {
    throw new Error(
      "Canonical service worker activated with an unexpected script."
    );
  }
}

export async function getAppServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  if (isNativePlatform()) {
    throw new Error("Service workers are disabled on native platforms");
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are unavailable");
  }

  const registration = await navigator.serviceWorker.register(
    APP_SERVICE_WORKER_URL,
    { scope: APP_SERVICE_WORKER_SCOPE }
  );
  await waitForCanonicalActivation(registration);
  wireRegistration(registration);
  return registration;
}

export function registerServiceWorker(): void {
  if (isNativePlatform()) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  const register = () => {
    void getAppServiceWorkerRegistration()
      .then((registration) => {
        logger.log("SW registered:", registration.scope);
      })
      .catch((error) => {
        logger.log("SW registration failed:", error);
      });
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
