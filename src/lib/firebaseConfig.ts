/**
 * Shared, pure Firebase web configuration (packet 17).
 *
 * Extracted from firebase.ts so both the app and the service-worker
 * registration derive the SAME config. The canonical worker (public/sw.js) is a
 * static file that cannot read import.meta.env, so the public web config is
 * passed to it as a query string on its script URL — the worker parses it back
 * out of self.location. The pathname stays "sw.js", so the registration scope
 * is still BASE_URL.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
} as const;

export const APP_SERVICE_WORKER_SCOPE = import.meta.env.BASE_URL;

export const APP_SERVICE_WORKER_URL =
  import.meta.env.BASE_URL +
  "sw.js?" +
  new URLSearchParams(firebaseConfig).toString();
