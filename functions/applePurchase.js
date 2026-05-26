/**
 * Apple IAP subscription-application logic. Split out of
 * appleIAP.js so the call graph + Firestore-transaction body are
 * unit-testable with stub handles — no firebase-admin boot, no
 * `@apple/app-store-server-library` cert fetch.
 *
 * Why this module exists, threat model first:
 *
 *   Pre-W1f the Cloud Function did a NAIVE base64 decode of the
 *   inbound JWS payload — no signature verification, no chain
 *   check, no bundle-ID match, no revocation awareness. An
 *   attacker could craft a fake JWS with our bundleId and a
 *   future expiresDate and the function would grant Pro on
 *   trust. The W1f fix introduced full chain verification via
 *   SignedDataVerifier; this helper preserves that fix and is
 *   tested against simulated forged-JWS rejections.
 *
 *   The other invariants the helper preserves from PR D's
 *   audit-P0-#3 work:
 *     - lifetime entitlement is never downgraded by a subscription
 *       event
 *     - stale events (older expiresDate than what's already stored)
 *       are ignored — Apple delivers out-of-order under load and a
 *       late EXPIRED notification can't silently kick an active
 *       paying user back to free
 *
 * Caller-injected handles (`firestore`, `verifyTransaction`,
 * `serverTimestamp`, `now`, `logger`) so the production wiring in
 * appleIAP.js passes the real `admin.firestore()` /
 * `verifySignedTransaction` / `FieldValue.serverTimestamp` and the
 * tests pass stubs that simulate every failure mode without
 * touching the network.
 */

const {
  resolveSubscriptionUpdate,
  SOURCE_IOS_IAP,
} = require("./lib/subscriptionReconciliation");

const BUNDLE_ID = "com.tropos.app";

/**
 * Apply a verified Apple IAP transaction to the user's subscription
 * state. Caller invokes; verifyTransaction is the verifier — in
 * production it's `verifySignedTransaction` from appleIAP.js, which
 * runs the JWS through Apple's chain. In tests it's a stub that
 * either resolves to a fake decoded payload or throws to simulate
 * a forged / unsigned / wrong-bundle JWS.
 *
 * @param {object} args
 * @param {object} args.firestore — Firestore handle with
 *   `.collection().doc()` + `.runTransaction()`.
 * @param {(signedTransactionInfo: string) => Promise<object>} args.verifyTransaction
 *   — verifier that throws on any chain / signature / bundle /
 *   schema failure. Must NOT return on failure; the caller relies
 *   on a throw to short-circuit.
 * @param {string} args.signedTransactionInfo — the raw JWS the
 *   client sent.
 * @param {string} args.uid — the authenticated caller's uid.
 * @param {() => Date} [args.now] — clock injection. Defaults to
 *   `new Date()`. Override in tests to pin "is the sub active?"
 *   without sleeping.
 * @param {() => unknown} [args.serverTimestamp] — Firestore
 *   `FieldValue.serverTimestamp()` sentinel factory. Defaults to
 *   `() => null` so test stubs don't need to mock the FieldValue
 *   import; production passes
 *   `admin.firestore.FieldValue.serverTimestamp`.
 * @param {{log:Function, warn:Function}} [args.logger] — defaults
 *   to `console`. Tests pass a noop to keep output quiet.
 *
 * @returns {Promise<{tier: 'pro'|'free', expiresAt: string|null, skipped?: 'lifetime'|'stale'}>}
 *
 * @throws if verifyTransaction throws (forged JWS), if the
 *   decoded payload's bundleId doesn't match BUNDLE_ID
 *   (defence-in-depth), or if the Firestore transaction throws.
 */
