/**
 * The weeks ahead of a plan with no race date (Run24 (3), deep dive D7),
 * as a race plan's are outlined (`raceWeeksAhead`, R23 in Pgm8): each
 * coming week by its Monday, with its long run and its sessions named as
 * Train names them, and its lighter week marked. A plan with no date has
 * no last week, so the outline shows the next `ROLLING_WEEKS_SHOWN` and
 * says where its long run stops climbing and holds.
 *
 * NO SECOND ENGINE. Every week here is the one the rollover builds when
 * the calendar reaches it, from the plan and the profile as they stand,
 * today's layoff reading and the recent runs. A week the plan has still to
 * catch up is `nextRunWeek`'s own; the weeks after this one are one pass
 * of the same generator `nextRunWeek` runs (`rollingWeeksFrom`), which
 * builds a plan from its first week every time, so the pass and a week at
 * a time agree. `rollingWeeksAhead.test.ts` holds every week of the
 * outline to `nextRunWeek`'s, for each goal and several runners. (A race
 * plan's outline walks `nextRunWeek` week by week, because its generator
 * reads the weeks left; this one has no last week.)
 *
 * Where the long run holds is read from those weeks, not from the goal's
 * horizon: a runner's own week, Pgm6's volume knob, their pace and a
 * layoff all move it, and the generator is where they meet. A lighter week
 * is the generator's own test of the plan's week (`isRollingStepBack`).
 *
 * The same weeks give "Why this run" its place in the plan
 * (`rollingSessionContexts`): the plan's first week, a lighter week, and
 * whether the long run still climbs or holds.
 *
 * COST. One pass of half a year's weeks: about 1 ms for a new plan and 2 to
 * 10 ms two years in, measured warm in Node, so Home, Train and the run
 * page work it out as they draw.
 */
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import { type DistanceUnit, resolveDistanceUnit } from "@/lib/distanceUnits";
import { RUN_TEMPLATES } from "@/lib/workoutTemplates";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import { rollingGoalOf, runWeekKeyOf } from "./programMaintenance";
import type { ProgramState, ScheduledRunDay } from "./programTypes";
import { weekHolds, type WeekHolds } from "./raceWeeksAhead";
import type { RollingGoal } from "./rollingPlan";
import { rollingRunPlan, rollingWeeksFrom } from "./rollingWeek";
import { isRollingStepBack, ROLLING_CYCLE_WEEKS } from "./runPlanTiming";
import { nextRunWeek } from "./weekRollover";

/** The coming weeks the outline lists: three of the plan's four-week
 *  cycles. */
export const ROLLING_WEEKS_SHOWN = 12;

/** The weeks read past this one to find where the long run holds: half a
 *  year, past the longest climb any goal makes (a long run from 6 km to a
 *  bigger plan's 16, a rung every two weeks that build). */
export const ROLLING_WEEKS_READ = 26;

/** A week of a plan with no race date, as the rollover builds it. */
export interface RollingWeekAhead {
  /** The week's Monday, "YYYY-MM-DD" (`localWeekKey`). */
  weekKey: string;
  /** The plan's week, from 0 (`RunPlan.currentWeek`). */
  planWeek: number;
  /** The plan steps back this week: its long run comes a rung down and
   *  its easy runs ease off (`isRollingStepBack`, the generator's own). */
  lighter: boolean;
  holds: WeekHolds;
  /** The long run's distance, km: a long run fitted to a saved time or to
   *  the running last reported counts at the distance it stands in for.
   *  Null for a week with none (a new runner's run-walk weeks). */
  longKm: number | null;
}

/** Where a plan's long run stops climbing: its distance, and the Monday
 *  of the first week that holds it. */
export interface LongRunHold {
  km: number;
  from: string;
}

/** What a plan with no race date's weeks ahead show (`rollingWeeksAhead`). */
export interface RollingOutline {
  /** The weeks after this one, `ROLLING_WEEKS_SHOWN` of them. */
  weeks: RollingWeekAhead[];
  /** Where the long run holds, read from the weeks the plan builds; null
   *  when those weeks do not show it holding (a climb past them, or no
   *  long run). */
  hold: LongRunHold | null;
}

