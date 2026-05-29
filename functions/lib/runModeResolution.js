/**
 * Run9 3b — JS mirror of `src/features/program/runModeResolution.ts`.
 *
 * The TS module's header promised these rules were "(mirrored in JS) [so] the
 * Cloud Functions all derive the same answer" — but the mirror never existed.
 * This closes that gap so the server's recovery-exit sweep reaches the SAME
 * materialized state a React client would, for non-React clients (Apple Watch,
 * future native) that write saved-runs but can't run the React state machine.
 *
 * Keep this in lockstep with the TS source. Pure functions only — no Firestore,
 * no admin SDK. Dates are local "YYYY-MM-DD" strings (lexicographic compare ==
 * date compare).
 *
 * INVARIANT (materialization rule): every write that sets OR clears
 * `profile.raceGoal` MUST co-write `profile.runMode = deriveRunMode(raceGoal)`.
 * Every patch returned here carries `runMode` so a caller applying the whole
 * patch can't violate the invariant.
 */

/** `runMode` follows `raceGoal` presence and nothing else. Recovery does NOT
 *  flip it — `raceGoal` stays present through recovery (cleared only at
 *  recovery-END), so a user mid-recovery is still "race_prep". */
function deriveRunMode(raceGoal) {
  return raceGoal ? "race_prep" : "freeform";
}

/** Two race goals refer to the same race (same distance + target date). */
function isSameRace(a, b) {
  if (!a || !b) return false;
  return a.distance === b.distance && a.targetDate === b.targetDate;
}

/** raceGoal still points at the just-completed race (no newer race set during
 *  recovery). Only then is it safe to clear on recovery exit. */
function raceGoalIsCompletedRace(ctx) {
  return isSameRace(ctx.currentRaceGoal, ctx.completedRaceGoal);
}

/**
 * Recovery EXIT — natural end (recovery-end sweep) OR user "skip recovery".
 * Clear `raceGoal` ONLY when it still equals the completed race; if a newer
 * race was set during recovery, keep it. Always co-writes the materialized
 * `runMode`. The caller separately clears `runPlan.phase` / `recoveryEndDate`.
 *
 * Returns `{ raceGoal?: RaceGoal | null, runMode: RunMode }` — `raceGoal` is
 * present (and `null`) only when cleared; omitted when unchanged.
 */
function resolveRecoveryExit(ctx) {
  if (raceGoalIsCompletedRace(ctx)) {
    // The race recovery was for is done and no successor exists → freeform.
    return { raceGoal: null, runMode: "freeform" };
  }
  // A different (newer) race is set, or no raceGoal at all → leave raceGoal,
  // materialize runMode from whatever it currently is.
  return { runMode: deriveRunMode(ctx.currentRaceGoal) };
}

/**
 * Setting a new FUTURE race during an active recovery window supersedes the
 * prior race's recovery. True when `currentRaceGoal` is a new race (not the
 * one recovery is for) whose date is today-or-later.
 */
function newRaceSupersedesRecovery(ctx, today) {
  const cur = ctx.currentRaceGoal;
  if (!cur) return false;
  if (raceGoalIsCompletedRace(ctx)) return false; // same race, not a new one
  return cur.targetDate >= today;
}

/** The patch for SETTING (or changing) a race goal. Materializes runMode
 *  alongside. Clearing is `setRaceGoalPatch(null)`. */
function setRaceGoalPatch(next) {
  return { raceGoal: next, runMode: deriveRunMode(next) };
}

module.exports = {
  deriveRunMode,
  isSameRace,
  raceGoalIsCompletedRace,
  resolveRecoveryExit,
  newRaceSupersedesRecovery,
  setRaceGoalPatch,
};
