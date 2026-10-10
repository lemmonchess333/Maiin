/**
 * The weekly rollover: moving the programme into the week the calendar has
 * reached, as pure functions of the plan, the profile and this week's key.
 *
 * `useProgram` runs it from two effects, one for each side's calendar, and
 * keeps there only what an app has to wait for before writing: the server's
 * copy of the plan, the layoff read and a finish still being saved. What a
 * week moving on does is here, so a caller with no React (the simulator, a
 * script stepping through a season) runs the code the app runs rather than a
 * copy of it.
 *
 * Which calendar a plan follows is `weekRolloverAnchor`'s answer: a plan
 * with run days, for a runner not in free running, follows the runs, which
 * are pinned to dates (ADR-0002); any other plan follows its lifts' week
 * key. So of the two rollovers below, at most one moves a given plan. When
 * the run side ends the run plan (a race passed), the plan follows its lifts
 * from then on, and the lift side moves it the rest of the way.
 *
 * The same plan, profile and week key always give the same plan back: no
 * ids are drawn, and the only clock read is `advanceWeek`'s `updatedAt`.
 * `weekRollover.test.ts` pins both.
 */
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { carryCompletionsAcrossRegen } from "@/lib/runCompletionCarry";
import { planningEasyPaceSPerKm } from "@/lib/runPaces";
import { isInRecoveryOn } from "@/lib/runPlanResolver";
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import type { LayoffClass } from "./layoffDetection";
import { raceAwaitsItsEnding, weekRolloverAnchor } from "./programMaintenance";
import { advanceWeek } from "./programEngine";
import type {
  ManualCompletion,
  ProgramState,
  RunPlan,
  ScheduledRunDay,
} from "./programTypes";
import { clampPlanWeek } from "./runPlanTiming";
import {
  generateRacePlanV2,
  runTuningFromProfile,
  scheduleRecoveryWeekV2,
  type RunTuning,
} from "./runScheduler";
import { raceBlockWeek, type RaceBlockWeek } from "./weekPrescription";

/**
 * PR-0b-ii: assemble a v7 RunPlan record from a V2 race-plan
 * output. Preserves previous-plan continuity for the
 * "Week N of M" display: callers that advance / refresh pass
 * the prior `currentWeek` + `totalWeeks` through `carry` so the
 * stored counters keep their semantic meaning. Initial /
 * full-regenerate paths leave `carry` empty and accept V2's
 * fresh values + currentWeek=0.
 *
 * `compressed` always trusts V2's fresh output — config changes
 * (e.g. race date pushed earlier) can flip an uncompressed plan
 * to compressed and the UI banner needs to reflect that.
 */
function makeRunPlanRecord(
  v2: { totalWeeks: number; compressed: boolean; belowFloor: boolean },
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    eventName?: string;
  },
  carry: { currentWeek?: number; totalWeeks?: number } = {}
): RunPlan {
  return {
    mode: "race_prep",
    raceGoal,
    totalWeeks: carry.totalWeeks ?? v2.totalWeeks,
    currentWeek: carry.currentWeek ?? 0,
    compressed: v2.compressed,
    // Run9 phase-3 (Slice B): surface below-floor so the Realign UI names the
    // finish-safely risk instead of presenting a tight plan as a normal one.
    belowFloor: v2.belowFloor,
  };
}

/**
 * Centralised race-plan regeneration recipe.
 *
 * Eight call sites previously repeated the same sequence — build
 * generator args → call `generateRacePlanV2` → slice `weeks[0]` for
 * runDays → wrap in `makeRunPlanRecord` → optionally re-attach
 * `completedRaces[]`. Drift across sites was the symptom: PR-L L4's
 * shift/compress writers landed without the `currentWeek` carry
 * that `refreshRunSchedule` already used, and without the
 * `completedRaces` re-attach that multi-race plans need.
 *
 * Callers pass what varies per site — which week, schedule and target
 * (load uses today, week-advance uses next-week start, editor-apply uses
 * an overridden schedule). What does not vary — the runner's tuning, easy
 * pace, time limits and running baseline — is read off the profile here,
 * so no site can leave one out. They were required arguments, written out
 * the same way at all seven sites.
 */
