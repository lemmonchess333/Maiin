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
  "templateId",
  "programSchemaVersion",
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
