#!/usr/bin/env node
/**
 * Bring every Space member's recent public posts into their Spaces' lists
 * of members' sessions, and their current week into each Space's week
 * (lib/spaceBackfill.js, Run27 call 11).
 *
 * The triggers keep both in step from the first join, post or session
 * after they were deployed; this does it for the people who joined before.
 *
 * Usage (after Deploy production has shipped onSpaceMemberWritten,
 * onActivitySpaceRows and onRestrictionWritten, and the indexes are built):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-space-sessions.js adaptive-fitness-af8bb
 *
 * Safe to run again at any time, and beside the live triggers. Prints the
 * totals; `rowsAdded` is 0 on a second run.
 */
"use strict";

const { backfillSpaceMembers } = require("../lib/spaceBackfill");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const projectId = process.argv[2];
      if (!projectId) {
        throw new Error("Pass the Firebase project id as the first argument.");
      }
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const totals = await backfillSpaceMembers(admin.firestore(), {
        documentId: () => admin.firestore.FieldPath.documentId(),
      });
      console.log(JSON.stringify({ projectId, ...totals }, null, 2));
    })
    .catch((error) => {
      console.error("Space sessions backfill failed:", error.message);
      process.exitCode = 1;
    });
}