export function regenerateRacePlan({
  profile,
  raceGoal,
  recentLayoff,
  weekSchedule,
  weeklyRunDays,
  currentDate,
  weekStart,
  tuning,
  carry,
  prior,
}: {
  /** The runner. Pgm6's tuning (`runTuningFromProfile`), Run17's confirmed
   *  easy pace (`planningEasyPaceSPerKm`), the run time limits and the
   *  running baseline all come from here: a plan built without one would
   *  regress a tuned plan to standard, or a benchmarked runner's long-run
   *  ceiling to the nominal table, on the next weekly refresh. */
  profile: UserProfile;
  raceGoal: {
    distance: "5k" | "10k" | "half" | "marathon";
    targetDate: string;
    eventName?: string;
  };
  weekSchedule: { day: number; type: "lift" | "run" | "both" | "rest" }[];
  weeklyRunDays: number;
  currentDate: string;
  weekStart: string;
  /** Pgm6 knobs newer than `profile`: the run-plan editor saves them and
   *  refreshes before this closure's profile has caught up
   *  (`RefreshRunScheduleOverrides.tuning`). */
  tuning?: RunTuning;
  /** Run15 — how long the runner has been away. Required for the same reason
   *  it is required on `RacePlanV2Input`: a regen site that forgets it would
   *  silently rebuild a returning runner's week at mid-block volume, and a
   *  compile error is a better guard than a convention. */
  recentLayoff: LayoffClass;
  carry?: {
    currentWeek?: number;
    totalWeeks?: number;
    completedRaces?: string[];
    /** RUN-H1: an active recovery phase + its end date. A regen must NEVER
     *  silently drop recovery (makeRunPlanRecord doesn't emit these fields), so
     *  callers that run while recovery is live pass them through to be
     *  preserved. Recovery EXIT stays a deliberate decision
     *  (resolveRecoveryExit) — callers that intend to exit simply don't pass
     *  them. */
    phase?: "recovery";
    recoveryEndDate?: string;
  };
  /** Run9 phase-3 Slice A — when a regen rewrites the CURRENT week with
   *  existing completions (compress / shift / schedule edit), pass the
   *  pre-regen runDays + manualCompletions so terminal status is re-stamped
   *  and manualCompletions are re-keyed onto the same-date new days. Omitted
   *  on fresh-creation sites (load with no prior runDays) where there is
   *  nothing to carry. */
  prior?: {
    runDays: ScheduledRunDay[];
    manualCompletions?: Record<string, ManualCompletion>;
  };
}): {
  runDays: ScheduledRunDay[];
  runPlan: RunPlan;
  /** Re-keyed map — present only when `prior` was supplied; callers that pass
   *  `prior` must persist this in place of the stale programState map. */
  manualCompletions?: Record<string, ManualCompletion>;
} {
  const v2 = generateRacePlanV2({
    raceGoal,
    weekSchedule,
    weeklyRunDays,
    currentDate,
    weekStart,
    tuning: tuning ?? runTuningFromProfile(profile),
    recentLayoff,
    easyPaceSPerKm: planningEasyPaceSPerKm(profile.runFitness),
    runningBaseline: profile.runningBaseline ?? null,
    runTimeLimits: profile.runTimeLimits ?? null,
    // The block's original length, so the generator emits the week for where
    // the runner actually IS rather than week 0 of a fresh block. Without it
    // `weeks[0]` — the only week any caller persists — is always a base week,
    // and
    // the ramp lives in `weeks[1..n]` where nothing reads it. See the
    // `planTotalWeeks` doc comment in runScheduler.ts for the measurement.
    // Absent on fresh-creation sites, which is the correct fallback: a new
    // plan genuinely is at position 0.
    planTotalWeeks: carry?.totalWeeks,
  });
  let runDays = v2.weeks[0] ?? [];
  let carriedManualCompletions: Record<string, ManualCompletion> | undefined;
  if (prior) {
    const carried = carryCompletionsAcrossRegen(
      prior.runDays,
      runDays,
      prior.manualCompletions
    );
    runDays = carried.runDays;
    carriedManualCompletions = carried.manualCompletions;
  }
  const runPlan = makeRunPlanRecord(v2, raceGoal, carry);
  if (carry?.completedRaces) {
    runPlan.completedRaces = carry.completedRaces;
  }
  // RUN-H1: preserve an active recovery phase across regen when the caller
  // passes it. makeRunPlanRecord emits a fresh race_prep record with no
  // phase/recoveryEndDate, so without this a regen during recovery (e.g.
  // week auto-rollover, realign) would silently exit recovery.
  if (carry?.phase) runPlan.phase = carry.phase;
  if (carry?.recoveryEndDate) runPlan.recoveryEndDate = carry.recoveryEndDate;
  // Compress / late-mid-week regen can produce a smaller totalWeeks
  // than the carried currentWeek (user on week 5 of 8, plan compresses
  // to 3 → "Week 5 of 3" surfaces in the race-strip and downstream
  // phase math). Clamp here once so every caller is covered.
  // currentWeek is 0-based (fresh plans start at 0; the cockpit renders
  // currentWeek + 1), so the last valid index is totalWeeks - 1.
  if (
    typeof runPlan.currentWeek === "number" &&
    typeof runPlan.totalWeeks === "number"
  ) {
    runPlan.currentWeek = clampPlanWeek(
      runPlan.currentWeek,
      runPlan.totalWeeks
    );
  }
  return { runDays, runPlan, manualCompletions: carriedManualCompletions };
}

