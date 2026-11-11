#!/usr/bin/env node
/**
 * Give every challenge participant who reached a tier before medals
 * existed the medal for it (lib/medals.js, Soc15): the challenges that
 * ended in the last 13 months, and the ones still running.
 *
 * Usage (after Deploy production has shipped onChallengeParticipantWritten,
 * which keeps medals in step from then on):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node functions/scripts/backfill-medals.js adaptive-fitness-af8bb [challengeId]
 *
 * Name a challenge id to backfill that one alone. Safe to run again at any
 * time, and beside the live trigger: a medal that exists is left to the
 * trigger, so a second run writes nothing. Skips an account being deleted.
 * Prints the totals.
 */
"use strict";

const accountDeletionLocks = require("../lib/accountDeletionLocks");
const { backfillMedals } = require("../lib/medals");

if (require.main === module) {
  Promise.resolve()
    .then(async () => {
      const [projectId, challengeId] = process.argv.slice(2);
      if (!projectId) {
        throw new Error("Pass the Firebase project id.");
      }
      const admin = require("../lib/adminSdk");
      admin.initializeApp({ projectId });
      const db = admin.firestore();
      const totals = await backfillMedals(db, {
        challengeId: challengeId || null,
        documentId: () => admin.firestore.FieldPath.documentId(),
        shouldWrite: (uid) =>
          accountDeletionLocks.shouldSystemWriteProceed(
            db,
            uid,
            "backfillMedals"
          ),
      });
      console.log(
        JSON.stringify(
          { projectId, challengeId: challengeId || null, ...totals },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error("Medal backfill failed:", error.message);
      process.exitCode = 1;
    });
}
