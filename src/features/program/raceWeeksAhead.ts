import { runWeekKeyOf } from "./programMaintenance";
/**
 * The weeks ahead of a race plan (R23, locked in Pgm8): each
 * week from next week to race week, by its Monday, with its long run and
 * its quality sessions named as Train names them, and nothing of the day to
 * day, as Runna shows its calendar. No days and no easy runs; race week
 * shows the race. A free runner has no plan to outline (Run9 stands), and
 * nothing here names base, build or peak (E3a; Run9f).
 *
 * NO SECOND ENGINE. A week of a race plan is built when the calendar
 * reaches it, by the rollover's `nextRunWeek` (`rollRunWeeks`, which
 * `useProgram`'s effect runs), from the plan's record and the profile. This
 * walks that same function forward from the plan as it stands, a week at a
 * time, and reads what each week holds. It does not read the generator's
 * whole-plan pass (`generateRacePlanV2(...).weeks`), though that pass lays
 * out every week already, because it is not what arrives: the generator
 * judges whether a compressed plan keeps its quality sessions by the weeks
 * LEFT (`skipQualityEntirely`), so a compressed marathon's last build week
 * held a tempo in the pass made at the start and none when its own week was
 * built (measured on marathons 6, 8 and 10 weeks out).
 * `raceWeeksAhead.property.test.ts` holds the outline to the weeks the
 * rollover then builds.
 *
 * THE PLAN AS IT STANDS TODAY. Each week is rebuilt when it starts, from
 * that day's profile and runs: a confirmed benchmark, a change of run days
 * or tuning, a realign, or a layoff all change the weeks after them. The
 * layoff here is today's reading (`recentLayoff`, the value every regen
 * site takes), so a returning runner's outline keeps the re-entry shape
 * until the re-entry window closes and the weeks are rebuilt.
 *
 * COST. Each step regenerates the plan's remaining weeks, so the walk grows
 * with the square of the weeks to the race. Measured warm in Node: 7 ms
 * for a marathon 16 weeks out, 35 ms for one a year out,
 * 0.2 s at `MAX_WEEKS_AHEAD`, where it stops. Train works it out only when
 * the outline is opened.
 */
import type { UserProfile } from "@/lib/auth";
import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
} from "@/lib/dateHelpers";
import { resolveDistanceUnit } from "@/lib/distanceUnits";
import { racePaceWorkFor } from "@/lib/racePace";
import { runSessionName } from "@/lib/runSessionAbout";
import {
  isRunWalkTemplateId,
  RUN_TEMPLATES,
  type RunTemplate,
} from "@/lib/workoutTemplates";
import type { DatedRun, LayoffClass } from "./layoffDetection";
import type { ProgramState, RunPlan, ScheduledRunDay } from "./programTypes";
import { getRaceMinWeeks, isRunStepBackWeek } from "./runPlanTiming";
import { raceBlockWeek, type RaceBlockWeek } from "./weekPrescription";
import { nextRunWeek } from "./weekRollover";

/** Two years of weeks: a race further out shows its first two years. */
export const MAX_WEEKS_AHEAD = 104;

/** A run the outline names. */
export interface OutlineRun {
  templateId: string;
  /** As Train names it (`runSessionName`, Run21 (2)): "Long 15K", "Long
   *  20K with race pace", "20 Min Tempo at race pace", "Marathon Race". */
  name: string;
}

/** What a week of the plan holds, as the outline says it. */
export interface WeekHolds {
  /** Race week's race. */
  race: OutlineRun | null;
  /** The long run, or the run the plan holds in its place: a long run
   *  fitted to a saved time or to the running last reported keeps the
   *  long run's day under another session's name. */
  long: OutlineRun | null;
  /** Tempo and intervals sessions, in the week's order. */
  quality: OutlineRun[];
  /** A new runner's first weeks (Run20 (5)), when every run is the week's
   *  run-walk session: that session. */
  runWalk: OutlineRun | null;
  /** How many runs the week holds, so a week of easy running only can be
   *  told from a week with none. */
  runCount: number;
}

/** A coming week of a race plan. */
export interface RaceWeekAhead {
  /** The week's Monday, "YYYY-MM-DD" (`localWeekKey`). */
  weekKey: string;
  /** A week the run plan steps back (`isRunStepBackWeek`): its long run
   *  and easy runs ease off, and with a race plan the lifting's lighter
   *  week falls on it too (Lift4 (9)). Never a taper week or race week. */
  lighter: boolean;
  holds: WeekHolds;
}

const templateOf = (id: string | null | undefined): RunTemplate | undefined =>
  id ? RUN_TEMPLATES.find((t) => t.id === id) : undefined;

/** A run the plan fitted in place of a long run (`fitRunToTimeLimit`,
 *  `fitWeekToRunningBaseline`), which says what it replaced. */
