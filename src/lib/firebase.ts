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

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyB-JX_RC7zxR6WopylzqG3B0RFzX32zjic",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "adaptive-fitness-af8bb.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "adaptive-fitness-af8bb",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "adaptive-fitness-af8bb.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "110047207547",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:110047207547:web:04c99eb6c034e0f6cc02de",
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
  console.warn("Persistent cache unavailable, falling back to memory cache:", e);
  db_ = initializeFirestore(app, {
    localCache: memoryLocalCache(),
  });
}
export const db = db_;

export const storage = getStorage(app);

// Connect to emulators in development
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}
