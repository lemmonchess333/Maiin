/**
 * The week ahead, as the weekly review ends on it (App1 Q36): the plan's
 * seven days for the week under way, what each one holds, and its counts.
 *
 * It reads the week the rest of the app reads. The counts are
 * `trainingWeek`'s, as Home's week and the finish screens count them, and
 * each day is `resolveTrainingWindow`'s, as Home's week strip and Train's
 * plan read it. It is the plan, not progress (Rev1's "static plan"): the
 * review has just told the week that ended, and this is the one it agrees.
 *
 * A lift day says "Lift" and never a session's name. Lifts follow their
 * order, not a weekday (ADR-0002), so the order is given once, beside the
 * days, as Train's plan gives it.
 */
import type { ProgramState } from "@/features/program/programTypes";
import { nextUpIndex } from "@/features/program/nextUpCursor";
import type { UserProfile } from "./auth";
import { localWeekKey, parseLocalDate } from "./dateHelpers";
import type { DistanceUnit } from "./distanceUnits";
import { runHeaderLine } from "./runHeaderLine";
import { runTemplateName, runTypeTitle } from "./runLabels";
import { plannedRunDose } from "./runDose";
import { resolveRunPlan } from "./runPlanResolver";
import { getWeeklyRunTarget } from "./scheduleUtils";
import { beforeStart, startDayKey } from "./startDay";
import {
  dayTypeFor,
  resolveTrainingWindow,
  runsWrittenForWeek,
} from "./trainingResolver";
import { trainingWeek } from "./trainingWeek";

export interface WeekAheadDay {
  /** "yyyy-MM-dd". */
  dateKey: string;
  isToday: boolean;
  /** Before today: shown quieter, as the plan held it. */
  past: boolean;
  /** Before the account began, when nothing was planned. */
  beforeStart: boolean;
  lift: boolean;
  /** The day's run, named in the reader's unit with its dose; a run day
   *  whose run the plan has not written (free running) is "Run" alone. */
  run: { name: string; dose: string | null } | null;
}

export interface WeekAheadView {
  /** The week's Monday. */
  weekKey: string;
  days: WeekAheadDay[];
  /** Planned lifts and runs, as `trainingWeek` counts them; null when the
   *  week plans none (a free runner's runs, a runner's lifts). */
  lifts: number | null;
  runs: number | null;
  /** The week's lifts in their order, from the next one ("Push", "Pull"). */
  liftOrder: string[];
  /** Where a race or starter plan stands, in Train's words; else null. */
  planLine: string | null;
}

/** The lifts still to do this week, from the next one, at most `count`. */
function liftOrder(
  programState: ProgramState | null,
  count: number | null
): string[] {
  const next = nextUpIndex(programState);
  if (!programState || next < 0 || !count) return [];
  const rest = programState.workouts.filter(
    (workout, index) => index !== next && !workout.completed && !workout.skipped
  );
  return [programState.workouts[next], ...rest]
    .slice(0, count)
    .map((workout) => workout.dayName);
}

/** Train's Run tab line, for a plan that has a position to state. */
function planLine(
  profile: UserProfile | null,
  programState: ProgramState | null,
  todayKey: string
): string | null {
  const runMode = profile?.runMode;
  const raceGoal = resolveRunPlan(profile, programState, todayKey).raceGoal;
  if (!(runMode === "starter" || (runMode === "race_prep" && raceGoal)))
    return null;
  const runPlan = programState?.runPlan;
  return runHeaderLine({
    runMode,
    raceGoal,
    currentWeek: runPlan?.currentWeek,
    totalWeeks: runPlan?.totalWeeks,
    phase: runPlan?.phase,
    recoveryEndDate: runPlan?.recoveryEndDate,
    todayKey,
    // Only while it is this week: the rollover drops it after.
    leadInWeek:
      runPlan?.leadInWeek === localWeekKey(parseLocalDate(todayKey))
        ? runPlan.leadInWeek
        : null,
    runsTarget: getWeeklyRunTarget(profile),
    starterStage: runPlan?.mode === "starter" ? runPlan.stage : null,
  });
}

export function weekAheadView({
  todayKey,
  profile,
  programState,
  unit,
}: {
  /** Local "yyyy-MM-dd": the week is the one it falls in. */
  todayKey: string;
  profile: UserProfile | null;
  programState: ProgramState | null;
  unit: DistanceUnit;
}): WeekAheadView {
  const weekKey = localWeekKey(parseLocalDate(todayKey));
  const startKey = startDayKey(profile?.createdAt);
  const counts = trainingWeek({
    weekKey,
    profile,
    programState,
    workouts: [],
    runs: [],
    now: parseLocalDate(todayKey),
  });
  // One week, so one answer: are its runs written? A run then sits on the
  // date the plan holds it, whatever the weekday (`dayTypeFor`).
  const runsWritten = runsWrittenForWeek(
    programState?.runDays,
    weekKey,
    weekKey
  );
  const days = resolveTrainingWindow({
    startDate: parseLocalDate(weekKey),
    days: 7,
    profile,
    programState,
    todayKey,
  }).map((day): WeekAheadDay => {
    const before = beforeStart(day.dateKey, startKey);
    const type = before ? "rest" : dayTypeFor(day, runsWritten);
    const runDay = day.run.runDay;
    const template = day.run.template;
    const running = type === "run" || type === "both";
    return {
      dateKey: day.dateKey,
      isToday: day.dateKey === todayKey,
      past: day.dateKey < todayKey,
      beforeStart: before,
      lift: type === "lift" || type === "both",
      run: !running
        ? null
        : !runDay
          ? { name: "Run", dose: null }
          : {
              name: template
                ? runTemplateName(template.name, unit)
                : runTypeTitle(runDay.type),
              dose: template
                ? plannedRunDose(template, profile?.runFitness, unit)
                : null,
            },
    };
  });
  return {
    weekKey,
    days,
    lifts: counts.lifts.planned,
    runs: counts.runs.planned,
    liftOrder: liftOrder(programState, counts.lifts.planned),
    planLine: planLine(profile, programState, todayKey),
  };
}
