"use strict";

/**
 * Monday's recap push (XB1 call 7): Monday belongs to it for anyone with
 * push on, and it opens the weekly review, so it goes only when a review is
 * waiting, the rule the review's own entry uses (useReviewEligibility):
 * something logged in the reviewed week, or before it. An account with
 * nothing logged yet has no review to open.
 */
const { buildWeeklyRecapMessage } = require("./pushSend");

const LOGGED = ["workouts", "runs", "meals"];

/** Whether the review of the week ending `weekEnd` ("yyyy-MM-dd") waits. */
async function reviewWaits(db, uid, weekEnd) {
  const found = await Promise.all(
    LOGGED.map((name) =>
      db
        .collection(`users/${uid}/${name}`)
        .where("date", "<=", weekEnd)
        .limit(1)
        .get()
        .then((snap) => !snap.empty)
    )
  );
  return found.some(Boolean);
}

module.exports = { reviewWaits, buildWeeklyRecapMessage };
