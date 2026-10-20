#!/usr/bin/env node
/**
 * Delete the password-reset limiter records keyed by an address
 * (operator-run, once).
 *
 * sendPasswordResetLinkCallable keyed its limiter by the address itself
 * (`rateLimits/pwreset_alice_example_com_passwordReset`), and the record
 * was kept for good, for every address anyone typed, account or not. It is
 * now keyed by a hash of the address (lib/emailRateLimit.passwordResetKey)
 * and every rateLimits record carries `expiresAt` under a TTL policy. The
 * old records are read by nothing and have no `expiresAt`, so the policy
 * never removes them. This does.
 *
 * Usage (from the repo root, once the functions deploy carrying the hashed
 * key is live):
 *
 *   DRY_RUN=true node functions/scripts/purgeLegacyResetLimiterDocs.js  # report only
 *   node functions/scripts/purgeLegacyResetLimiterDocs.js               # delete
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC + GOOGLE_CLOUD_PROJECT.
 *
 * A record is deleted when its id starts `pwreset_` and it has no
 * `expiresAt`. Hashed records always carry one, so they are never touched.
 * The report counts records and never prints an id: the ids are addresses.
 */

const { FieldPath } = require("firebase-admin/firestore");

const BATCH_LIMIT = 400; // headroom under Firestore's 500-op batch cap
const PREFIX = "pwreset_";

function isLegacyResetLimiter(doc) {
  return doc.id.startsWith(PREFIX) && doc.data().expiresAt === undefined;
}

async function purgeLegacyResetLimiterDocs({ firestore, apply = false }) {
  const snap = await firestore
    .collection("rateLimits")
    .where(FieldPath.documentId(), ">=", PREFIX)
    .where(FieldPath.documentId(), "<", `${PREFIX}`)
    .get();
  const legacy = snap.docs.filter(isLegacyResetLimiter);

  let deleted = 0;
  if (apply) {
    for (let i = 0; i < legacy.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      const page = legacy.slice(i, i + BATCH_LIMIT);
      for (const doc of page) batch.delete(doc.ref);
      await batch.commit();
      deleted += page.length;
    }
  }

  return {
    scanned: snap.docs.length,
    legacy: legacy.length,
    deleted,
    dryRun: !apply,
  };
}

module.exports = { isLegacyResetLimiter, purgeLegacyResetLimiterDocs };

if (require.main === module) {
  const admin = require("firebase-admin");
  admin.initializeApp();
  const dryRun = process.env.DRY_RUN === "true";
  purgeLegacyResetLimiterDocs({ firestore: admin.firestore(), apply: !dryRun })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      console.log(
        report.dryRun
          ? `DRY RUN — ${report.legacy} address-keyed record(s) would be deleted.`
          : `Deleted ${report.deleted} address-keyed record(s).`
      );
    })
    .catch((error) => {
      console.error("purge failed:", error);
      process.exitCode = 1;
    });
}
