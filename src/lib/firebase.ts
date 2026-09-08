/**
 * The data-service handles: Firestore, Storage, Functions.
 *
 * `app`, `auth` and `firebaseConfig` now live in `firebaseApp.ts` and are
 * re-exported here, so every existing `import { auth, db } from
 * "@/lib/firebase"` keeps working. The split exists so that importing
 * AUTH alone does not drag the Firestore SDK onto the critical path —
 * see the header of `firebaseApp.ts` for why, and `eagerGraph.test.ts`
 * for the guard.
 *
 * Importing anything from THIS module pulls Firestore. That is correct
 * for a signed-in surface and wrong for the login screen; if you only
 * need `auth`, import from `@/lib/firebaseApp`.
 */
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { logger } from "@/lib/logger";
import { app, firebaseConfig } from "./firebaseApp";

// Re-exported so existing call sites are untouched by the split. App Check
// is installed by firebaseApp's module body, which runs before this one.
export { app, auth, firebaseConfig } from "./firebaseApp";

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

// Emulator wiring for the data services. Auth connects in firebaseApp.ts.
// Each handle is wired at its own module scope, so it is always connected
// before anything can use it.
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  // Storage too (Spc1 PR4) — photo uploads (space posts, food, profile)
  // were previously unverifiable in the emulator rig because the app
  // only wired auth + firestore.
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  // getFunctions() callers share this default-app instance. Emulator builds
  // must never fall through to cloud callables when a local service is absent.
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
