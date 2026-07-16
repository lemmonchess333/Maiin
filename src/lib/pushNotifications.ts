/**
 * FCM Web push — client token lifecycle (packets 17 + 19).
 *
 * The client NO LONGER writes users/{uid}/devices directly. Registration and
 * revocation go through server callables (claimPushDeviceToken /
 * releasePushDeviceToken) that make Cloud Functions the single owner of the
 * token↔account binding — see functions/lib/pushTokenOwnership.js. Each
 * registration mints a fresh opaque binding id, persisted BEFORE the claim
 * request so an outgoing-Auth revoke can fence a claim whose network response
 * hasn't returned yet. `ownerUid` is an intent fence: the callable rejects if
 * Firebase Auth changed between the client-side check and the SDK attaching
 * credentials.
 *
 * All entry points are guarded: no-op when push is unsupported, the VAPID key
 * is absent, or permission isn't granted. Every getToken() call receives the
 * canonical service-worker registration (register-sw.ts) — never Firebase's
 * implicit default-worker lookup.
 */
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, getDoc } from "firebase/firestore";
import { app, auth, db } from "@/lib/firebase";
import { logger } from "@/lib/logger";
import { DEFAULT_PUSH_CONSENT, type PushConsent } from "@/lib/pushConsent";
import { getAppServiceWorkerRegistration } from "@/lib/register-sw";

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "";
const NOTIFICATION_ICON = `${import.meta.env.BASE_URL}icons/icon-192x192.png`;

// ── token-lifecycle generation ──────────────────────────────────────────
// Bumped on every account transition; async continuations captured under an
// old generation abort rather than writing under a new account.
let tokenLifecycleGeneration = 0;
let foregroundUnsub: (() => void) | null = null;

function isCurrentUser(uid: string, generation?: number): boolean {
  return (
    auth.currentUser?.uid === uid &&
    (generation === undefined || generation === tokenLifecycleGeneration)
  );
}

export function invalidatePushTokenLifecycle(): void {
  tokenLifecycleGeneration += 1;
}

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

export type PushRegisterResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | "no-uid"
        | "unsupported"
        | "no-permission"
        | "token-failed"
        | "account-changed";
      detail?: string;
    };

// ── server-owned binding storage (packet 19) ────────────────────────────
type StoredDeviceBinding = {
  token: string;
  bindingId: string;
};

type PushTokenCallableInput = {
  ownerUid: string;
  token: string;
  platform: "web";
  bindingId: string;
};

const DEVICE_TOKEN_STORAGE_KEY = "tropos_fcm_device_tokens:v2";
const LEGACY_DEVICE_TOKEN_STORAGE_KEY = "tropos_fcm_device_tokens:v1";
const skipServerReleaseForDeletedAccount = new Set<string>();
const pendingRegistrations = new Map<string, Promise<PushRegisterResult>>();

const claimPushDeviceToken = httpsCallable<
  PushTokenCallableInput,
  { claimed: boolean }
>(getFunctions(), "claimPushDeviceToken");

const releasePushDeviceToken = httpsCallable<
  PushTokenCallableInput,
  { released: boolean }
>(getFunctions(), "releasePushDeviceToken");

function isStoredDeviceBinding(value: unknown): value is StoredDeviceBinding {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as StoredDeviceBinding).token === "string" &&
    (value as StoredDeviceBinding).token.length > 0 &&
    typeof (value as StoredDeviceBinding).bindingId === "string" &&
    /^[A-Za-z0-9_-]{16,128}$/.test((value as StoredDeviceBinding).bindingId)
  );
}

function readStoredDeviceBindings(): Record<string, StoredDeviceBinding> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        ([uid, binding]) => uid.length > 0 && isStoredDeviceBinding(binding)
      )
    ) as Record<string, StoredDeviceBinding>;
  } catch {
    return {};
  }
}

function writeStoredDeviceBindings(
  bindings: Record<string, StoredDeviceBinding>
): void {
  if (typeof window === "undefined") return;
  try {
    const cleaned = Object.fromEntries(
      Object.entries(bindings).filter(
        ([uid, binding]) => uid.length > 0 && isStoredDeviceBinding(binding)
      )
    );
    // Legacy values lack a binding id and must never be used for an unfenced
    // release. Fresh registration migrates the server document instead.
    window.localStorage.removeItem(LEGACY_DEVICE_TOKEN_STORAGE_KEY);
    if (Object.keys(cleaned).length === 0) {
      window.localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      DEVICE_TOKEN_STORAGE_KEY,
      JSON.stringify(cleaned)
    );
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
  }
}

