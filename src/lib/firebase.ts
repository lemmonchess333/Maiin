import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { logger } from "@/lib/logger";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};


const app = initializeApp(firebaseConfig);

/**
 * Firebase App Check — verifies traffic genuinely comes from the
 * Tropos app and not a scraped client, curl, or malicious third
 * party. On the web we use reCAPTCHA v3 (invisible, no user
 * interaction); on native iOS/Android the Capacitor shell should
 * switch to App Attest / DeviceCheck via a native provider (not
 * wired in this session — tracked as follow-up).
 *
 * Initialised AS EARLY AS POSSIBLE — before Firestore / Storage /
 * Functions are used — because the first call into those services
 * triggers the App Check token request. Gated on the reCAPTCHA site
 * key env var being present so local dev without a key doesn't
 * break startup; in that case writes still work but are unverified
 * (enforcement is configured per-service in the Firebase console).
 *
 * Dev-mode debug token: set VITE_APP_CHECK_DEBUG_TOKEN to a value
 * printed from the Firebase console to bypass App Check in local
 * development. Never set this in production.
 */
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
const appCheckDebugToken = import.meta.env.VITE_APP_CHECK_DEBUG_TOKEN;
if (appCheckDebugToken && typeof self !== "undefined") {
  // Firebase SDK reads this from a global; setting it before
  // initializeAppCheck enables debug-provider tokens in dev.
  (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
}
if (recaptchaSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // Initialization can throw if called twice in HMR scenarios —
    // safe to ignore since the first init wins.
    logger.warn("[Firebase] App Check init failed (likely HMR re-run):", e);
  }
} else if (!import.meta.env.DEV) {
  logger.warn(
    "[Firebase] VITE_RECAPTCHA_V3_SITE_KEY is not set — App Check is disabled. Enable it in the Firebase console + set the env var before production deploy.",
  );
}

export const auth = getAuth(app);

// Try persistent cache first; fall back to memory cache if IndexedDB is unavailable
// (e.g. Safari private browsing, restricted environments)
let db_: ReturnType<typeof initializeFirestore>;
try {
  db_ = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (e) {
  logger.warn("Persistent cache unavailable, falling back to memory cache:", e);
  db_ = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}
export const db = db_;

export const storage = getStorage(app);
if (!firebaseConfig.storageBucket) {
  logger.warn('[Firebase] VITE_FIREBASE_STORAGE_BUCKET is not set — file uploads will fail.');
}
export const functions = getFunctions(app);

// Connect to emulators in development
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}
