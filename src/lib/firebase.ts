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
import { logger } from "@/lib/logger";
import { initAppCheck } from "@/lib/appCheck";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};

export const app = initializeApp(firebaseConfig);

// App Check runs BEFORE Firestore / Storage / Functions handles are
// created — the first call into those services triggers the App
// Check token request, so we need the provider installed by then.
// See src/lib/appCheck.ts for the web / native split.
initAppCheck(app);

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
  logger.warn(
    "[Firebase] VITE_FIREBASE_STORAGE_BUCKET is not set — file uploads will fail."
  );
}
export const functions = getFunctions(app);

// Connect to emulators when the build sets VITE_USE_EMULATORS=true.
// Previously this also required `import.meta.env.DEV`, which scoped
// it to `npm run dev` only — CI's `npm run build` runs in
// production mode, so the gate never fired even when CI explicitly
// wanted emulator wiring. Dropping the DEV check lets the
// preview-built E2E suite point Firebase at the emulators by
// passing VITE_USE_EMULATORS=true at build time.
//
// Production builds without the flag set are unaffected — the
// emulator-connect calls only fire when the env var is the
// literal string "true".
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
