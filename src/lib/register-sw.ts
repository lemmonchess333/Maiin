import { toast } from "sonner";

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/Maiin/sw.js")
        .then((registration) => {
          console.log("SW registered:", registration.scope);

          // Check for updates every 60 minutes
          setInterval(() => {
            registration.update().catch(() => {});
          }, 60 * 60 * 1000);

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
          console.log("SW registration failed:", error);
        });
    });
  }
}
