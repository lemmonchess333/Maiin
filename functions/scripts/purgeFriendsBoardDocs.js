#!/usr/bin/env node
/**
 * Delete what the friends board left stored (Trim1 call 3(a), operator-run).
 *
 * The friends board kept `friendsBoard/{uid}`, one person's week, for
 * anyone who chose Show my week, and their answer in
 * `users/{uid}.showWeekOnBoard`. The board went on 12 November 2026: no
 * code writes or reads either now, and the rules refuse every client read
 * of the weeks. What was stored before then is still there, and is a
 * person's training figures kept for no purpose, so the operator deletes
 * it with this script once the change is deployed.
 *
 * Usage (run from repo root, after Deploy production has shipped the
 * change, so no trigger is left to write a week back):
 *
 *   DRY_RUN=true node functions/scripts/purgeFriendsBoardDocs.js  # report only
 *   node functions/scripts/purgeFriendsBoardDocs.js               # delete
 *
 * Requirements: GOOGLE_APPLICATION_CREDENTIALS pointing at a service
 * account with Firestore access, or gcloud ADC + GOOGLE_CLOUD_PROJECT.
 *
 * It deletes every document in `friendsBoard` and removes the
 * `showWeekOnBoard` field from every user document that has it, and
 * touches nothing else on a user document. Safe to run again: a second
 * run finds nothing. The report counts and never prints an id.
 *
 * Account deletion keeps its own delete of `friendsBoard/{uid}` until this
 * has been run in production (docs/qa/pre-launch-backlog.md has the row).
 */
"use strict";

const BATCH_LIMIT = 400; // headroom under Firestore's 500-op batch cap

async function inBatches(firestore, docs, apply) {
  let done = 0;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = firestore.batch();
    const page = docs.slice(i, i + BATCH_LIMIT);
    for (const doc of page) apply(batch, doc);
    await batch.commit();
    done += page.length;
  }
  return done;
}

/**
 * `fieldDelete` is `admin.firestore.FieldValue.delete()`, passed in so the
 * script's logic runs against a fake without the Admin SDK.
 */
async function purgeFriendsBoardDocs({
  firestore,
  fieldDelete,
  apply = false,
}) {
  const weeks = (await firestore.collection("friendsBoard").get()).docs;
  // Either answer: `false` is a stored "no", and goes too.
  const answered = (
    await firestore
      .collection("users")
      .where("showWeekOnBoard", "in", [true, false])
      .get()
  ).docs;

  let weeksDeleted = 0;
  let answersRemoved = 0;
  if (apply) {
    weeksDeleted = await inBatches(firestore, weeks, (batch, doc) =>
      batch.delete(doc.ref)
    );
    answersRemoved = await inBatches(firestore, answered, (batch, doc) =>
      batch.update(doc.ref, { showWeekOnBoard: fieldDelete })
    );
  }

  return {
    weeks: weeks.length,
    answers: answered.length,
    weeksDeleted,
    answersRemoved,
    dryRun: !apply,
  };
}

module.exports = { purgeFriendsBoardDocs };

if (require.main === module) {
  const admin = require("../lib/adminSdk");
  admin.initializeApp();
  const dryRun = process.env.DRY_RUN === "true";
  purgeFriendsBoardDocs({
    firestore: admin.firestore(),
    fieldDelete: admin.firestore.FieldValue.delete(),
    apply: !dryRun,
  })
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      console.log(
        report.dryRun
          ? `DRY RUN — ${report.weeks} stored week(s) and ${report.answers} answer(s) would be removed.`
          : `Deleted ${report.weeksDeleted} stored week(s) and removed ${report.answersRemoved} answer(s).`
      );
    })
    .catch((error) => {
      console.error("purge failed:", error);
      process.exitCode = 1;
    });
}