/** The run side of the week moved into (`nextRunWeek`). */
export interface NextRunWeek extends Pick<ProgramState, "runDays" | "runPlan"> {
  /** Where a race plan stands in that week, for the lift side to place a
   *  race plan's lighter weeks and the race's own (`advanceWeek`): none once
   *  its race has passed, whatever the plan kept for the race's ending. */
  raceBlock: RaceBlockWeek | null;
}

/**
 * The run side of moving the programme into the next week, shared by the
 * Monday rollover and "Start next week". `current` is the programme in the
 * week being left, of which only the run plan and its days are read; `next`
 * is the week moved into. Worked out before the lift side moves on, which
 * reads the result to place a race plan's lighter weeks.
 */
export function nextRunWeek(
  current: ProgramState,
  next: { weekStart: string; date: string },
  profile: UserProfile,
  recentLayoff: LayoffClass
): NextRunWeek {
  const weekSchedule = profile.weekSchedule ?? [];
  const runPlan = current.runPlan;
  // Asked about NEXT week's date, not today: the question is whether the
  // week being rolled into is still inside the recovery window.
  if (runPlan && isInRecoveryOn(runPlan, next.date)) {
    // RUN-H1: a week rolling over mid-recovery must STAY a recovery week
    // and keep phase/recoveryEndDate — never regenerate a race plan (which
    // emits race-training runDays AND drops the recovery flags via
    // makeRunPlanRecord). Mirrors refreshRunSchedule's recovery branch;
    // recovery exit is a deliberate decision (resolveRecoveryExit), not a
    // rollover side effect.
    return {
      runDays: scheduleRecoveryWeekV2({
        weekSchedule,
        weekStart: next.weekStart,
      }),
      runPlan: { ...runPlan },
      raceBlock: raceBlockWeek(runPlan),
    };
  }
  if (
    profile.runMode === "race_prep" &&
    profile.raceGoal &&
    // R3: same elapsed guard as refreshRunSchedule — a week rolling over
    // after an elapsed race (recovery ended, raceGoal not yet server-
    // cleared) must not regenerate a plan dated in the past. It waits for
    // the race's own ending, below.
    next.date <= profile.raceGoal.targetDate
  ) {
    const regenerated = regenerateRacePlan({
      profile,
      recentLayoff,
      raceGoal: profile.raceGoal,
      weekSchedule,
      weeklyRunDays: getWeeklyRunTarget(profile) || 3,
      currentDate: next.date,
      weekStart: next.weekStart,
      carry: {
        currentWeek: (runPlan?.currentWeek ?? 0) + 1,
        totalWeeks: runPlan?.totalWeeks,
        completedRaces: runPlan?.completedRaces,
      },
    });
    return {
      runDays: regenerated.runDays,
      runPlan: regenerated.runPlan,
      raceBlock: raceBlockWeek(regenerated.runPlan),
    };
  }
  if (raceAwaitsItsEnding(runPlan, profile, next.date)) {
    // R3: nothing is planned after the race. Race prep is the race
    // lifecycle's to end, from this plan and its race day, so the plan and
    // its last run days stay where they are, on their own dates, until it
    // does. The lifts take the calendar over (`weekRolloverAnchor`), into
    // the week after the race: the plan kept still sits at its race week,
    // which the lift side mustn't read as the week moved into.
    return {
      runDays: current.runDays ?? [],
      runPlan: { ...runPlan! },
      raceBlock: null,
    };
  }
  // RUN-M: structured mode is retired (Run9a — the Run surface is two
  // states, freeform + race_prep), so a week that is neither recovering nor
  // racing is free running: no planned runs, no runPlan. Never resurrect a
  // structured week here.
  return { runDays: [], runPlan: undefined, raceBlock: null };
}

/**
 * The most weeks one rollover moves a plan, so one write stays bounded. It
 * caps a pass, not the catch-up: the effect runs again on the plan it
 * saved, so a plan twenty weeks behind is caught up in two writes (twelve
 * weeks, then eight).
 */
export const MAX_ROLLOVER_WEEKS = 12;