function newBindingId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

function sameBinding(
  left: StoredDeviceBinding | undefined,
  right: StoredDeviceBinding
): boolean {
  return (
    !!left && left.token === right.token && left.bindingId === right.bindingId
  );
}

function claimBinding(
  uid: string,
  binding: StoredDeviceBinding
): Promise<void> {
  return claimPushDeviceToken({
    ownerUid: uid,
    token: binding.token,
    platform: "web",
    bindingId: binding.bindingId,
  }).then(() => undefined);
}

function releaseBinding(
  uid: string,
  binding: StoredDeviceBinding
): Promise<void> {
  return releasePushDeviceToken({
    ownerUid: uid,
    token: binding.token,
    platform: "web",
    bindingId: binding.bindingId,
  }).then(() => undefined);
}

export async function waitForPendingPushRegistration(
  uid: string
): Promise<void> {
  const pending = pendingRegistrations.get(uid);
  if (pending) await pending;
}

function removeBindingIfStillCurrent(
  uid: string,
  binding: StoredDeviceBinding,
  generation: number
): void {
  if (!isCurrentUser(uid, generation)) return;
  const latest = readStoredDeviceBindings();
  if (!sameBinding(latest[uid], binding)) return;
  delete latest[uid];
  writeStoredDeviceBindings(latest);
}

// ── registration (serialised per uid) ───────────────────────────────────
export function registerDeviceToken(uid: string): Promise<PushRegisterResult> {
  const existing = pendingRegistrations.get(uid);
  if (existing) return existing;

  const operation = registerDeviceTokenInternal(uid);
  pendingRegistrations.set(uid, operation);
  const clear = () => {
    if (pendingRegistrations.get(uid) === operation) {
      pendingRegistrations.delete(uid);
    }
  };
  void operation.then(clear, clear);
  return operation;
}

async function registerDeviceTokenInternal(
  uid: string
): Promise<PushRegisterResult> {
  if (!uid) return { ok: false, reason: "no-uid" };
  const generation = tokenLifecycleGeneration;
  if (!isCurrentUser(uid, generation)) {
    return { ok: false, reason: "account-changed" };
  }
  if (!(await isPushSupported())) {
    return { ok: false, reason: "unsupported" };
  }
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return { ok: false, reason: "no-permission" };
  }

  try {
    const registration = await getAppServiceWorkerRegistration();
    const token = await getToken(getMessaging(app), {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) {
      return { ok: false, reason: "token-failed", detail: "empty token" };
    }
    if (!isCurrentUser(uid, generation)) {
      return { ok: false, reason: "account-changed" };
    }

    const previous = readStoredDeviceBindings()[uid];
    if (previous) {
      // If a prior request is still in flight, this writes its durable fence
      // before a new binding can replace it.
      await releaseBinding(uid, previous);
      removeBindingIfStillCurrent(uid, previous, generation);
      if (!isCurrentUser(uid, generation)) {
        return { ok: false, reason: "account-changed" };
      }
    }

    const binding: StoredDeviceBinding = { token, bindingId: newBindingId() };
    const latest = readStoredDeviceBindings();
    latest[uid] = binding;
    // Persist the intent BEFORE the callable. Auth pre-revoke can now fence a
    // claim even when its response is lost or Firebase Auth is about to switch.
    writeStoredDeviceBindings(latest);

    await claimBinding(uid, binding);
    if (!isCurrentUser(uid, generation)) {
      return { ok: false, reason: "account-changed" };
    }
    return { ok: true, token };
  } catch (error) {
    if (!isCurrentUser(uid, generation)) {
      return { ok: false, reason: "account-changed" };
    }
    const detail = error instanceof Error ? error.message : String(error);
    logger.error("[push] registerDeviceToken failed", error);
    return { ok: false, reason: "token-failed", detail };
  }
}

