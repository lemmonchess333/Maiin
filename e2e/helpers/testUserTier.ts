/**
 * Make the seeded test user Pro for the length of one capture, then free
 * again. The seed makes it free, and some screens draw their Pro half only
 * for Pro: since whole-app grill Q84 the charts older than 3 months and the
 * performance score's details are Pro. Specs that film those call this in
 * a try/finally so the next spec meets the account as seeded.
 */
import {
  deleteApp,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { TEST_USER } from "./auth";

const APP_NAME = "test-user-tier";

function adminApp(): App {
  return (
    getApps().find((app) => app.name === APP_NAME) ??
    initializeApp({ projectId: "demo-tropos" }, APP_NAME)
  );
}

export async function setTestUserTier(tier: "pro" | "free"): Promise<void> {
  const app = adminApp();
  const { uid } = await getAuth(app).getUserByEmail(TEST_USER.email);
  await getFirestore(app)
    .collection("users")
    .doc(uid)
    .set({ subscriptionTier: tier }, { merge: true });
  if (tier === "free") await deleteApp(app);
}
