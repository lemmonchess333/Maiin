/**
 * CIRCLE-TARGET-LIFECYCLE / CONTINUATION (rank-6 Circle arc).
 *
 * A Circle's `targetDate` is the shared finish line (race day, block
 * end). Until now it was decorative — nothing read it after creation,
 * so a Circle whose target passed stayed live forever with a stale
 * "· until <date>" label. This module gives the OWNER two server-owned
 * resolutions once the date is reached (the client detects "reached"
 * from the targetDate it already loads and shows the prompt):
 *
 *   - continue: set a new future targetDate (keep training together);
 *   - wrap: end the Circle (active:false + endedAt) — the timeline
 *     stays readable, the UI renders "· ended".
 *
 * The space doc is server-only-writable (rules: `write: if false`), so
 * this Admin-SDK lib is the only writer — a client can't forge a
 * lifecycle transition. House pattern: injected-firestore, unit-tested
 * with stubs; the thin index.js callable adds auth, the deletion
 * actor-lock, a rate limit, and HttpsError mapping via
 * mapGoalSpaceError.
 *
 * No scheduled sweep and no new stored "reached" flag: detection is a
 * pure function of `targetDate <= today`, which the client already
 * has, so the only thing that needs elevated privilege is the
 * mutation. `active` is left untouched by `continue` so join/leave
 * semantics (which gate on `active`) don't change.
 */

const { GoalSpaceError } = require("./goalSpaceMembership");

const RESOLVE_ACTIONS = Object.freeze(["continue", "wrap"]);

/** UTC calendar day as YYYY-MM-DD. targetDate is a coarse finish line
 *  (a race day), so a UTC anchor is the right resolution — the ±1-day
 *  skew near midnight in far-from-UTC zones is immaterial for a date
 *  the owner is deliberately picking from a future-dated input. */
function todayUtcKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

function assertFutureDate(dateStr, now) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new GoalSpaceError(
      "invalid-argument",
      "newTargetDate required (YYYY-MM-DD)"
    );
  }
  if (!Number.isFinite(Date.parse(`${dateStr}T00:00:00Z`))) {
    throw new GoalSpaceError("invalid-argument", "newTargetDate invalid");
  }
  // String compare is timezone-free and avoids an off-by-one from
  // parsing `now` into a day.
  if (dateStr <= todayUtcKey(now)) {
    throw new GoalSpaceError(
      "invalid-argument",
      "newTargetDate must be in the future"
    );
  }
  return dateStr;
}

/**
 * Owner-only resolution of a Circle's target lifecycle.
 * Returns { ok, action, targetDate } — targetDate is the new date for
 * `continue`, or the (unchanged) date for `wrap`.
 */
async function resolveTarget({
  firestore,
  uid,
  spaceId,
  action,
  newTargetDate,
  now,
}) {
  if (typeof spaceId !== "string" || spaceId.length === 0) {
    throw new GoalSpaceError("invalid-argument", "spaceId required");
  }
  if (!RESOLVE_ACTIONS.includes(action)) {
    throw new GoalSpaceError("invalid-argument", "unknown action");
  }
  // Validate the date BEFORE opening the transaction so a bad input
  // fails fast without a read.
  const nextTargetDate =
    action === "continue" ? assertFutureDate(newTargetDate, now) : null;

  return firestore.runTransaction(async (tx) => {
    const spaceRef = firestore.doc(`goalSpaces/${spaceId}`);
    const snap = await tx.get(spaceRef);
    if (!snap.exists) {
      throw new GoalSpaceError("not-found", "no such circle");
    }
    const space = snap.data();
    if (space.ownerId !== uid) {
      throw new GoalSpaceError("permission-denied", "owner only");
    }
    if (space.active !== true) {
      // A wrapped Circle can't be re-opened here — continuation means
      // starting a fresh Circle.
      throw new GoalSpaceError("failed-precondition", "circle already ended");
    }

    if (action === "continue") {
      // Only the space doc's targetDate drives the UI label; the
      // per-member journey copies (users/{uid}/journeys/{spaceId})
      // carry a vestigial targetDate written at join that nothing
      // renders, so they are intentionally not fanned out here.
      tx.update(spaceRef, { targetDate: nextTargetDate });
      return { ok: true, action, targetDate: nextTargetDate };
    }

    // wrap: end the Circle. Mirrors the owner-leave deactivation
    // (active:false) but keeps ownership + membership so the finished
    // Circle stays readable; endedAt records when.
    tx.update(spaceRef, { active: false, endedAt: now });
    return { ok: true, action, targetDate: space.targetDate ?? null };
  });
}

module.exports = {
  RESOLVE_ACTIONS,
  resolveTarget,
};