function standsInForLongRun(day: ScheduledRunDay): boolean {
  const replaced =
    day.trainingBasis?.originalTemplateId ?? day.timeLimit?.originalTemplateId;
  return templateOf(replaced)?.type === "long";
}

/**
 * What a week's runs hold, named as Train names each one: a session's
 * race-pace work comes from the week's own place in the plan, through the
 * launch's gate (`racePaceWorkFor`).
 */
export function weekHolds(
  runDays: readonly ScheduledRunDay[],
  context: {
    profile: Pick<
      UserProfile,
      "runMode" | "raceGoal" | "runFitness" | "preferredDistanceUnit"
    >;
    /** The run plan's record for that week (its `currentWeek`). */
    runPlan: RunPlan | null | undefined;
  }
): WeekHolds {
  const runs = runDays.flatMap((day) => {
    const template = templateOf(day.userOverride || day.templateId);
    return template ? [{ day, template }] : [];
  });
  const named = ({ template }: { template: RunTemplate }): OutlineRun => ({
    templateId: template.id,
    name: runSessionName(
      template,
      racePaceWorkFor(template, context.profile, context.runPlan),
      resolveDistanceUnit(context.profile.preferredDistanceUnit)
    ),
  });
  const race = runs.find((run) => run.template.type === "race");
  const long =
    runs.find((run) => run.template.type === "long") ??
    runs.find((run) => standsInForLongRun(run.day));
  const quality = runs.filter(
    (run) => run.template.type === "tempo" || run.template.type === "intervals"
  );
  const runWalk =
    !race && !long && quality.length === 0
      ? runs.find((run) => isRunWalkTemplateId(run.template.id))
      : undefined;
  return {
    race: race ? named(race) : null,
    long: long ? named(long) : null,
    quality: quality.map(named),
    runWalk: runWalk ? named(runWalk) : null,
    runCount: runs.length,
  };
}

function weekAhead(
  weekKey: string,
  runDays: readonly ScheduledRunDay[],
  runPlan: RunPlan | undefined,
  block: RaceBlockWeek | null,
  profile: UserProfile
): RaceWeekAhead {
  return {
    weekKey,
    lighter:
      !!block &&
      isRunStepBackWeek(block.weekIndex, block.totalWeeks, block.distance),
    holds: weekHolds(runDays, { profile, runPlan }),
  };
}

/** This week and race week, for a race plan whose race is after this
 *  week; null otherwise. */
function outlineSpan(
  profile: Pick<UserProfile, "runMode" | "raceGoal">,
  programState: Pick<ProgramState, "runPlan"> | null | undefined,
  today: string
): { thisWeek: string; raceWeek: string } | null {
  if (
    profile.runMode !== "race_prep" ||
    !profile.raceGoal ||
    !programState?.runPlan
  )
    return null;
  const thisWeek = localWeekKey(parseLocalDate(today));
  const raceWeek = localWeekKey(parseLocalDate(profile.raceGoal.targetDate));
  return raceWeek > thisWeek ? { thisWeek, raceWeek } : null;
}

/** Whether a race plan has weeks ahead to outline, without building them:
 *  Train asks before it offers the outline. */
export function hasRaceWeeksAhead(
  profile: Pick<UserProfile, "runMode" | "raceGoal">,
  programState: Pick<ProgramState, "runPlan"> | null | undefined,
  today: string
): boolean {
  return outlineSpan(profile, programState, today) !== null;
}

/**
 * The race plan's weeks after this one, to race week, as the rollover will
 * build them from the plan and the profile as they stand. Empty without a
 * race plan, or when the race is this week.
 */
