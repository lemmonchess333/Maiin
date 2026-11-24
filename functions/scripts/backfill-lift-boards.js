#!/usr/bin/env node
/**
 * Put every workout saved before the lift boards (Run30 call 3) through the
 * workout triggers' own steps, once (lib/liftBoards.js backfillLiftBoards).
 *
 * onWorkoutCreated and onWorkoutUpdated record a workout's heaviest set of
 * each barbell lift, and the lifter's board entries, from the first workout
 * saved or edited after they were deployed. This does the same for every
 * workout already saved: each one's efforts as the trigger writes them,
 * then each lift the lifter has done recomputed once by the triggers' own
 * recompute, so a board shows the same people, from the same posts, as it
 * would had every workout been saved today.
 *
 * Usage (after Deploy production has shipped the functions, and once the
 * `lifters.uid` collection-group index reads Enabled):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-lift-boards.js adaptive-fitness-af8bb         # dry run
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-lift-boards.js adaptive-fitness-af8bb apply   # write
 *
 * A dry run writes nothing and prints what it read. Safe to run again, and
 * beside the live triggers: every write recomputes from the documents as
 * they are. Writes nothing for an account being deleted. Prints totals,
 * never an id.
 */
"use strict";

const { backfillLiftBoards } = require("../lib/liftBoards");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const projectId = process.argv[2];
      if (!projectId) {
        throw new Error("Pass the Firebase project id as the first argument.");
      }
      const apply = process.argv[3] === "apply";
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const totals = await backfillLiftBoards(admin.firestore(), {
        apply,
        documentId: () => admin.firestore.FieldPath.documentId(),
      });
      console.log(JSON.stringify({ projectId, ...totals }, null, 2));
    })
    .catch((error) => {
      console.error("Lift board backfill failed:", error.message);
      process.exitCode = 1;
    });
}

module.exports = { backfillLiftBoards };