/** A plan after a rollover, and how many weeks it moved. */
export interface RolledOver {
  /** The plan in the week reached, or the one given when nothing moved. */
  state: ProgramState;
  /** Weeks moved: 0 when this side's calendar is not the plan's, or not
   *  behind, and never more than `MAX_ROLLOVER_WEEKS`. */
  weeks: number;
}

/**
 * The rollover for a plan that follows its runs: each week the run side is
 * behind `todayWeekKey`, the run plan moves first (`nextRunWeek`), so the
 * lift side knows whether the week it moves into is the run plan's
 * step-back week, where a race plan puts the lighter week. The lift side's
 * week key moves with the runs, so a plan that later goes freeform doesn't
 * inherit a stale one (D1).
 *
 * The week left behind is not kept on the plan: its run days give way to
 * the next week's, and `advanceWeek` archives its lifts into `weekHistory`
 * only if something in it was done.
 */
export function rollRunWeeks(
  state: ProgramState,
  profile: UserProfile,
  todayWeekKey: string,
  recentLayoff: LayoffClass
): RolledOver {
  if (weekRolloverAnchor(state, profile)?.side !== "run") {
    return { state, weeks: 0 };
  }
  let rolling = state;
  let weeks = 0;
  while (weeks < MAX_ROLLOVER_WEEKS) {
    const currentRunWeekKey = rolling.runDays?.[0]?.weekKey;
    if (!currentRunWeekKey || currentRunWeekKey >= todayWeekKey) break;
    const nextRunDate = addLocalDays(parseLocalDate(currentRunWeekKey), 7);
    // A race plan with nothing left to plan after its race stays where it
    // is for the race's own ending (`raceAwaitsItsEnding`); from here the
    // lifts carry the calendar (`rollLiftWeeks`).
    if (
      raceAwaitsItsEnding(
        rolling.runPlan,
        profile,
        localDateString(nextRunDate)
      )
    )
      break;

    // Advance lift side (workouts, weekNumber, weekHistory).
    // Backlog #8: the deload recipe follows training age (Helms H4).
    // Backlog #9: plus the joint plateau x recovery adjustment rule.
    // 4th arg (D1): keep the lift anchor moving in lockstep on this path
    // too, so a user who later switches to freeform doesn't inherit a stale
    // `liftWeekKey` and trigger a spurious catch-up.
    const nextLiftWeekKey = localWeekKey(
      addLocalDays(parseLocalDate(currentRunWeekKey), 7)
    );
    // A lift anchor already at or past that week (a Thursday-to-Sunday
    // start's long first week, or a manual "next week") holds the lift
    // side still; the runs, which are date-pinned (ADR-0002), roll on.
    const liftsAhead =
      !!rolling.liftWeekKey && rolling.liftWeekKey >= nextLiftWeekKey;

    // Advance run side: one week step from the current runDay week key.
    // First, so the lift side knows whether the week rolled into is the
    // run plan's step-back week, where a race plan puts the lighter week.
    const runs = nextRunWeek(
      rolling,
      {
        weekStart: localWeekKey(nextRunDate),
        date: localDateString(nextRunDate),
      },
      profile,
      recentLayoff
    );
    const advanced = liftsAhead
      ? { ...rolling }
      : advanceWeek(
          rolling,
          profile.experience,
          nextLiftWeekKey,
          runs.raceBlock,
          { raceLegTrim: profile.raceLegTrim === true }
        );
    advanced.runDays = runs.runDays;
    advanced.runPlan = runs.runPlan;

    rolling = advanced;
    weeks++;
  }
  return { state: rolling, weeks };
}

/**
 * The rollover for a plan that follows its lifts (D1): a pure lifter, or a
 * runner with no run plan this week. Each week the lift side's key is behind
 * `todayWeekKey` moves one week, whether or not anything was done in it:
 * `advanceWeek` keeps a week in `weekHistory` only if something in it was
 * done, and holds the week number for a week with no training.
 */
export function rollLiftWeeks(
  state: ProgramState,
  profile: UserProfile,
  todayWeekKey: string
): RolledOver {
  if (weekRolloverAnchor(state, profile)?.side !== "lift") {
    return { state, weeks: 0 };
  }
  let rolling = state;
  let weeks = 0;
  while (weeks < MAX_ROLLOVER_WEEKS) {
    const current = rolling.liftWeekKey;
    if (!current || current >= todayWeekKey) break;
    const nextKey = localWeekKey(addLocalDays(parseLocalDate(current), 7));
    rolling = advanceWeek(rolling, profile.experience, nextKey);
    weeks++;
  }
  return { state: rolling, weeks };
}
