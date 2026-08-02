/**
 * Allow-list sanitiser for the `programState` document written by
 * completeOnboarding + configurePlan.
 *
 * Unlike the profile doc (profileSanitizer.js), programState was persisted
 * RAW: completeOnboarding only ran validatePlanPayload on v7 payloads (the
 * legacy branch wrote it unvalidated), and validatePlanPayload checks SHAPE
 * but never strips unknown keys. So an authenticated client could inject
 * arbitrary top-level fields into its OWN users/{uid}/programState/current
 * doc (self-scoped, but unbounded stored data). This closes that surface.
 *
 * Pure (no admin SDK) so it's unit-testable like helpers.js /
 * validatePlanPayload.js. Strips any top-level key not in the canonical
 * ProgramState schema (src/features/program/programTypes.ts) and reports
 * the dropped keys so the caller can LOUD-DROP log them (ADR-0005) — a
 * forgotten legitimate field surfaces in Cloud Logging instead of silently
 * corrupting a user's program. Nested values pass through untouched: the
 * engine reads specific fields, and the realistic abuse vector is top-level
 * field injection + doc bloat (the latter bounded by MAX_PROGRAM_STATE_BYTES).
 *
 * Keep PROGRAM_STATE_KEYS in lockstep with the ProgramState interface — a
 * new top-level field there must be added here in the same commit, or the CF
 * write silently drops it (caught by the loud-drop log + the parity test).
 */

// Canonical top-level keys — ProgramState in programTypes.ts. buildPlan emits
// a subset; the optionals (nextWorkoutOverride, manualCompletions,
// pendingFellBehindPrompt, templateId) are server/migration-set and included
// so a round-tripped state isn't stripped of legitimate fields.
const PROGRAM_STATE_KEYS = new Set([
  "goal",
  "currentPhase",
  "weekNumber",
  "splitType",
  "workouts",
  "fatigueScore",
  "updatedAt",
  "settings",
  "weekHistory",
  "runDays",
  "runPlan",
  "nextWorkoutOverride",
  "manualCompletions",
  "pendingFellBehindPrompt",
  "primaryGoal",
  // Backlog #9 (Helms H5): the adjustment rule's second-order memory.
  // `advanceWeek` emits it UNCONDITIONALLY (programEngine.ts, in the return
  // literal), so every user who has ever rolled a week carries it — and
  // without this entry `applyProgramCommand` dropped it and threw
  // invalid-argument, meaning the "Apply deload week" button did not lose
  // load for those users, it did nothing at all. Missing since #9 shipped;
  // the fixture-based coverage test below could not see it, which is why
  // `programStateKeyParity.test.js` now derives the key set from the
  // ProgramState interface instead.
  "plateauResponses",
  "templateId",
  "programSchemaVersion",
  // PROGRAM-DELOAD-01: pre-deload stash written by the applyDeloadWeek
  // command reducer; consumed (and removed) by revertDeloadWeek. Without
  // this entry the transaction's own sanitizer would strip the snapshot
  // it just wrote and undo would always fail.
  "deloadSnapshot",
  // PROGRAM-BLOCK-02: the active training block, which owns the lift
  // prescription for its duration (plan-file row Blk2). Client-written and
  // never read by a function — this entry exists so the two server paths
  // that round-trip a whole programState don't destroy it. Both failure
  // modes are silent-to-loud in opposite directions, which is why the key
  // lands BEFORE the client starts writing the field:
  //   applyProgramCommand REJECTS the whole command when anything is
  //     dropped, so an unlisted key would make the deload button throw
  //     invalid-argument for every user with an active block;
  //   configurePlan only warns and drops, so an unlisted key would delete
  //     the user's block on every settings save, with nothing surfaced.
  "trainingBlock",
  // D1: the lift side's calendar anchor (Sunday week key of the week the
  // current workouts belong to). Client-written by `advanceWeek`; listed here
  // so the server paths that round-trip a whole programState don't strip it
  // and strand the user's rollover.
  "liftWeekKey",
  // 14b: canonical muscles that got a recovery session on the last advance.
  // One week's refractory list, not a history — see `recoveryTrigger.ts`.
  // Unlisted, it would strand a muscle mid-re-entry AND reject the deload
  // command outright for any user carrying one.
  "recoveringMuscles",
  // P6 soft delete: the single-slot stash the `restoreExercise` undo reads.
  // Unlisted, `removeExercise` would write a key the sanitiser drops — and
  // `applyProgramCommand` REJECTS on any dropped key, so every removal would
  // hard-error rather than merely losing the undo.
  "lastRemovedExercise",
]);

// Generous ceiling well under Firestore's ~1 MiB document limit. A real
// program (workouts + weekHistory + runDays) is tens of KB; this only blocks
// deliberate bloat and turns a would-be opaque Firestore error into a clean
// invalid-argument rejection.
const MAX_PROGRAM_STATE_BYTES = 900000;

/**
 * Strip non-schema top-level keys from a programState payload.
 *
 * @param {*} programState
 * @returns {{ value: *, dropped: string[] }} sanitised copy + dropped
 *   top-level keys. Non-object input is returned unchanged with no drops —
 *   the caller's shape check / validatePlanPayload rejects it separately.
 */
function sanitizeProgramState(programState) {
  if (
    !programState ||
    typeof programState !== "object" ||
    Array.isArray(programState)
  ) {
    return { value: programState, dropped: [] };
  }
  const value = {};
  const dropped = [];
  for (const key of Object.keys(programState)) {
    if (PROGRAM_STATE_KEYS.has(key)) {
      value[key] = programState[key];
    } else {
      dropped.push(key);
    }
  }
  return { value, dropped };
}

/**
 * Serialized-size guard. Returns true when the (already-sanitised) state
 * exceeds the ceiling so the caller can reject with invalid-argument.
 *
 * @param {*} programState
 * @returns {boolean}
 */
function programStateTooLarge(programState) {
  try {
    return JSON.stringify(programState).length > MAX_PROGRAM_STATE_BYTES;
  } catch (_e) {
    // Circular / non-serialisable — reject (Firestore would fail anyway).
    return true;
  }
}

module.exports = {
  PROGRAM_STATE_KEYS,
  MAX_PROGRAM_STATE_BYTES,
  sanitizeProgramState,
  programStateTooLarge,
};
