/**
 * FCM Web push — client token lifecycle (push arc #961, slice 3 / #965).
 *
 * Rebuild marker (2026-06-03): VITE_FIREBASE_VAPID_KEY is read at BUILD time,
 * so re-provisioning the secret needs a fresh Pages build to take effect —
 * this comment forces one. The public VAPID key must match the project's Web
 * Push certificate or Apple silently drops every push (FCM still reports
 * success). After deploy, devices must re-register to get a token subscribed
 * with the current key.
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
  onMessage,
} from "firebase/messaging";
import { doc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { app, db, firebaseConfig } from "@/lib/firebase";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { logger } from "@/lib/logger";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";

/** Notification icon (under the /Maiin/ base path), shared with the SW. */
const NOTIFICATION_ICON = `${import.meta.env.BASE_URL}icons/icon-192x192.png`;

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
 * Outcome of a registration attempt. `reason` lets the caller show the user
 * (and us) exactly where it broke instead of a silent null — important because
 * iOS web push fails in several quiet ways.
 */
export type PushRegisterResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: "no-uid" | "unsupported" | "no-permission" | "token-failed";
      detail?: string;
    };

/**
 * Register this device for push and persist the token. Caller must have
 * obtained permission first (priming UX / the Settings toggle).
 */
export async function registerDeviceToken(
  uid: string
): Promise<PushRegisterResult> {
  if (!uid) return { ok: false, reason: "no-uid" };
  if (!VAPID_KEY) {
    return { ok: false, reason: "unsupported", detail: "no VAPID key" };
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return { ok: false, reason: "unsupported", detail: "no serviceWorker" };
  }
  let supported = false;
  try {
    supported = await isSupported();
  } catch {
    supported = false;
  }
  if (!supported) {
    return {
      ok: false,
      reason: "unsupported",
      detail: "FCM isSupported() false",
    };
  }
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return { ok: false, reason: "no-permission" };
  }
  try {
    await navigator.serviceWorker.register(SW_URL);
    // iOS gotcha: getToken must run AFTER the SW is ACTIVE, not merely
    // registered — otherwise it fails/returns empty. `ready` resolves once the
    // active worker is controlling the page.
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token)
      return { ok: false, reason: "token-failed", detail: "empty token" };
    // Guarded (strips undefined) but NOT offline-queued: token
    // registration must hit the server immediately and must never
    // queue-and-replay under a later account on this device.
    // setDocGuarded calls fbSetDoc directly (no offline queue), so it's
    // the correct guarded path for a privacy-sensitive device-token write.
    await setDocGuarded(
      doc(db, "users", uid, "devices", token),
      { token, platform: "web", updatedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true, token };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[push] registerDeviceToken failed", err);
    return { ok: false, reason: "token-failed", detail };
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
      // Raw deleteDoc (no guarded wrapper exists for deletes, and a
      // delete carries no payload to strip). Crucially this is NOT
      // offline-queued: a sign-out token-revoke must never replay under
      // the NEXT account on a shared device — an immediate, fire-once
      // delete is exactly the privacy invariant this function exists for.
      await deleteDoc(doc(db, "users", uid, "devices", token)).catch(() => {});
    }
    await deleteToken(messaging).catch(() => {});
  } catch (err) {
    logger.error("[push] unregisterDeviceToken failed", err);
  }
}

/**
 * Render foreground pushes. When the app is in the FOREGROUND, FCM delivers the
 * message to the page's `onMessage` (NOT the SW's onBackgroundMessage) — so
 * without this handler a push that arrives while the app is open is silently
 * dropped (no banner, not even in Notification Centre). This shows it via the
 * active SW registration so it surfaces like any other notification.
 *
 * Idempotent + guarded: safe to call once on app boot. Returns an unsubscribe
 * (or a no-op when push is unsupported).
 */
let foregroundUnsub: (() => void) | null = null;
export async function listenForForegroundPush(): Promise<() => void> {
  if (foregroundUnsub) return foregroundUnsub;
  if (!(await isPushSupported())) return () => {};
  try {
    const reg = await navigator.serviceWorker.ready;
    foregroundUnsub = onMessage(getMessaging(app), (payload) => {
      const d = (payload && payload.data) || {};
      const title = d.title || payload?.notification?.title || "Tropos";
      const body = d.body || payload?.notification?.body || "";
      reg
        .showNotification(title, {
          body,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          data: d,
        })
        .catch((err) => logger.warn("[push] foreground showNotification", err));
    });
    return foregroundUnsub;
  } catch (err) {
    logger.error("[push] listenForForegroundPush failed", err);
    return () => {};
  }
}
