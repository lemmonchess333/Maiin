/**
 * Sub1a P1 migration — one-off backfill that sets `hasUsedTrial: true`
 * on every legacy user who already has a `trialExpiresAt` timestamp.
 *
 * Pre-#P1, `auth.tsx createDefaultProfile` set `trialExpiresAt` at
 * account creation. Every existing user therefore has an "implicit
 * trial" expiry — and the lifetime-trial-shopping guard introduced
 * by #P1 reads `hasUsedTrial`. Without this migration, every legacy
 * user could claim a second 7-day free trial via the new opt-in CTA.
 *
 * Idempotent: rerunning is safe. Users that already have
 * `hasUsedTrial: true` are skipped, so the operator can re-invoke
 * after a partial run without double-writes or extra Firestore cost.
 *
 * Dry-run: pass `dryRun: true` to get the would-write count without
 * touching any docs.
 *
 * The helper is pure-of-Firestore-handle — `index.js` passes the
 * admin-resolved `firestore` so unit tests can drive it with a stub
 * (mirrors the `accountDeletion.js` / `checkoutTrial.js` pattern).
 */
async function backfillTrialFlag({ firestore, dryRun = false, logger = console } = {}) {
  if (!firestore) {
    throw new Error("backfillTrialFlag: firestore handle required");
  }

  const snap = await firestore.collection("users").get();
  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    scanned += 1;
    const data = doc.data() || {};
    // Eligibility = ever had a non-null trial AND hasn't been
    // migrated yet. `trialExpiresAt` falsy (null, undefined, empty
    // string) means the user never had an implicit trial — leave
    // them alone.
    const hasLegacyTrial =
      data.trialExpiresAt !== null &&
      data.trialExpiresAt !== undefined &&
      data.trialExpiresAt !== "";
    const alreadyMigrated = data.hasUsedTrial === true;
    if (!hasLegacyTrial || alreadyMigrated) continue;

    wouldUpdate += 1;
    if (dryRun) continue;

    await doc.ref.set({ hasUsedTrial: true }, { merge: true });
    updated += 1;
  }

  if (logger && logger.info) {
    logger.info("backfillTrialFlag.complete", {
      scanned,
      wouldUpdate,
      updated,
      dryRun,
    });
  }

  return { scanned, wouldUpdate, updated, dryRun };
}

module.exports = { backfillTrialFlag };
