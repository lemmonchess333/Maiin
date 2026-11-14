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
 * The one exception is a retired key (RETIRED_PROGRAM_STATE_KEYS below),
 * which is deleted silently wherever it sits on the list.
 *
 * Keep PROGRAM_STATE_KEYS in lockstep with the ProgramState interface — a
 * new top-level field there must be added here in the same commit, or the CF
 * write silently drops it (caught by the loud-drop log + the parity test).
 */

// Canonical top-level keys — ProgramState in programTypes.ts. buildPlan emits
// a subset; the optionals (nextWorkoutOverride, manualCompletions,
// pendingFellBehindPrompt) are server/migration-set and included so a
// round-tripped state isn't stripped of legitimate fields.
const PROGRAM_STATE_KEYS = new Set([
  "goal",
  "currentPhase",
  "weekNumber",
  "splitType",
  "workouts",
  // An operations timestamp: the last write's time. Nothing in the app
  // decides anything from it, but it says when a plan last changed, so it
  // stays (App1 Q24 kept it on purpose).
  "updatedAt",
  "settings",
  "weekHistory",
  "runDays",
  "runPlan",
  "nextWorkoutOverride",
  "manualCompletions",
  "pendingFellBehindPrompt",
  "primaryGoal",
  // Lift4 (5): the session length the plan was fitted to. Listed before
  // the client writes it, for the reason trainingBlock's entry gives.
  "sessionMinutes",
  "programSchemaVersion",
  // PROGRAM-DELOAD-01: pre-deload stash written by the applyDeloadWeek
  // command reducer; consumed (and removed) by revertDeloadWeek. Without
  // this entry the transaction's own sanitizer would strip the snapshot
  // it just wrote and undo would always fail.
  "deloadSnapshot",
  // RUN-EASE-01: the same stash for the easier week, written by
  // applyEaseWeek and consumed by revertEaseWeek. Same failure mode as
  // deloadSnapshot without the entry — the transaction would strip the
  // snapshot it had just written, so Undo would always report that there
  // was nothing to undo.
  "easeSnapshot",
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
  // D1: the lift side's calendar anchor (the week key — first day of the
  // week — of the week the current workouts belong to). Client-written by
  // `advanceWeek`; listed here
  // so the server paths that round-trip a whole programState don't strip it
  // and strand the user's rollover.
  "liftWeekKey",
  // Lift4 (11): the weeks of a return after a break, written by the
  // client's "Ease back in" (`easeBackIn`) and counted down by its rollover.
  // Unlisted, every command on a plan that carries it would be refused for
  // the dropped key, the lighter week's guard below among them.
  "easingBack",
  // Lift4 (10): which of a race's final weeks this is, written by the
  // client's rollover. Unlisted, a command on a plan in one would be
  // refused for the dropped key.
  "raceWeek",
  // P6 soft delete: the single-slot stash the `restoreExercise` undo reads.
  // Unlisted, `removeExercise` would write a key the sanitiser drops — and
  // `applyProgramCommand` REJECTS on any dropped key, so every removal would
  // hard-error rather than merely losing the undo.
  "lastRemovedExercise",
]);

/**
 * Keys a plan used to carry that nothing reads or writes now (App1 Q24,
 * 13 November 2026). Each is deleted SILENTLY: never reported as dropped,
 * never a reason to refuse. A programme command writes the whole plan from
 * this function's output, so every command removes them; a plan save
 * (configurePlan) merges onto the stored plan and keeps a stored copy the
 * save did not touch, which the strip script removes.
 *
 * Stored plans carry them until `functions/scripts/stripRetiredProgramFields.js`
 * has run, and an app from before the change still writes `fatigueScore`
 * on a new plan and carries the rest from what it read. Reported as
 * dropped, any one of them would make `applyProgramCommand` refuse every
 * command on that plan ("Programme command produced invalid state"): the
 * deload button, a logged set, a skipped day. That is how
 * `plateauResponses` once broke the deload, when it was written and not
 * yet listed.
 *
 * Permanent. A key comes here when it is retired and stays, because old
 * copies and old apps outlive the change; the strip script reads this
 * list. Never on PROGRAM_STATE_KEYS as well, and never declared on
 * ProgramState (`programStateKeyParity.test.js` pins both). The client's
 * rollover drops the same top-level keys (`RETIRED_PROGRAM_STATE_KEYS` in
 * programTypes.ts, pinned to this one by `retiredProgramKeys.cross.test.ts`).
 */
const RETIRED_PROGRAM_STATE_KEYS = new Set([
  // The score the retired fatigue shave read (Lift4 (13)). New plans
  // seeded 0 and nothing computed it after.
  "fatigueScore",
  // How many times the retired adjustment rule cut volume for a stall
  // (Backlog #9, retired in Lift4 (13)).
  "plateauResponses",
  // The handwritten template a plan was matched to at onboarding, which
  // nothing names now. The TOP-LEVEL key only: a run day's `templateId`
  // sits inside `runDays`, is live, and is never touched here.
  "templateId",
  // The retired per-muscle recovery session's muscles (Lift4 (13)).
  "recoveringMuscles",
]);

/**
 * The same for a key inside one of the plan's objects: the parent's
 * top-level key, then the retired keys in it. Only these three objects,
 * and only when the parent is a plain object.
 */
const RETIRED_PROGRAM_STATE_SUBKEYS = Object.freeze({
  // Microloading, which "I have small plates" replaced (Lift4 (6)).
  settings: Object.freeze(["microloading"]),
  // Weeks the retired adjustment rule was held back after a block began.
  trainingBlock: Object.freeze(["amnestyWeeksLeft"]),
  // The deload's copy of `fatigueScore`, for an undo that no longer
  // restores it. An old snapshot still reverts: the revert never read it.
  deloadSnapshot: Object.freeze(["fatigueScore"]),
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** `value` without its retired keys, or `value` itself when it has none. */
function withoutRetiredSubkeys(parentKey, value) {
  const retired = RETIRED_PROGRAM_STATE_SUBKEYS[parentKey];
  if (!retired || !isPlainObject(value)) return value;
  if (!retired.some((key) => Object.prototype.hasOwnProperty.call(value, key)))
    return value;
  const kept = { ...value };
  for (const key of retired) delete kept[key];
  return kept;
}

// Generous ceiling well under Firestore's ~1 MiB document limit. A real
// program (workouts + weekHistory + runDays) is tens of KB; this only blocks
// deliberate bloat and turns a would-be opaque Firestore error into a clean
// invalid-argument rejection.
const MAX_PROGRAM_STATE_BYTES = 900000;

/**
 * Strip non-schema top-level keys from a programState payload, and delete
 * the retired ones (top-level and nested) without reporting them.
 *
 * @param {*} programState
 * @returns {{ value: *, dropped: string[] }} sanitised copy + dropped
 *   top-level keys. Non-object input is returned unchanged with no drops —
 *   the caller's shape check / validatePlanPayload rejects it separately.
 *   A retired key is never in `dropped`.
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
    if (RETIRED_PROGRAM_STATE_KEYS.has(key)) continue;
    if (PROGRAM_STATE_KEYS.has(key)) {
      value[key] = withoutRetiredSubkeys(key, programState[key]);
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
  RETIRED_PROGRAM_STATE_KEYS,
  RETIRED_PROGRAM_STATE_SUBKEYS,
  MAX_PROGRAM_STATE_BYTES,
  sanitizeProgramState,
  programStateTooLarge,
};