async function applySubscriptionToUser({
  firestore,
  verifyTransaction,
  signedTransactionInfo,
  uid,
  now = () => new Date(),
  serverTimestamp = () => null,
  logger = console,
  // Sub1 P2.5 — when set, called after the txn commits if the IAP
  // write displaced a stripe sub. Receives { previousSource }. Caller
  // is responsible for the actual Stripe SDK call (see
  // `functions/lib/stripeAutoCancel.js cancelDisplacedStripeSub`).
  // No-op when null (matches pre-#P2.5 behaviour — forensic log
  // only, manual ops follow-up).
  cancelDisplacedStripeSub = null,
}) {
  // Track the previous source so we can decide whether to invoke
  // the Stripe auto-cancel callback after the txn commits.
  let displacedSource = null;
  // VERIFY before we trust any field. verifyTransaction throws if
  // the JWS doesn't chain to Apple's roots OR if the bundle ID
  // doesn't match OR if the payload fails schema validation. We
  // never grant entitlement on an unverified payload.
  const tx = await verifyTransaction(signedTransactionInfo);

  // Defence-in-depth: SignedDataVerifier already enforces bundleId,
  // but a misconfigured verifier would otherwise silently let
  // another app's transactions through. Belt + braces — this
  // re-check is the second gate.
  if (tx.bundleId !== BUNDLE_ID) {
    throw new Error(`Bundle mismatch: ${tx.bundleId}`);
  }

  const productId = tx.productId;
  const originalTransactionId = tx.originalTransactionId;
  const expiresMs = Number(tx.expiresDate);
  const expiresAt = new Date(expiresMs);
  const isActive = expiresAt > now();

  const userRef = firestore.collection("users").doc(uid);

  return firestore
    .runTransaction(async (txn) => {
      const userSnap = await txn.get(userRef);
      const userData = userSnap.exists ? userSnap.data() : {};

      // Lifetime protection — subscription events can NEVER
      // downgrade a one-time purchase entitlement.
      if (userData.planKind === "lifetime") {
        logger.log(
          `applySubscriptionToUser: skipping for uid=${uid} — lifetime entitlement`
        );
        return {
          tier: userData.subscriptionTier || "pro",
          expiresAt: userData.subscriptionExpiresAt || null,
          skipped: "lifetime",
        };
      }

      // Staleness guard. If the stored expiresAt is later than the
      // incoming transaction's expiresAt, this is a late delivery
      // for a transaction Apple has already superseded — ignore
      // rather than overwrite. Pre-PR-D this overwrote on every
      // event, so a late EXPIRED arriving after a DID_RENEW would
      // silently downgrade a paying user.
      const storedExpiresAtRaw = userData.subscriptionExpiresAt;
      const storedExpiresMs = storedExpiresAtRaw
        ? new Date(storedExpiresAtRaw).getTime()
        : 0;
      if (storedExpiresMs > expiresMs) {
        logger.log(
          `applySubscriptionToUser: skipping stale tx for uid=${uid} ` +
            `(stored=${storedExpiresAtRaw}, incoming=${expiresAt.toISOString()})`
        );
        return {
          tier: userData.subscriptionTier || "free",
          expiresAt: storedExpiresAtRaw || null,
          skipped: "stale",
        };
      }

      // Sub1 P2 — every Pro write is platform-tagged so the
      // cross-platform reconciliation guard (Upgrade.tsx + the
      // duplicate-detection alert layer) can compare current vs new
      // source. Helper handles downgrades by nulling the source.
      const { writeTier, writeSource, conflict, conflictReason } =
        resolveSubscriptionUpdate({
          currentTier: userData.subscriptionTier,
          currentSource: userData.subscriptionSource,
          incomingTier: isActive ? "pro" : "free",
          incomingSource: isActive ? SOURCE_IOS_IAP : SOURCE_IOS_IAP,
        });

      txn.set(
        userRef,
        {
          subscriptionTier: writeTier,
          subscriptionSource: writeSource,
          appleOriginalTransactionId: originalTransactionId,
          appleProductId: productId,
          subscriptionExpiresAt: expiresAt.toISOString(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (conflict) {
        // Forensic-review breadcrumb in Cloud Logging. Auto-cancel
        // (Sub1 P2.5) runs OUTSIDE the txn — see the post-txn block
        // below. If that callback isn't injected, ops still handles
        // the displaced sub manually using the forensic log.
        logger.warn("applySubscriptionToUser.cross_platform_conflict", {
          uid,
          conflictReason,
          newSource: writeSource,
          previousSource: userData.subscriptionSource,
        });
        displacedSource = userData.subscriptionSource || null;
      }

      return {
        tier: writeTier,
        expiresAt: expiresAt.toISOString(),
        crossPlatformConflict: conflict,
      };
    })
    .then(async (txnResult) => {
      // Sub1 P2.5 — IAP override on a stripe-Pro account cancels the
      // displaced Stripe sub (prorated credit-note, not card refund).
      // Inverse direction (stripe overriding ios_iap) has NO admin
      // analog — Apple doesn't expose a programmatic cancel for IAP
      // subs, so we leave that forensic-log-only.
      //
      // Wrapped in try/catch — a Stripe outage here MUST NOT cause
      // the IAP success path to fail. The txn is already committed
      // (the user IS Pro on ios_iap); a stale Stripe sub is the
      // ops-followup case.
      if (
        txnResult.crossPlatformConflict &&
        displacedSource === "stripe" &&
        typeof cancelDisplacedStripeSub === "function"
      ) {
        try {
          await cancelDisplacedStripeSub({ uid, logger });
        } catch (err) {
          logger.warn("applySubscriptionToUser.auto_cancel_failed", {
            uid,
            error: (err && err.message) || String(err),
          });
        }
      }
      return txnResult;
    });
}

module.exports = {
  BUNDLE_ID,
  applySubscriptionToUser,
};
