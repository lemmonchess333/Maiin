/**
 * FCM Web push — client token lifecycle (push arc #961, slice 3 / #965).
 *
 * Registers/revokes the device's FCM token against `users/{uid}/devices/{token}`
 * — the schema the server senders read. Privacy invariants (Q4, PR #820
 * lineage): **delete-on-signout** so account B on a shared device never gets
 * account A's pushes; prune-on-send-error is the sender's responsibility.
 *
 * All entry points are guarded: no-op when push is unsupported, the VAPID key
 * is absent, or permission isn't granted — so this is safe to call anywhere and
 * does nothing until the operator has provisioned the key (#963) and the user
 * has opted in (the priming UX is a separate slice; this is the plumbing).
 *
 * NOTE: the browser glue (getToken, SW registration, actual delivery) is only
 * verifiable on a real device with notifications allowed — that's the #965
 * tracer step. The unit tests cover the token-doc lifecycle + the guards.
 */
import {
  getMessaging,
  getToken,
  deleteToken,
  isSupported,
} from "firebase/messaging";
import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { app, db, firebaseConfig } from "@/lib/firebase";
import { logger } from "@/lib/logger";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";

/** The FCM SW, with the public Firebase config passed as query params (the SW
 *  can't read import.meta.env). BASE_URL keeps it under the /Maiin/ scope. */
const SW_URL = `${import.meta.env.BASE_URL}firebase-messaging-sw.js?${new URLSearchParams(
  firebaseConfig as Record<string, string>
).toString()}`;

/** True only when FCM web push can actually work here AND the key is provisioned. */
export async function isPushSupported(): Promise<boolean> {
  if (!VAPID_KEY) return false;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

/**
 * Register this device for push and persist the token. Returns the token, or
 * null if anything blocks it (unsupported / no key / no permission / error).
 * Caller is responsible for having obtained permission first (priming UX).
 */
export async function registerDeviceToken(uid: string): Promise<string | null> {
  if (!uid) return null;
  if (!(await isPushSupported())) return null;
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return null;
  }
  try {
    const swReg = await navigator.serviceWorker.register(SW_URL);
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return null;
    await setDoc(
      doc(db, "users", uid, "devices", token),
      { token, platform: "web", updatedAt: serverTimestamp() },
      { merge: true }
    );
    return token;
  } catch (err) {
    logger.error("[push] registerDeviceToken failed", err);
    return null;
  }
}

/**
 * Revoke this device's token on sign-out (privacy invariant). Drops the
 * `devices/{token}` doc AND deletes the FCM token so the next account on this
 * device starts clean. Best-effort: never throws (sign-out must proceed).
 */
export async function unregisterDeviceToken(uid: string): Promise<void> {
  if (!uid) return;
  try {
    if (!(await isPushSupported())) return;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY }).catch(
      () => null
    );
    if (token) {
      await deleteDoc(doc(db, "users", uid, "devices", token)).catch(() => {});
    }
    await deleteToken(messaging).catch(() => {});
  } catch (err) {
    logger.error("[push] unregisterDeviceToken failed", err);
  }
}
