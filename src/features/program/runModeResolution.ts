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

export type RunMode = "race_prep" | "starter" | "freeform";

export interface RaceGoal {
  distance: string;
  /** Local "YYYY-MM-DD". */
  targetDate: string;
  /** Optional user-entered event name, ≤60 chars. */
  eventName?: string;
  /** Optional link to the race's community space (races plan Q4):
   *  set when the goal came from the catalogue (either door);
   *  manually-entered goals simply lack it. Cross-links and the
   *  future training counter key off this exact id. */
  eventSpaceId?: string;
}

/**
 * Run9's reopening: the starter goal, 30 minutes without stopping. The
 * record stays once the goal is over: `finishedOn` when its last week was
 * done, or `endedOn` and the stage it reached when a race goal took its
 * place. Only a goal with neither is running (`starterGoalIsActive`). Its
 * stage lives on the plan (`programState.runPlan`), week to week.
 */
export interface StarterGoal {
  /** Local "YYYY-MM-DD": the day the goal began. */
  startedOn: string;
  /** Local "YYYY-MM-DD": the day the last week was done. */
  finishedOn?: string;
  /** Local "YYYY-MM-DD": the day a race goal took its place. */
  endedOn?: string;
  /** The stage reached when it ended, which a race plan builds from. */
  stage?: number;
}

/** Whether a starter goal is running: begun, and neither finished nor ended. */
export function starterGoalIsActive(
  goal: StarterGoal | null | undefined
): boolean {
  return !!goal && !goal.finishedOn && !goal.endedOn;
}

/**
 * Run9a + materialization rule. `runMode` follows the goals and nothing
 * else: a race goal makes it race prep, and without one a running starter
 * goal makes it "starter". Recovery deliberately does NOT flip it:
 * `raceGoal` stays present through the recovery window (cleared only at
 * recovery-END), so a user mid-recovery is still "race_prep" — which is
 * correct, because the recovery hero and scheduler gate on
 * `runPlan.phase`, not on freeform-ness.
 */
export function deriveRunMode(
  raceGoal: RaceGoal | null | undefined,
  starterGoal?: StarterGoal | null
): RunMode {
  if (raceGoal) return "race_prep";
  return starterGoalIsActive(starterGoal) ? "starter" : "freeform";
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
 *
 * `eventName` is optional free-text (≤60 chars): the key is INCLUDED only
 * when a non-empty string is passed, and OMITTED when undefined/empty so
 * the written object never carries an `undefined` value (stripUndefined /
 * Firestore-clean writes stay clean).
 */
export function setRaceGoalPatch(next: RaceGoal | null): RaceGoalWritePatch {
  if (!next) return { raceGoal: null, runMode: "freeform" };
  const raceGoal: RaceGoal = {
    distance: next.distance,
    targetDate: next.targetDate,
    ...(next.eventName ? { eventName: next.eventName } : {}),
    ...(next.eventSpaceId ? { eventSpaceId: next.eventSpaceId } : {}),
  };
  return { raceGoal, runMode: deriveRunMode(raceGoal) };
}

/** A profile patch that sets, finishes or ends the starter goal. Like the
 *  race goal's, it always carries the materialized `runMode`. */
export interface StarterGoalWritePatch {
  starterGoal: StarterGoal;
  raceGoal?: null;
  runMode: RunMode;
}

/**
 * The patch for beginning the starter goal on `startedOn`. One goal at a
 * time: it clears a race goal. A race plan's recovery is the race
 * lifecycle's, so a caller doesn't begin a starter during one.
 */
export function setStarterGoalPatch(startedOn: string): StarterGoalWritePatch {
  return { starterGoal: { startedOn }, raceGoal: null, runMode: "starter" };
}

/** The patch for the starter goal's last week done: the record kept with
 *  the day, and back to free running. */
export function finishStarterGoalPatch(
  goal: StarterGoal,
  finishedOn: string
): StarterGoalWritePatch {
  return {
    starterGoal: { startedOn: goal.startedOn, finishedOn },
    runMode: "freeform",
  };
}

/**
 * The patch for a starter goal a race goal takes the place of: the record
 * kept with the day and the stage reached, so the race plan builds from
 * there. Spread the race goal's patch after it, which sets `runMode`:
 * `{ ...endStarterGoalPatch(goal, day, stage), ...setRaceGoalPatch(race) }`.
 */
export function endStarterGoalPatch(
  goal: StarterGoal,
  endedOn: string,
  stage: number
): StarterGoalWritePatch {
  return {
    starterGoal: { startedOn: goal.startedOn, endedOn, stage },
    runMode: "freeform",
  };
}