/** A run's place in a plan with no race date, for "Why this run"
 *  (`runSessionExplainer`). */
export interface RollingSessionContext {
  goal: RollingGoal;
  /** The reader's unit, which the long run's distance is said in. */
  unit: DistanceUnit;
  /** The plan's first week, which the climb starts from. */
  opening: boolean;
  /** One of the plan's lighter weeks. */
  lighter: boolean;
  /** The long run the plan climbs to and holds, and whether this week is
   *  past the climb; null when the weeks read do not show where it holds. */
  longRun: { topKm: number; holding: boolean } | null;
}

interface RollingWalkInput {
  profile: UserProfile;
  programState: ProgramState | null | undefined;
  /** Today's layoff reading (`useProgram`'s `recentLayoff`), which the
   *  rollover would build next week with. */
  recentLayoff: LayoffClass;
  /** The recent runs read with it (`useProgram`'s `recentRuns`). */
  recentRuns?: readonly DatedRun[] | null;
  /** Local "YYYY-MM-DD". */
  today: string;
}

const templateOf = (id: string | null | undefined) =>
  id ? RUN_TEMPLATES.find((t) => t.id === id) : undefined;

/**
 * A week's long run, km, as the plan has it: the long run, or the long run
 * a fitted run stands in for (`fitRunToTimeLimit`,
 * `fitWeekToRunningBaseline` say which). The person's swap of a day is
 * theirs, not the plan's, so the plan's own session is read.
 */
export function plannedLongKm(
  runDays: readonly ScheduledRunDay[]
): number | null {
  let km: number | null = null;
  for (const day of runDays) {
    const own = templateOf(day.templateId);
    const replaced = templateOf(
      day.trainingBasis?.originalTemplateId ?? day.timeLimit?.originalTemplateId
    );
    const long = own?.type === "long" ? own : replaced;
    const distance =
      long?.type === "long" ? long.config.targetDistanceKm : undefined;
    if (typeof distance === "number") km = Math.max(km ?? 0, distance);
  }
  return km;
}

function weekAhead(
  weekKey: string,
  runDays: readonly ScheduledRunDay[],
  runPlan: ProgramState["runPlan"],
  profile: UserProfile
): RollingWeekAhead {
  const planWeek = Math.max(0, Math.trunc(runPlan?.currentWeek ?? 0));
  return {
    weekKey,
    planWeek,
    // As the generator tests its weeks (`generateRollingPlan`'s stepsBack).
    lighter: isRollingStepBack(planWeek),
    holds: weekHolds(runDays, { profile, runPlan }),
    longKm: plannedLongKm(runDays),
  };
}

/** The Monday `weeks` weeks after `weekKey`. */
const weeksAfter = (weekKey: string, weeks: number) =>
  localWeekKey(addLocalDays(parseLocalDate(weekKey), weeks * 7));

const nextMonday = (weekKey: string) => weeksAfter(weekKey, 1);

/**
 * The plan's weeks from the one its runs are in to `lastWeek`, as the
 * rollover builds them: the plan's stored week first; a week the plan has
 * still to catch up, up to this one, moved into by `nextRunWeek` itself,
 * as the rollover will; then the weeks after this one in one pass of the
 * generator (`rollingWeeksFrom`), which builds what `nextRunWeek` would
 * for weeks whose runs are still to come. Empty without a plan with no
 * race date.
 */
