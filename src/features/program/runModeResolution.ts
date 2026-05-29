/**
 * Run9 phase 1 — run-mode / race-goal / recovery state resolution.
 *
 * Pure functions that encode the locked Run9 invariants in ONE place so the
 * client surface, the migration, and (mirrored in JS) the Cloud Functions all
 * derive the same answer. The round-3 composition critic showed these three
 * decisions form a cycle that does NOT compose if each call site re-derives it
 * ad hoc:
 *   - 9a / ENG(a): `runMode` is a MATERIALIZED field derived from `raceGoal`
 *     presence — not a user toggle.
 *   - 9d / ENG(j): recovery is a `runPlan.phase`; exiting recovery clears
 *     `profile.raceGoal` so the derived `runMode` resolves to "freeform".
 *   - R3-cycle: raceGoal must clear at recovery-END only (never start), the
 *     clear must co-write `runMode`, and the recovery-phase check must precede
 *     any freeform short-circuit in readers.
 *   - R3-backtoback: a NEW future race set during a recovery window must NOT be
 *     deleted by "skip recovery", and it supersedes (ends) the prior recovery.
 *
 * INVARIANT (materialization rule): every write that sets OR clears
 * `profile.raceGoal` MUST co-write `profile.runMode = deriveRunMode(raceGoal)`.
 * The patch returned by every resolver here always carries `runMode` so a
 * caller that applies the whole patch can't violate the invariant.
 *
 * All dates are local "YYYY-MM-DD" strings; lexicographic compare == date
 * compare for that format.
 */

export type RunMode = "race_prep" | "freeform";

export interface RaceGoal {
  distance: string;
  /** Local "YYYY-MM-DD". */
  targetDate: string;
}

/**
 * Run9a + materialization rule. `runMode` follows `raceGoal` presence and
 * nothing else. Recovery deliberately does NOT flip it: `raceGoal` stays
 * present through the recovery window (cleared only at recovery-END), so a
 * user mid-recovery is still "race_prep" — which is correct, because the
 * recovery hero and scheduler gate on `runPlan.phase`, not on freeform-ness.
 */
export function deriveRunMode(raceGoal: RaceGoal | null | undefined): RunMode {
  return raceGoal ? "race_prep" : "freeform";
}

/** Two race goals refer to the same race (same distance + target date). */
export function isSameRace(
  a: RaceGoal | null | undefined,
  b: RaceGoal | null | undefined
): boolean {
  if (!a || !b) return false;
  return a.distance === b.distance && a.targetDate === b.targetDate;
}

export interface RecoveryContext {
  /** `profile.raceGoal` at the moment of the transition. */
  currentRaceGoal: RaceGoal | null | undefined;
  /** The race recovery is FOR — the just-completed race's goal. */
  completedRaceGoal: RaceGoal | null | undefined;
}

/**
 * A profile patch. `runMode` is always present (materialization invariant).
 * `raceGoal` is omitted when unchanged, or explicitly `null` when cleared.
 */
export interface RaceGoalWritePatch {
  raceGoal?: RaceGoal | null;
  runMode: RunMode;
}

/**
 * raceGoal still points at the just-completed race (the user has NOT set a
 * newer race during recovery). Only then is it safe to clear on recovery exit.
 */
export function raceGoalIsCompletedRace(ctx: RecoveryContext): boolean {
  return isSameRace(ctx.currentRaceGoal, ctx.completedRaceGoal);
}

/**
 * Recovery EXIT — natural end (recovery-end sweep) OR user "skip recovery".
 * R3-cycle + R3-backtoback: clear `profile.raceGoal` ONLY when it still equals
 * the completed race; if a newer race was set during recovery, keep it. Always
 * co-writes the materialized `runMode`. The caller separately clears
 * `runPlan.phase` / `recoveryEndDate` atomically with this patch.
 */
export function resolveRecoveryExit(ctx: RecoveryContext): RaceGoalWritePatch {
  if (raceGoalIsCompletedRace(ctx)) {
    // The race recovery was for is done and no successor exists → freeform.
    return { raceGoal: null, runMode: "freeform" };
  }
  // A different (newer) race is set, or no raceGoal at all → leave raceGoal,
  // materialize runMode from whatever it currently is.
  return { runMode: deriveRunMode(ctx.currentRaceGoal) };
}

/**
 * R3-backtoback: setting a new FUTURE race during an active recovery window
 * supersedes (ends) the prior race's recovery. True when `currentRaceGoal` is
 * a new race (not the one recovery is for) whose date is today-or-later.
 */
export function newRaceSupersedesRecovery(
  ctx: RecoveryContext,
  today: string
): boolean {
  const cur = ctx.currentRaceGoal;
  if (!cur) return false;
  if (raceGoalIsCompletedRace(ctx)) return false; // same race, not a new one
  return cur.targetDate >= today; // a new, still-future race ends recovery
}

/**
 * The patch for SETTING (or changing) a race goal — onboarding-retake
 * retirement, the run-tab "Train for a race" CTA, or editing the date.
 * Materializes runMode alongside. Clearing is `setRaceGoalPatch(null)`.
 */
export function setRaceGoalPatch(
  next: RaceGoal | null
): RaceGoalWritePatch {
  return { raceGoal: next, runMode: deriveRunMode(next) };
}
