import { toast } from "sonner";
import { logger } from "./logger";

export function registerServiceWorker() {
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
