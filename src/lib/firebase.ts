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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
};


const app = initializeApp(firebaseConfig);
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
