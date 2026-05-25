/**
 * Sub1b reconciliation — pinned subscription write contract.
 *
 * Locked design (Sub1b → C with three pins, see Sub1 row in
 * `.claude/plans/programme-run-followups.md`):
 *
 *   - Pin #3: `subscription.source` tracks the current platform.
 *     One of "stripe" | "ios_iap" | "android_iap". Updated to the
 *     incoming platform on every Pro-activation write; old canceled
 *     subs remain in their respective payment-platform records.
 *     Tropos reads only the current source.
 *
 *   - Pin #2: webhook duplicate-detection. When an IAP webhook
 *     fires for a user that already has `source: "stripe"` + an
 *     active Stripe subscription (or vice versa), the new platform
 *     wins (so the user's most recent purchase intent is honoured)
 *     AND a forensic alert is logged. The Stripe sub auto-cancel +
 *     refund the lock describes is intentionally NOT wired here —
 *     refunds are operationally risky and live in a follow-up
 *     (Sub1 P2.5). The signal here lets ops handle them manually.
 *
 *   - Pin #1 is client-side (Upgrade.tsx) — covered by the
 *     subscription-source-aware paywall guard.
 *
 * Why a single helper: pre-Sub1 P2, three call sites wrote
 * `subscriptionTier` independently (`applePurchase.js`, two
 * `stripeWebhook` cases). Each could drift on what other fields it
 * touched. Centralising the contract means new sources (e.g. a
 * future android_iap) plug in once.
 *
 * Pinned-by-test invariants live in
 * `__tests__/subscriptionReconciliation.test.js`.
 */

const SOURCE_STRIPE = "stripe";
const SOURCE_IOS_IAP = "ios_iap";
const SOURCE_ANDROID_IAP = "android_iap";

const VALID_SOURCES = Object.freeze([
  SOURCE_STRIPE,
  SOURCE_IOS_IAP,
  SOURCE_ANDROID_IAP,
]);

/**
 * Decide what to write to `users/{uid}` and whether a cross-platform
 * conflict is in play.
 *
 *   Input:
 *     - currentTier        — stored `subscriptionTier` (string | undef)
 *     - currentSource      — stored `subscriptionSource` (string | undef)
 *     - incomingTier       — "pro" | "free"
 *     - incomingSource     — one of VALID_SOURCES
 *
 *   Output:
 *     - { writeTier, writeSource, conflict, conflictReason }
 *       writeTier / writeSource = what to merge onto the doc.
 *       conflict = boolean; true iff an active Pro on a different
 *       source is being overwritten by a Pro on a new source.
 *       conflictReason = enum-like string for logging.
 *
 * Conflict matrix (Pro-only — downgrades never conflict):
 *
 *   current        incoming                 conflict
 *   ---------------|------------------------|----------
 *   none / free    → pro/any source         no
 *   pro/stripe     → pro/stripe             no (renewal)
 *   pro/stripe     → pro/ios_iap            YES (cross-platform)
 *   pro/ios_iap    → pro/stripe             YES (cross-platform)
 *   any            → free/any               no (downgrade)
 *
 * The function is pure; no Firestore I/O. Callers commit the write
 * and forward the conflict signal to their alert layer.
 */
function resolveSubscriptionUpdate({
  currentTier,
  currentSource,
  incomingTier,
  incomingSource,
}) {
  if (incomingTier !== "pro" && incomingTier !== "free") {
    throw new Error(
      `resolveSubscriptionUpdate: incomingTier must be "pro" or "free", got ${JSON.stringify(incomingTier)}`,
    );
  }
  if (incomingTier === "pro" && !VALID_SOURCES.includes(incomingSource)) {
    throw new Error(
      `resolveSubscriptionUpdate: incomingSource must be one of ${VALID_SOURCES.join("|")} for pro writes, got ${JSON.stringify(incomingSource)}`,
    );
  }

  // Downgrades always apply. No conflict (the user has ceased to be
  // Pro on the incoming platform; old source field is no longer
  // meaningful, so we null it).
  if (incomingTier === "free") {
    return {
      writeTier: "free",
      writeSource: null,
      conflict: false,
      conflictReason: null,
    };
  }

  // Pro write. Detect cross-platform overlap iff existing state is
  // Pro on a different source.
  const isCrossPlatform =
    currentTier === "pro" &&
    typeof currentSource === "string" &&
    currentSource !== incomingSource;

  return {
    writeTier: "pro",
    writeSource: incomingSource,
    conflict: isCrossPlatform,
    conflictReason: isCrossPlatform
      ? `cross-platform: stored=${currentSource} incoming=${incomingSource}`
      : null,
  };
}

module.exports = {
  SOURCE_STRIPE,
  SOURCE_IOS_IAP,
  SOURCE_ANDROID_IAP,
  VALID_SOURCES,
  resolveSubscriptionUpdate,
};
