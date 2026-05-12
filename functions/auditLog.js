/**
 * Audit-log helper for successful Stripe Checkout session creation.
 *
 * Follow-up to PR #537's `FOLLOWUP(payment-security): audit-log
 * successful checkout session creation`. Today the function logs
 * nothing about successful checkouts — incident response for refund
 * disputes, abuse investigations, or compliance asks has no record
 * to go on. This module is the paper trail.
 *
 * Split out of index.js so the build-doc shape is unit-testable
 * without booting Firebase Admin. Side-effecting writes flow through
 * `recordCheckoutAuditEntry` which is exercised by the integration
 * suite against the Firestore emulator.
 *
 * Storage shape:
 *   /audit_checkout_sessions/{autoId} : CheckoutAuditEntry
 *
 * Access pattern: write-only from server (Admin SDK), zero client
 * reads. The firestore.rules default-deny rule already covers this,
 * plus an explicit deny block documents the intent at the rule site.
 *
 * What's logged:
 *   - uid                  — authenticated user who created the session
 *   - stripeSessionId      — Stripe's `cs_*` id for cross-reference
 *   - priceId              — Stripe price id used (not the full plan)
 *   - planKind             — derived `monthly` / `yearly` / `lifetime`
 *   - mode                 — Stripe `subscription` / `payment`
 *   - successOrigin        — `parsed.origin` of the success URL
 *   - cancelOrigin         — `parsed.origin` of the cancel URL
 *   - createdAt            — server timestamp
 *
 * What's NOT logged: full URLs (origin only via safeOriginForLog),
 * email, payment instruments, Stripe customer id. The audit log is
 * for "did this user start a checkout for this plan when" — not for
 * reconstructing the user's session.
 */

const admin = require("firebase-admin");

const CHECKOUT_AUDIT_COLLECTION = "audit_checkout_sessions";

/**
 * Pure shape-builder for the audit doc. No admin / firestore /
 * timestamp dependency — caller layers in the server timestamp via
 * {@link recordCheckoutAuditEntry}. Each field defaults to `null`
 * rather than being omitted so the doc shape is fixed regardless of
 * which fields the caller had available at write time (a partial
 * record from a mid-flow failure path is still queryable).
 */
function buildCheckoutAuditEntry(fields) {
  return {
    uid: fields.uid ?? null,
    stripeSessionId: fields.stripeSessionId ?? null,
    priceId: fields.priceId ?? null,
    planKind: fields.planKind ?? null,
    mode: fields.mode ?? null,
    successOrigin: fields.successOrigin ?? null,
    cancelOrigin: fields.cancelOrigin ?? null,
  };
}

/**
 * Side-effecting write. Caller passes a firestore handle (test
 * harness can drive a connected emulator handle; the prod handler
 * passes `admin.firestore()`). The server-timestamp is appended
 * here, not in the caller, so a misclocked function can't backdate
 * the record.
 *
 * Returns the doc reference so callers / tests can assert the write
 * landed. Does NOT swallow errors — the caller decides whether to
 * surface an audit-write failure or fire-and-forget.
 */
async function recordCheckoutAuditEntry(db, fields) {
  const entry = {
    ...buildCheckoutAuditEntry(fields),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  return db.collection(CHECKOUT_AUDIT_COLLECTION).add(entry);
}

module.exports = {
  CHECKOUT_AUDIT_COLLECTION,
  buildCheckoutAuditEntry,
  recordCheckoutAuditEntry,
};
