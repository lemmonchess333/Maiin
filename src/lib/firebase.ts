import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  enableMultiTabIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-JX_RC7zxR6WopylzqG3B0RFzX32zjic",
  authDomain: "adaptive-fitness-af8bb.firebaseapp.com",
  projectId: "adaptive-fitness-af8bb",
  storageBucket: "adaptive-fitness-af8bb.firebasestorage.app",
  messagingSenderId: "110047207547",
  appId: "1:110047207547:web:04c99eb6c034e0f6cc02de",
  measurementId: "G-LNJVR4L2SL",
};


const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Firestore persistence unavailable: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Firestore persistence unavailable: browser not supported");
  }
});

// Connect to emulators in development
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
}
