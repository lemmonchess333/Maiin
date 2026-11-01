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

/** Whether a starter goal (Run9's reopening: 30 minutes without stopping)
 *  is running: begun, and neither finished nor ended. */
function starterGoalIsActive(goal) {
  return !!goal && !goal.finishedOn && !goal.endedOn;
}

/** `runMode` follows the goals and nothing else: a race goal makes it race
 *  prep, and without one a running starter goal makes it "starter".
 *  Recovery does NOT flip it — `raceGoal` stays present through recovery
 *  (cleared only at recovery-END), so a user mid-recovery is still
 *  "race_prep". */
function deriveRunMode(raceGoal, starterGoal) {
  if (raceGoal) return "race_prep";
  return starterGoalIsActive(starterGoal) ? "starter" : "freeform";
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

/** The patch for beginning the starter goal. One goal at a time: it clears
 *  a race goal. */
function setStarterGoalPatch(startedOn) {
  return { starterGoal: { startedOn }, raceGoal: null, runMode: "starter" };
}

/** The patch for the starter goal's last week done: the record kept with
 *  the day, and back to free running. */
function finishStarterGoalPatch(goal, finishedOn) {
  return {
    starterGoal: { startedOn: goal.startedOn, finishedOn },
    runMode: "freeform",
  };
}

/** The patch for a starter goal a race goal takes the place of: the record
 *  kept with the day and the stage reached. The race goal's patch is
 *  spread after it and sets `runMode`. */
function endStarterGoalPatch(goal, endedOn, stage) {
  return {
    starterGoal: { startedOn: goal.startedOn, endedOn, stage },
    runMode: "freeform",
  };
}

module.exports = {
  starterGoalIsActive,
  setStarterGoalPatch,
  finishStarterGoalPatch,
  endStarterGoalPatch,
  deriveRunMode,
  isSameRace,
  raceGoalIsCompletedRace,
  resolveRecoveryExit,
  newRaceSupersedesRecovery,
  setRaceGoalPatch,
};
