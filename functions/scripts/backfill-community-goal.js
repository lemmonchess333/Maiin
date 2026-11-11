#!/usr/bin/env node
/**
 * Add the runs saved before the community goal counted everyone's runs to
 * that goal's total (lib/communityGoal.js): every person's runs dated
 * inside its month, joined or not.
 *
 * Usage (after Deploy production has shipped the run triggers that count
 * them), for the month's goal:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-community-goal.js adaptive-fitness-af8bb group-goal-2026-11-01
 *
 * Safe to run again at any time, and alongside the live triggers: a run
 * already counted adds nothing (its marker). Skips an account being
 * deleted and a restricted one. Prints the totals.
 */
"use strict";

const { backfillCommunityGoal } = require("../lib/communityGoal");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const [projectId, challengeId] = process.argv.slice(2);
      if (!projectId || !challengeId) {
        throw new Error(
          "Pass the Firebase project id and the goal's challenge id."
        );
      }
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const totals = await backfillCommunityGoal(admin.firestore(), {
        challengeId,
        fieldValue: admin.firestore.FieldValue,
      });
      console.log(
        JSON.stringify({ projectId, challengeId, ...totals }, null, 2)
      );
    })
    .catch((error) => {
      console.error("Community goal backfill failed:", error.message);
      process.exitCode = 1;
    });
}
