#!/usr/bin/env node
/**
 * Delete what partner streaks left stored (Trim1 call 3(b), operator-run).
 *
 * A partner streak was a 1:1 bond between two people who follow each
 * other, kept at `partnerBonds/{bondId}` with the pair's streak. Partner
 * streaks went on 12 November 2026: no code makes, advances or reads a
 * bond now, and the rules refuse every client read of one. The bonds
 * stored before then are still there and are kept for no purpose, so the
 * operator deletes them with this script once the change is deployed.
 *
 * Usage (run from repo root, after Deploy production has shipped the
 * change, so no trigger is left to write to a bond):
 *
 *   DRY_RUN=true node functions/scripts/purgePartnerBondDocs.js  # report only
 *   node functions/scripts/purgePartnerBondDocs.js               # delete
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC + GOOGLE_CLOUD_PROJECT.
 *
 * It deletes every document in `partnerBonds` and touches nothing else:
 * the two people's follows stay as they are. Safe to run again: a second
 * run finds nothing. The report counts and never prints an id, because a
 * bond's id is its two members' uids.
 *
 * Account deletion keeps its own delete of a member's bonds until this
 * has been run in production (docs/qa/pre-launch-backlog.md has the row).
 */
"use strict";

const BATCH_LIMIT = 400; // headroom under Firestore's 500-op batch cap

async function purgePartnerBondDocs({ firestore, apply = false }) {
  const bonds = (await firestore.collection("partnerBonds").get()).docs;

  let deleted = 0;
  if (apply) {
    for (let i = 0; i < bonds.length; i += BATCH_LIMIT) {
      const batch = firestore.batch();
      const page = bonds.slice(i, i + BATCH_LIMIT);
      for (const doc of page) batch.delete(doc.ref);
      await batch.commit();
      deleted += page.length;
    }
  }

  return { bonds: bonds.length, deleted, dryRun: !apply };
}

module.exports = { purgePartnerBondDocs };

if (require.main === module) {
  const admin = require("../lib/adminSdk");
  admin.initializeApp();
  const dryRun = process.env.DRY_RUN === "true";
  purgePartnerBondDocs({ firestore: admin.firestore(), apply: !dryRun })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      console.log(
        report.dryRun
          ? `DRY RUN — ${report.bonds} stored bond(s) would be deleted.`
          : `Deleted ${report.deleted} stored bond(s).`
      );
    })
    .catch((error) => {
      console.error("purge failed:", error);
      process.exitCode = 1;
    });
}