export function raceWeeksAhead({
  profile,
  programState,
  recentLayoff,
  recentRuns = null,
  today,
}: {
  profile: UserProfile;
  programState: ProgramState | null | undefined;
  /** Today's layoff reading (`useProgram`'s `recentLayoff`), which the
   *  rollover would build next week with. */
  recentLayoff: LayoffClass;
  /** The recent runs read with it (`useProgram`'s `recentRuns`): a running
   *  starting point's climb is sized at their pace. */
  recentRuns?: readonly DatedRun[] | null;
  /** Local "YYYY-MM-DD". */
  today: string;
}): RaceWeekAhead[] {
  const span = outlineSpan(profile, programState, today);
  if (!span || !programState) return [];
  const { thisWeek, raceWeek } = span;

  const weeks: RaceWeekAhead[] = [];
  // The rollover moves a plan on from its runs' week (`weekRolloverAnchor`).
  // A plan behind the calendar is walked through the weeks it has still to
  // catch up; one moved on early ("Start next week") already holds its
  // next week, which is the first week ahead.
  let week = runWeekKeyOf(programState) ?? thisWeek;
  if (week > thisWeek) {
    weeks.push(
      weekAhead(
        week,
        programState.runDays ?? [],
        programState.runPlan,
        raceBlockWeek(programState.runPlan),
        profile
      )
    );
  }
  let state: ProgramState = programState;
  while (weeks.length < MAX_WEEKS_AHEAD) {
    const monday = addLocalDays(parseLocalDate(week), 7);
    const next = {
      weekStart: localWeekKey(monday),
      date: localDateString(monday),
    };
    if (next.weekStart > raceWeek) break;
    // The weeks ahead as if followed: their runs aren't done yet, so a
    // running starting point climbs them by the calendar, at the pace of
    // the runs read today.
    const moved = nextRunWeek(
      state,
      next,
      profile,
      recentLayoff,
      recentRuns,
      today
    );
    // No race plan in the week moved into: free running from there on.
    if (moved.runPlan?.mode !== "race_prep") break;
    state = { ...state, runDays: moved.runDays, runPlan: moved.runPlan };
    week = next.weekStart;
    if (week > thisWeek) {
      weeks.push(
        weekAhead(
          week,
          moved.runDays ?? [],
          moved.runPlan,
          moved.raceBlock,
          profile
        )
      );
    }
  }
  return weeks;
}

/** A race's distance in km, by the plan's distance key. */
const RACE_KM: Record<string, number> = {
  "5k": 5,
  "10k": 10,
  half: 21.1,
  marathon: 42.2,
};

/** The longest long run in the weeks after this one to race week, as the
 *  rollover will build them; 0 when they hold none. */
function longestLongKm(input: Parameters<typeof raceWeeksAhead>[0]): number {
  return Math.max(
    0,
    ...raceWeeksAhead(input).map(({ holds }) => {
      const km = templateOf(holds.long?.templateId)?.config.targetDistanceKm;
      return holds.race === null && typeof km === "number" ? km : 0;
    })
  );
}

export interface RaceLongRunReach {
  /** The longest long run the plan builds before the race. */
  longestKm: number;
  /** The race's distance. */
  raceKm: number;
  /** The longest the same plan builds for this runner when it has the
   *  weeks a full block takes (`getRaceMinWeeks`, and two more). */
  fullKm: number;
}

/**
 * How far a race is past the long run the plan can build to before it
 * (Run15, deep dive D11): the longest long run in the weeks after this one
 * to race week, as the rollover will build them (`raceWeeksAhead`), beside
 * the race's distance and what the same plan builds with a full block's
 * weeks. This week is left out: a plan the runner is coming back to may
 * still hold the week from before the gap, which the rebuild replaces.
 * Null without a race plan, a known distance, a long run in those weeks,
 * or, for a return, the runs it climbs from: without them the plan climbs
 * no further than base, which says nothing about what it will build once
 * the runs are read.
 */
export function raceLongRunReach(
  input: Parameters<typeof raceWeeksAhead>[0]
): RaceLongRunReach | null {
  const goal = input.profile.raceGoal;
  const raceKm = RACE_KM[goal?.distance ?? ""];
  if (!goal || !raceKm) return null;
  if (input.recentLayoff === "detrained" && !input.recentRuns) return null;
  const longestKm = longestLongKm(input);
  if (longestKm === 0) return null;
  const fullWeeks = getRaceMinWeeks(goal.distance) + 2;
  const fullKm = longestLongKm({
    ...input,
    profile: {
      ...input.profile,
      raceGoal: {
        ...goal,
        targetDate: localDateString(
          addLocalDays(
            parseLocalDate(localWeekKey(parseLocalDate(input.today))),
            fullWeeks * 7 + 6
          )
        ),
      },
    },
  });
  return { longestKm, raceKm, fullKm: Math.max(fullKm, longestKm) };
}

/** Of the long run a full block builds, the share a return has to reach
 *  before its race for the welcome-back sheet to offer the rebuild first
 *  (deep dive D11). A Tropos heuristic in the RUN-EV-06 register, not a
 *  source rule: a half plan that peaks at 20 km is in reach from 15. */
export const RACE_REACH_SHARE = 0.75;

/**
 * Whether a race is out of the plan's reach (deep dive D11): its long run
 * gets neither to the race's distance nor to `RACE_REACH_SHARE` of what a
 * full block builds. A 5K the plan already runs past is in reach however
 * close; a marathon whose long run gets to the plan's own peak is in reach
 * though the peak is well short of 42.2 km.
 */
export function raceOutOfReach(reach: RaceLongRunReach | null): boolean {
  return (
    !!reach &&
    reach.longestKm < reach.raceKm &&
    reach.longestKm < RACE_REACH_SHARE * reach.fullKm
  );
}
