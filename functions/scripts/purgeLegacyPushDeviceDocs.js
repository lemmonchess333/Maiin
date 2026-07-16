#!/usr/bin/env node
/**
 * Purge LEGACY push device documents (packets 17+19, PR-F — operator-run).
 *
 * Before the server-owned token migration (#1630), the web client wrote
 * `users/{uid}/devices/{rawToken}` docs directly. The migrated client
 * registers only through the claimPushDeviceToken callable, which writes
 * `users/{uid}/devices/{sha256(token)}` docs carrying
 * `ownershipVersion === OWNERSHIP_VERSION` plus a canonical
 * `fcmTokenClaims/{sha256(token)}` claim. Legacy docs are never sent to
 * (loadClaimedRegistrations skips them) — they are dead weight and stale
 * PII (push tokens), so after the migration window the operator deletes
 * them with this script.
 *
 * Usage (run from repo root, after the #1630 functions + web deploys have
 * been live long enough for active clients to re-register):
 *
 *   DRY_RUN=true node functions/scripts/purgeLegacyPushDeviceDocs.js  # report only (default-safe)
 *   node functions/scripts/purgeLegacyPushDeviceDocs.js               # delete legacy docs
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC + GOOGLE_CLOUD_PROJECT.
 *
 * Behaviour:
 *   - collectionGroup("devices") scan, filtered to `users/{uid}/devices`
 *     paths only (other future "devices" subcollections are untouched).
 *   - A doc is LEGACY (deleted) iff its `ownershipVersion` !==
 *     OWNERSHIP_VERSION. That is the definitive pre-migration signal.
 *   - V2 docs whose canonical claim is missing/mismatched are reported as
 *     ANOMALIES but NOT deleted: the claim transaction owns retiring
 *     those, and an in-flight claim could look momentarily orphaned.
 *   - Claim docs (`fcmTokenClaims/*`) are NEVER touched — revoked
 *     markers expire via the TTL field.
 */

const { OWNERSHIP_VERSION, tokenHash } = require("../lib/pushTokenOwnership");

const BATCH_LIMIT = 400; // headroom under Firestore's 500-op batch cap

/** users/{uid}/devices/{docId} and nothing else. */
function isUserDevicePath(path) {
  const segments = path.split("/");
  return (
    segments.length === 4 &&
    segments[0] === "users" &&
    segments[2] === "devices"
  );
}

/**
 * Classify one device snapshot: "legacy" (safe to delete), "canonical"
 * (current schema — claim verified by the caller), or "v2" (current
 * schema, claim not yet checked).
 */
function classifyDeviceDoc(snapshot) {
  if (!isUserDevicePath(snapshot.ref.path)) return "foreign";
  if (snapshot.get("ownershipVersion") !== OWNERSHIP_VERSION) return "legacy";
  return "v2";
}

/**
 * Scan, classify, and (when apply=true) delete legacy device docs.
 * Returns the report; never throws mid-delete without surfacing counts.
 */
async function purgeLegacyPushDeviceDocs({ firestore, apply = false }) {
  const snap = await firestore.collectionGroup("devices").get();
  const legacy = [];
  const v2 = [];
  let foreign = 0;

  for (const doc of snap.docs) {
    const kind = classifyDeviceDoc(doc);
    if (kind === "legacy") legacy.push(doc);
    else if (kind === "v2") v2.push(doc);
    else foreign += 1;
  }

  // Anomaly report only: v2 docs whose claim is absent or points at a
  // different uid/binding. NOT deleted (see header).
  const anomalies = [];
  for (const doc of v2) {
    const token = doc.get("token");
    const bindingId = doc.get("bindingId");
    let hash = null;
    try {
      hash = typeof token === "string" ? tokenHash(token) : null;
    } catch {
      hash = null;
    }
    if (!hash) {
      anomalies.push({ path: doc.ref.path, reason: "malformed-token" });
      continue;
    }
    const claim = await firestore.doc("fcmTokenClaims/" + hash).get();
    const uid = doc.ref.path.split("/")[1];
    if (
      !claim.exists ||
      claim.get("uid") !== uid ||
      claim.get("bindingId") !== bindingId ||
      claim.get("status") !== "claimed"
    ) {
      anomalies.push({ path: doc.ref.path, reason: "claim-mismatch" });
    }
  }

  let deleted = 0;
  if (apply) {
    for (let i = 0; i < legacy.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      for (const doc of legacy.slice(i, i + BATCH_LIMIT)) {
        batch.delete(doc.ref);
      }
      await batch.commit();
      deleted += Math.min(BATCH_LIMIT, legacy.length - i);
    }
  }

  return {
    scanned: snap.docs.length,
    legacy: legacy.length,
    canonicalV2: v2.length - anomalies.length,
    anomalies,
    foreign,
    deleted,
    dryRun: !apply,
  };
}

module.exports = {
  isUserDevicePath,
  classifyDeviceDoc,
  purgeLegacyPushDeviceDocs,
};

if (require.main === module) {
  const admin = require("firebase-admin");
  admin.initializeApp();
  const dryRun = process.env.DRY_RUN === "true";
  purgeLegacyPushDeviceDocs({
    firestore: admin.firestore(),
    apply: !dryRun,
  })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      if (report.anomalies.length > 0) {
        console.warn(
          `⚠ ${report.anomalies.length} v2 doc(s) without a canonical claim — NOT deleted; investigate before re-running.`
        );
      }
      console.log(
        report.dryRun
          ? `DRY RUN — ${report.legacy} legacy doc(s) would be deleted.`
          : `Deleted ${report.deleted} legacy doc(s).`
      );
    })
    .catch((error) => {
      console.error("purge failed:", error);
      process.exitCode = 1;
    });
}
