#!/usr/bin/env node
/**
 * Count, for every account, how many people follow it and how many it
 * follows, and store the two numbers in followCounts/{uid}
 * (lib/followCounts.js).
 *
 * onFollowerEdgeWritten and onFollowingEdgeWritten keep a count in step
 * from the first edge made or removed after they were deployed. This
 * counts everyone else, the accounts with no follows included, so that a
 * missing count can come to mean 0.
 *
 * Usage (after Deploy production has shipped the two triggers):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-follow-counts.js adaptive-fitness-af8bb
 *
 * Safe to run again at any time, and beside the live triggers: a count is
 * stored only if it was read after the one already there. Writes nothing
 * for an account being deleted. Prints the totals; `changed` is how many
 * stored numbers moved or were new, 0 on a second run.
 */
"use strict";

const { backfillFollowCounts } = require("../lib/followCounts");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const projectId = process.argv[2];
      if (!projectId) {
        throw new Error("Pass the Firebase project id as the first argument.");
      }
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const totals = await backfillFollowCounts(admin.firestore(), {
        documentId: () => admin.firestore.FieldPath.documentId(),
      });
      console.log(JSON.stringify({ projectId, ...totals }, null, 2));
    })
    .catch((error) => {
      console.error("Follow count backfill failed:", error.message);
      process.exitCode = 1;
    });
}
