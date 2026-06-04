import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LazyMotion } from "framer-motion";
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

// P1 perf: load framer-motion's full feature set (domMax — incl. drag/layout)
// as an async chunk after first paint. `strict` makes any stray real `motion`
// proxy throw (all usages are the lightweight `m`, aliased as `motion`).
const loadMotionFeatures = () =>
  import("./lib/motionFeatures").then((mod) => mod.default);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LazyMotion features={loadMotionFeatures} strict>
      <App />
    </LazyMotion>
  </StrictMode>
);

// Register service worker for offline support
registerServiceWorker();

// Attach window.error and unhandledrejection listeners. captureError is
// already called at known failure sites throughout the app; this catches
// the long tail of uncaught errors that would otherwise never reach
// errorReporting's Firestore sink.
initErrorMonitoring();
