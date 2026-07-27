/**
 * Run-plan resolver — the single read-time interpretation of "what run plan is
 * active, and what state is it in?" for a given day.
 *
 * WHY THIS EXISTS (architecture review candidate #1 / bugs R1-R4). The run
 * domain stored the same race identity in TWO places — the canonical
 * `profile.raceGoal` (+ materialized `profile.runMode`) and a mirror on
 * `programState.runPlan.raceGoal` — and every reader re-derived the answer from
 * whichever copy it happened to reach. That produced a recurring bug class:
 *   - R4 surface drift: `resolveRunPlanSurface` gated the overlay on
 *     `runPlan.raceGoal` while mode came from `profile.runMode`, so a transient
 *     store disagreement (profile written, programState regen not yet) dropped
 *     the race overlay for a race-prep user.
 *   - R1 elapsed: "is the plan elapsed?" was computed in THREE places with
 *     three different rules, all parsing `new Date("YYYY-MM-DD")` as UTC
 *     midnight — so the plan read "elapsed" partway through race day for
 *     non-UTC users.
 *   - The recovery-window predicate was hand-inlined in ~6 places, each with a
 *     slightly different "today".
 *
 * This module reconciles the two stores ONCE (canonical raceGoal = profile ??
 * mirror, `runMode` materialized from it — mirroring run9Migration's rule and
 * runModeResolution's write side) and owns the SINGLE definition of elapsed and
 * the recovery window. It is pure: callers pass the local `todayKey`
 * (YYYY-MM-DD), so output is deterministic and unit-testable — the interface is
 * the test surface. Consumers should read the run-plan state from here instead
 * of re-deriving it.
 *
 * All dates are local "YYYY-MM-DD" strings; lexicographic compare == date
 * compare for that format (same convention as runModeResolution.ts).
 */

import {
  deriveRunMode,
  type RaceGoal,
  type RunMode,
} from "@/features/program/runModeResolution";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "@/features/program/programTypes";

export type RunPlanSurfaceKind = "freeform" | "race_goal";

export type RunPlanSurfaceState =
  | { kind: "freeform"; hasRaceGoal: false }
  | { kind: "race_goal"; hasRaceGoal: true };

export interface ResolvedRunPlan {
  /**
   * Reconciled canonical race goal: `profile.raceGoal` wins, falling back to
   * the `programState.runPlan.raceGoal` mirror so a race-prep user whose goal
   * only landed on one store is never dropped.
   */
  raceGoal: RaceGoal | null;
  /** Materialized from `raceGoal` presence — never the stored `runMode` toggle. */
  runMode: RunMode;
  /** Top-level surface. `race_goal` iff a canonical raceGoal is present. */
  surface: RunPlanSurfaceState;
  /**
   * The race is in the past — elapsed only AFTER race day, not during it
   * (`todayKey > targetDate`, a timezone-safe string compare), OR the plan ran
   * out of weeks (`currentWeek >= totalWeeks`). False when there's no race.
   */
  isElapsed: boolean;
  /**
   * In the post-race recovery window: `runPlan.phase === "recovery"` with a
   * `recoveryEndDate` still in the future (`todayKey < recoveryEndDate`).
   */
  inRecovery: boolean;
  /**
   * Recovery window has ended: `phase === "recovery"` and
   * `todayKey >= recoveryEndDate`. Distinct from `inRecovery` so callers can
   * tell "still recovering" from "recovery is over, awaiting exit".
   */
  recoveryEnded: boolean;
}

type ProfileRunFields = Pick<UserProfile, "runMode" | "raceGoal">;

/** The canonical race goal — profile wins, mirror backfills. Mirrors
 *  run9Migration's `canonicalRaceGoal`, applied at read time. */
function reconcileRaceGoal(
  profile: ProfileRunFields | null | undefined,
  programState: ProgramState | null | undefined
): RaceGoal | null {
  const fromProfile = profile?.raceGoal as RaceGoal | null | undefined;
  if (fromProfile) return fromProfile;
  const fromMirror = programState?.runPlan?.raceGoal as
    | RaceGoal
    | null
    | undefined;
  return fromMirror ?? null;
}

/** The fields the recovery window is derived from. Deliberately loose: the
 *  callers hold these in three different shapes (a `runPlan`, an in-flight
 *  `advanced.runPlan` mid-rollover, or two destructured locals). */
export interface RecoveryWindowFields {
  phase?: string | null;
  recoveryEndDate?: string | null;
}

