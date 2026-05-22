/**
 * R1A-Deletion — unified field minimisation rule for ALL operational
 * records written by the deletion subsystem and by post-deletion
 * system writers (Apple/Stripe webhooks, scheduled jobs).
 *
 * The forbidden list is the same across every operational collection
 * (accountDeletionRequests, deletedAccounts, paymentEventsPostDeletion,
 * any future operator-review / diagnostics records). Centralising it
 * here so the same predicate gates every write site — adding a new
 * forbidden category requires one edit, not a sweep.
 *
 * Chunk 1 scope: forbidden-field allowlist enforcement. Wiring into
 * Apple/Stripe webhooks lands in Chunk 2; deleteMyAccount-internal
 * writes use this in Chunk 3.
 */
"use strict";

/**
 * Field names that are NEVER allowed on operational records,
 * regardless of which collection. These are the categories the spec
 * explicitly forbids: meal names, workout notes, route coordinates,
 * photos, comment bodies, display names, emails, profile photo URLs,
 * full receipt payloads.
 *
 * Match is case-sensitive on exact field names; deeper keys inside
 * nested objects are walked by assertNoForbiddenFields.
 */
const FORBIDDEN_FIELDS = Object.freeze([
  // Identity
  "displayName",
  "email",
  "name",
  "fullName",
  "givenName",
  "familyName",
  "phoneNumber",
  "photoURL",
  "profilePhotoURL",
  "avatar",
  "avatarUrl",
  // Content
  "mealName",
  "mealText",
  "foodName",
  "items", // meal items array
  "workoutName",
  "workoutNotes",
  "notes",
  "caption",
  "commentBody",
  "comment",
  "reportText",
  "reason", // when on a payment record; reports.reason is in the reports collection, not operational
  // Location
  "lat",
  "lon",
  "latitude",
  "longitude",
  "coords",
  "coordinates",
  "points", // GPS points array
  "route",
  // Body metrics / nutrition
  "weightKg",
  "heightCm",
  "macros",
  "calories",
  "protein",
  "carbs",
  "fat",
  // Receipts (full payload)
  "receiptData",
  "signedTransactionInfo",
  "signedRenewalInfo",
  "rawReceipt",
  "transactionPayload",
]);

/**
 * Recursively walk an object and throw if any forbidden field name
 * appears at any depth. Pure — accepts any plain object/array shape.
 *
 * Why recursive: a webhook handler might accidentally serialise a
 * nested receipt payload like { event: { ..., signedTransactionInfo:
 * "..." } } and the top-level allowlist would miss it.
 */
function assertNoForbiddenFields(record, path = "") {
  if (record === null || typeof record !== "object") return;
  if (Array.isArray(record)) {
    record.forEach((item, i) => assertNoForbiddenFields(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(record)) {
    if (FORBIDDEN_FIELDS.includes(key)) {
      throw new Error(
        `forbidden field on operational record at ${path}.${key}: this category (${key}) must not appear on accountDeletionRequests / deletedAccounts / paymentEventsPostDeletion`,
      );
    }
    if (value && typeof value === "object") {
      assertNoForbiddenFields(value, `${path}.${key}`);
    }
  }
}

/**
 * Hash the first 8 chars of SHA256(uid) — used in
 * paymentEventsPostDeletion records so an operator can correlate two
 * post-deletion payment events from the same deleted user without
 * persisting the raw uid in the public-ish event log.
 *
 * Not a security primitive; collision resistance over an 8-char hex
 * prefix is fine for an operator triage hint at our scale.
 */
function hashedUidPrefix(uid) {
  // crypto is Node-builtin; required lazily so this module loads in
  // any environment the inventory test runs from.
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(uid).digest("hex").slice(0, 8);
}

/**
 * Strict shape for paymentEventsPostDeletion records. The webhook
 * handlers (Chunk 2) build a record matching this shape and call
 * assertPaymentEventShape before write.
 */
const PAYMENT_EVENT_ALLOWED_FIELDS = Object.freeze([
  "provider",       // "apple" | "stripe"
  "externalTxnId",  // provider's transaction id; safe to log
  "eventType",      // e.g. "DID_RENEW", "checkout.session.completed"
  "occurredAt",     // server timestamp
  "hashedUidPrefix",// 8-char SHA256 prefix
  "action",         // "skipped" | "logged"
]);

const VALID_PROVIDERS = Object.freeze(["apple", "stripe"]);
const VALID_ACTIONS = Object.freeze(["skipped", "logged"]);

function assertPaymentEventShape(record) {
  for (const field of Object.keys(record)) {
    if (!PAYMENT_EVENT_ALLOWED_FIELDS.includes(field)) {
      throw new Error(
        `forbidden field on paymentEventsPostDeletion: ${field}`,
      );
    }
  }
  if (record.provider && !VALID_PROVIDERS.includes(record.provider)) {
    throw new Error(`invalid provider: ${record.provider}`);
  }
  if (record.action && !VALID_ACTIONS.includes(record.action)) {
    throw new Error(`invalid action: ${record.action}`);
  }
  // Run the global forbidden-fields check too — defence in depth in
  // case PAYMENT_EVENT_ALLOWED_FIELDS gains a benign-looking field
  // that overlaps with a forbidden category in future.
  assertNoForbiddenFields(record);
}

module.exports = {
  FORBIDDEN_FIELDS,
  PAYMENT_EVENT_ALLOWED_FIELDS,
  VALID_PROVIDERS,
  VALID_ACTIONS,
  assertNoForbiddenFields,
  hashedUidPrefix,
  assertPaymentEventShape,
};
