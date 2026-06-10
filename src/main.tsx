import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (was Google Fonts CDN). Variable wght axis, latin
// subset fetched on demand via unicode-range. Bundled by Vite (hashed,
// same-origin) so the service worker's stale-while-revalidate caches
// them for offline, and no third-party request leaks the user's IP to
// Google on every load. @font-face families: "Plus Jakarta Sans
// Variable" / "JetBrains Mono Variable" (referenced in index.css).
import "@fontsource-variable/plus-jakarta-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./index.css";
import App from "./App.tsx";
import { registerServiceWorker } from "./lib/register-sw";
import { initErrorMonitoring } from "./lib/errorReporting";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker for offline support
registerServiceWorker();

// Attach window.error and unhandledrejection listeners. captureError is
// already called at known failure sites throughout the app; this catches
// the long tail of uncaught errors that would otherwise never reach
// errorReporting's Firestore sink.
initErrorMonitoring();

// Dev/test-only brand font bake-off override. The dynamic import inside this
// MODE guard (and the candidate font it pulls in) is dead-code-eliminated
// from the real production build (mode "production"); it runs in `vite dev`
// and the e2e/test build so the rig can mock font combos on real screens.
if (import.meta.env.MODE !== "production") {
  import("./dev/fontBakeoff").then((m) => m.initFontBakeoff()).catch(() => {});
}
