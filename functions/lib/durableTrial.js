/**
 * Durable trial eligibility — closes the trial-farming re-grant vector
 * (2026-07-09 money-path audit, finding F1).
 *
 * The onboarding trial (`completeOnboarding`, functions/index.js) was granted
 * purely on the ABSENCE of `users/{uid}`: the `!existing.exists` branch minted a
 * fresh 7-day `trialExpiresAt`, and `computeEffectiveTier` grants Pro on any
 * future `trialExpiresAt` — which flips the AI-scan quota from `image_ai:0` to
 * `image_ai:100` (real Vertex compute). Because a client may delete its OWN user
 * doc (`firestore.rules` `allow delete: if isOwner(uid)`) with no tombstone
 * trigger, an attacker could: delete `users/{uid}` → re-onboard → fresh trial,
 * on the SAME uid, with no account deletion — a repeatable free-AI faucet.
 *
 * Fix: a durable, client-inaccessible ledger `trialLedger/{uid}` that SURVIVES
 * user-doc deletion (it is NOT in the account-deletion sweep's allow-lists, and
 * `firestore.rules` denies all client access — Admin SDK writes only). The trial
 * is granted iff BOTH the user doc is absent AND no ledger marker exists for the
 * uid; granting writes the marker in the same batch, so a granted trial is
 * always recorded durably.
 *
 * Scope: this closes the HIGH in-account self-delete vector (needs no account
 * deletion). Re-signing-up under a brand-new uid/email is NOT closed by a
 * uid-keyed ledger; the full one-per-identity guarantee is the card-gated
 * StoreKit / RevenueCat intro offer (ADR-0006 M2, Apple-enforced one-per-Apple-ID).
 *
 * Pure + injectable (no admin SDK, no clock) so it is unit-testable without the
 * emulator — mirrors the `checkoutTrial.js` / `aiScanQuota.js` shape.
 */

/** Top-level, admin-only collection. Retained past account deletion by design. */
const TRIAL_LEDGER_COLLECTION = "trialLedger";

/** Onboarding trial length in days. Mirrors the pre-fix inline value. */
const TRIAL_DAYS = 7;

/**
 * Firestore ref for a uid's durable trial marker.
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} uid
 */
function trialLedgerRef(db, uid) {
  return db.collection(TRIAL_LEDGER_COLLECTION).doc(uid);
}

/**
 * ISO-8601 (UTC) timestamp `days` in the future from `now`. Matches the
 * pre-fix computation (`new Date(); setDate(+7); toISOString()`) so the granted
 * `trialExpiresAt` string shape is unchanged.
 * @param {Date} now
 * @param {number} [days=TRIAL_DAYS]
 */
function trialExpiryIso(now, days = TRIAL_DAYS) {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Pure decision: grant a fresh trial iff the user doc is absent (a new or
 * client-reset account) AND no durable ledger marker exists for the uid. An
 * existing user doc never re-triggers a grant (the caller preserves its
 * `trialExpiresAt`), and a present ledger marker means this uid already spent
 * its trial — so a self-delete-and-re-onboard yields NO new trial.
 * @param {{ userDocExists: boolean, ledgerExists: boolean }} state
 * @returns {boolean}
 */
function shouldGrantTrial({ userDocExists, ledgerExists }) {
  return !userDocExists && !ledgerExists;
}

module.exports = {
  TRIAL_LEDGER_COLLECTION,
  TRIAL_DAYS,
  trialLedgerRef,
  trialExpiryIso,
  shouldGrantTrial,
};
