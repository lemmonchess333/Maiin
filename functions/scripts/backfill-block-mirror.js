#!/usr/bin/env node
/**
 * Write the person blocked's copy of every block made before onBlockWritten
 * was deployed (Polish3 call 1), and drop any copy whose block is gone.
 *
 * The rules already refuse follows, props, comments and single reads across
 * those blocks; what the copy adds is the blocked person's app leaving the
 * blocker out of its feeds, Explore, Spaces, comments and boards. Until this
 * runs, a block from before the deploy is one-sided there.
 *
 * Usage (after Deploy production has shipped onBlockWritten):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-block-mirror.js adaptive-fitness-af8bb
 *
 * Safe to run again at any time: each pair is set to what its block is now
 * (lib/blockMirror.js). Prints the totals. Writes nothing for an account
 * being deleted.
 */
"use strict";

const { backfillBlockMirrors } = require("../lib/blockMirror");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const projectId = process.argv[2];
      if (!projectId) {
        throw new Error("Pass the Firebase project id as the first argument.");
      }
      const admin = require("firebase-admin");
      admin.initializeApp({ projectId });
      const totals = await backfillBlockMirrors({
        firestore: admin.firestore(),
      });
      console.log(JSON.stringify({ projectId, ...totals }, null, 2));
    })
    .catch((error) => {
      console.error("Block mirror backfill failed:", error.message);
      process.exitCode = 1;
    });
}