function walkRollingWeeks(
  input: RollingWalkInput,
  lastWeek: string
): RollingWeekAhead[] {
  const { profile, programState } = input;
  const goal = rollingGoalOf(programState, profile);
  if (!programState?.runPlan || !goal) return [];
  const thisWeek = localWeekKey(parseLocalDate(input.today));
  let week = runWeekKeyOf(programState) ?? thisWeek;
  const weeks = [
    weekAhead(week, programState.runDays ?? [], programState.runPlan, profile),
  ];
  let state: ProgramState = programState;
  while (week < thisWeek && week < lastWeek) {
    const weekStart = nextMonday(week);
    const moved = nextRunWeek(
      state,
      { weekStart, date: localDateString(parseLocalDate(weekStart)) },
      profile,
      input.recentLayoff,
      input.recentRuns ?? null,
      input.today
    );
    if (moved.runPlan?.mode !== "rolling") return weeks;
    state = { ...state, runDays: moved.runDays, runPlan: moved.runPlan };
    week = weekStart;
    weeks.push(weekAhead(week, moved.runDays ?? [], moved.runPlan, profile));
  }
  if (week >= lastWeek) return weeks;
  const from = nextMonday(week);
  const planWeek = weeks[weeks.length - 1].planWeek + 1;
  // The weeks ahead as if followed: their runs aren't done yet, so a
  // running starting point climbs them by the calendar, at the pace of the
  // runs read today.
  const ahead = rollingWeeksFrom({
    profile,
    goal,
    planWeek,
    weekStart: from,
    count: wholeWeeksBetween(from, lastWeek) + 1,
    recentLayoff: input.recentLayoff,
    recentRuns: input.recentRuns ?? null,
    recentRunsAsOf: input.today,
  });
  ahead.forEach((runDays, offset) => {
    weeks.push(
      weekAhead(
        weeksAfter(from, offset),
        runDays,
        rollingRunPlan(goal, planWeek + offset, weeksAfter(from, offset)),
        profile
      )
    );
  });
  return weeks;
}

/**
 * Where the long run holds in `weeks`: the longest long run they reach, and
 * the first week that reaches it, once every week after it that is not
 * lighter holds it, for at least a cycle's three such weeks. A climb still
 * under way at the end of the weeks, or a long run that moves again, shows
 * no hold.
 */
export function longRunHoldOf(
  weeks: readonly RollingWeekAhead[]
): LongRunHold | null {
  const kms = weeks.map((week) => week.longKm);
  const known = kms.filter((km): km is number => km !== null);
  if (known.length === 0) return null;
  const top = Math.max(...known);
  const first = kms.indexOf(top);
  const after = weeks.slice(first).filter((week) => !week.lighter);
  if (after.some((week) => week.longKm !== top)) return null;
  if (after.length < ROLLING_CYCLE_WEEKS - 1) return null;
  return { km: top, from: weeks[first].weekKey };
}

/** Whether the profile and programme hold a plan with no race date to
 *  outline, without building its weeks: Train asks before it offers it. */
export function hasRollingWeeksAhead(
  profile: Pick<UserProfile, "runMode">,
  programState: Pick<ProgramState, "runPlan"> | null | undefined
): boolean {
  return rollingGoalOf(programState, profile) !== null;
}

/**
 * The weeks after this one of a plan with no race date, as the rollover
 * will build them from the plan and the profile as they stand, and where
 * its long run holds. Empty without such a plan.
 */
export function rollingWeeksAhead(input: RollingWalkInput): RollingOutline {
  const thisWeek = localWeekKey(parseLocalDate(input.today));
  const walked = walkRollingWeeks(
    input,
    weeksAfter(thisWeek, ROLLING_WEEKS_READ)
  );
  return {
    weeks: walked
      .filter((week) => week.weekKey > thisWeek)
      .slice(0, ROLLING_WEEKS_SHOWN),
    hold: longRunHoldOf(walked),
  };
}

/**
 * Each week's place in a plan with no race date, by its Monday, for "Why
 * this run": the plan's stored week and the weeks the rollover will build
 * after it. Null without such a plan.
 */
export function rollingSessionContexts(
  input: RollingWalkInput
): Map<string, RollingSessionContext> | null {
  const goal = rollingGoalOf(input.programState, input.profile);
  if (!goal || !input.programState) return null;
  const from =
    runWeekKeyOf(input.programState) ??
    localWeekKey(parseLocalDate(input.today));
  const walked = walkRollingWeeks(input, weeksAfter(from, ROLLING_WEEKS_READ));
  const hold = longRunHoldOf(walked);
  const unit = resolveDistanceUnit(input.profile.preferredDistanceUnit);
  return new Map(
    walked.map((week) => [
      week.weekKey,
      {
        goal,
        unit,
        opening: week.planWeek === 0,
        lighter: week.lighter,
        longRun: hold
          ? { topKm: hold.km, holding: week.weekKey >= hold.from }
          : null,
      },
    ])
  );
}
