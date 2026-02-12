import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB-JX_RC7zxR6WopylzqG3B0RFzX32zjic",
  authDomain: "adaptive-fitness-af8bb.firebaseapp.com",
  projectId: "adaptive-fitness-af8bb",
  storageBucket: "adaptive-fitness-af8bb.firebasestorage.app",
  messagingSenderId: "110047207547",
  appId: "1:110047207547:web:04c99eb6c034e0f6cc02de",
  measurementId: "G-LNJVR4L2SL"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
