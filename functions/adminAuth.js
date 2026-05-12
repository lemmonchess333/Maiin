/**
 * Admin-role gate for moderation callables.
 *
 * Tropos doesn't have a full role system yet; the audit-launch
 * surface needs a working moderation queue without sinking a
 * sprint into a custom-claims rollout. This is the trade-off:
 * an env-var allowlist of admin uids checked on every privileged
 * callable. Simple, auditable in the Firebase Functions config,
 * upgradable to custom claims later without breaking callers.
 *
 *   firebase functions:config:set admin.uids="uid1,uid2,uid3"
 *   firebase deploy --only functions
 *
 * Or for local dev / emulator runs:
 *
 *   ADMIN_UIDS=uid1,uid2 firebase emulators:start
 *
 * The check is the canonical trust boundary — the client-side
 * mirror in src/lib/adminAuth.ts gates UI visibility only;
 * a non-admin caller hitting the callable directly via curl
 * still fails the server check.
 */

const functions = require("firebase-functions");

/**
 * Parse the admin-uid allowlist from process.env.ADMIN_UIDS or
 * functions.config().admin.uids. Comma-separated, whitespace
 * tolerant. Returns a Set for O(1) lookup. Empty when neither
 * is set — the gate fails closed (every callable rejects).
 */
function getAdminUidAllowlist() {
  const raw =
    process.env.ADMIN_UIDS ||
    (functions.config && functions.config().admin && functions.config().admin.uids) ||
    "";
  const list = String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(list);
}

/**
 * Predicate: is this uid in the admin allowlist?
 * Empty allowlist → always false (fail-closed). Non-string uid
 * → false. Otherwise membership against the Set.
 */
function isAdminUid(uid) {
  if (typeof uid !== "string" || !uid) return false;
  return getAdminUidAllowlist().has(uid);
}

/**
 * Callable guard. Throws an HttpsError matching the standard
 * Firebase Functions error shape so the client SDK surfaces a
 * recognisable error code. Uses 'permission-denied' (not
 * 'unauthenticated') so the gate distinguishes "you're signed
 * in but not authorised" from "you're not signed in at all" —
 * the latter has its own preceding check.
 *
 * Caller pattern:
 *   if (!context.auth) throw new functions.https.HttpsError("unauthenticated", ...);
 *   assertAdminCallable(context.auth.uid);
 *   // ... admin-only work ...
 */
function assertAdminCallable(uid) {
  if (!isAdminUid(uid)) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "This action requires moderator privileges.",
    );
  }
}

module.exports = {
  getAdminUidAllowlist,
  isAdminUid,
  assertAdminCallable,
};