/**
 * Release this device's token. THROWS on a failed server release — the
 * AuthProvider treats that as a fail-closed barrier before an app-controlled
 * credential replacement (do not proceed to sign in account B while account A's
 * device binding might still be live). Settings can catch it and show a
 * retryable error without changing Auth.
 */
export async function unregisterDeviceToken(uid: string): Promise<void> {
  if (!uid || !isCurrentUser(uid)) return;
  const generation = tokenLifecycleGeneration;

  if (skipServerReleaseForDeletedAccount.delete(uid)) {
    // Account deletion already removed the canonical record server-side.
    return;
  }

  let messaging: ReturnType<typeof getMessaging> | null = null;
  let binding = readStoredDeviceBindings()[uid];
  try {
    if (await isPushSupported()) {
      messaging = getMessaging(app);
      if (!binding && isCurrentUser(uid, generation)) {
        const registration = await getAppServiceWorkerRegistration();
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: registration,
        }).catch(() => null);
        if (token && isCurrentUser(uid, generation)) {
          binding = { token, bindingId: newBindingId() };
          const latest = readStoredDeviceBindings();
          latest[uid] = binding;
          writeStoredDeviceBindings(latest);
          // An unbound legacy token is first claimed with a fresh fence, then
          // released. Do not issue an unfenced delete for it.
          await claimBinding(uid, binding);
        }
      }
    }

    if (binding) {
      await releaseBinding(uid, binding);
      removeBindingIfStillCurrent(uid, binding, generation);
    }
  } catch (error) {
    // Preserve the binding; a later same-account session can retry safely.
    logger.error("[push] unregisterDeviceToken failed", error);
    throw error;
  }

  // Server release is the Auth safety barrier. Once it has succeeded, a
  // browser-local deleteToken failure must not strand the user on the old
  // account; the canonical server binding is already gone.
  if (messaging && isCurrentUser(uid, generation)) {
    try {
      await deleteToken(messaging);
    } catch (error) {
      logger.warn(
        "[push] local FCM token deletion failed after release",
        error
      );
    }
  }
}

export async function discardDeletedAccountPushState(
  uid: string
): Promise<void> {
  if (!uid) return;
  const bindings = readStoredDeviceBindings();
  delete bindings[uid];
  writeStoredDeviceBindings(bindings);
  // The deletion executor has removed the server claim and its tombstone will
  // reject future callables. Mark the immediate Auth sign-out to skip a
  // fallback claim/release attempt against that tombstone.
  skipServerReleaseForDeletedAccount.add(uid);
  try {
    if (await isPushSupported()) {
      await deleteToken(getMessaging(app));
    }
  } catch (error) {
    logger.warn("[push] deleted-account local token cleanup failed", error);
  }
}

/**
 * Non-prompting refresh: only refreshes a token when stored server consent is
 * enabled AND browser permission is already granted (never prompts).
 */
export async function refreshDeviceTokenForCurrentUser(
  uid: string
): Promise<void> {
  if (!uid || !isCurrentUser(uid)) return;
  try {
    const snapshot = await getDoc(doc(db, "users", uid, "settings", "push"));
    if (!isCurrentUser(uid)) return;

    const consent: PushConsent = {
      ...DEFAULT_PUSH_CONSENT,
      ...(snapshot.exists() ? (snapshot.data() as Partial<PushConsent>) : {}),
    };
    if (!consent.enabled) return;
    await registerDeviceToken(uid);
  } catch (error) {
    logger.warn("[push] token refresh failed", error);
  }
}

export async function listenForForegroundPush(): Promise<() => void> {
  if (foregroundUnsub) {
    return () => stopListeningForForegroundPush();
  }
  if (!(await isPushSupported())) {
    return () => {};
  }

  try {
    const registration = await getAppServiceWorkerRegistration();
    foregroundUnsub = onMessage(getMessaging(app), (payload) => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || "Tropos";
      const body = data.body || payload.notification?.body || "";
      registration
        .showNotification(title, {
          body,
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
          data,
        })
        .catch((error) => {
          logger.warn("[push] foreground showNotification", error);
        });
    });
    return () => stopListeningForForegroundPush();
  } catch (error) {
    logger.error("[push] listenForForegroundPush failed", error);
    return () => {};
  }
}

export function stopListeningForForegroundPush(): void {
  foregroundUnsub?.();
  foregroundUnsub = null;
}