/**
 * Is the plan inside its post-race recovery window ON `dateKey`?
 *
 * THE one definition. This predicate was hand-inlined in five places —
 * `useProgram` ×4 (two rollovers, `refreshRunSchedule`, `realignRacePlan`)
 * and `runHeroState` — each spelling out the same three clauses. Every copy
 * agreed, which is exactly why it was worth collapsing before one of them
 * stopped agreeing: the failure would be silent. A rollover that reads "not
 * in recovery" regenerates a RACE plan for the coming week and drops the
 * recovery flags via makeRunPlanRecord, so the user's post-race easy week
 * quietly becomes race training.
 *
 * `resolveRunPlan` calls this too, so its `inRecovery` cannot drift from it.
 *
 * DATE-PARAMETERISED, not "today". Two callers legitimately ask about a
 * FUTURE date — "will this still be a recovery week when the roll-over lands
 * next week?" — so binding this to today would have made them keep their own
 * copies. (`resolveRunPlan`'s third argument is likewise any date key; it is
 * only NAMED `todayKey`.)
 *
 * Lexicographic compare is date compare for YYYY-MM-DD, the same convention
 * as the rest of this module. A missing `recoveryEndDate` is NOT in
 * recovery — a phase flag with no end date has no window to be inside, and
 * treating it as open-ended would strand the user there forever.
 *
 * Returns a plain boolean, NOT a type predicate. The inline copies were
 * doing double duty — their clauses also narrowed `runPlan` to non-undefined
 * for the block that followed, which then spread it (`{ ...advRunPlan }`) —
 * so a `runPlan is T` signature looks tempting and even quiets `tsc -b` at
 * those two sites. It is a lie on the other branch: "not in recovery" says
 * nothing about whether a plan EXISTS, but the predicate would narrow the
 * negative branch to `null | undefined`. `realignRacePlan` reads
 * `runPlan.currentWeek` after exactly such a check and collapsed to `never`.
 * Callers needing the non-null guarantee state it themselves.
 */
export function isInRecoveryOn(
  runPlan: RecoveryWindowFields | null | undefined,
  dateKey: string
): boolean {
  return (
    runPlan?.phase === "recovery" &&
    !!runPlan.recoveryEndDate &&
    dateKey < runPlan.recoveryEndDate
  );
}

/**
 * The one resolver. Given the two stores and a local date key, returns the
 * reconciled run-plan state every reader should use.
 */
export function resolveRunPlan(
  profile: ProfileRunFields | null | undefined,
  programState: ProgramState | null | undefined,
  todayKey: string
): ResolvedRunPlan {
  const raceGoal = reconcileRaceGoal(profile, programState);
  const runMode = deriveRunMode(raceGoal);
  const runPlan = programState?.runPlan;

  const surface: RunPlanSurfaceState = raceGoal
    ? { kind: "race_goal", hasRaceGoal: true }
    : { kind: "freeform", hasRaceGoal: false };

  // Elapsed — only meaningful under an active race. Two arms, unified from the
  // three drifted copies (runPlanMetadata / Run.tsx / ProgrammeRunSection):
  //  (a) the plan ran out of weeks, or
  //  (b) race day has PASSED (local string compare — after the day, not during).
  let isElapsed = false;
  if (raceGoal) {
    const currentWeek = runPlan?.currentWeek;
    const totalWeeks = runPlan?.totalWeeks;
    if (
      typeof currentWeek === "number" &&
      typeof totalWeeks === "number" &&
      currentWeek >= totalWeeks
    ) {
      isElapsed = true;
    } else if (todayKey > raceGoal.targetDate) {
      isElapsed = true;
    }
  }

  // Recovery window — `isInRecoveryOn` above is now the one definition, and
  // this calls it so the resolver's answer cannot drift from a direct call.
  const inRecoveryPhase = runPlan?.phase === "recovery";
  const recoveryEndDate = runPlan?.recoveryEndDate ?? null;
  const inRecovery = isInRecoveryOn(runPlan, todayKey);
  const recoveryEnded =
    inRecoveryPhase && !!recoveryEndDate && todayKey >= recoveryEndDate;

  return {
    raceGoal,
    runMode,
    surface,
    isElapsed,
    inRecovery,
    recoveryEnded,
  };
}

/**
 * Back-compat surface resolver, now reconciliation-aware (R4 fix). Previously
 * gated on `programState.runPlan.raceGoal` + `profile.runMode` independently,
 * so a store disagreement dropped the overlay; it now derives the surface from
 * the reconciled canonical raceGoal. Callers that need more than the surface
 * should use `resolveRunPlan` directly.
 */
export function resolveRunPlanSurface(
  profile: ProfileRunFields | null | undefined,
  programState: ProgramState | null | undefined
): RunPlanSurfaceState {
  const raceGoal = reconcileRaceGoal(profile, programState);
  return raceGoal
    ? { kind: "race_goal", hasRaceGoal: true }
    : { kind: "freeform", hasRaceGoal: false };
}
