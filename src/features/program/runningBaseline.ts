import {
  addLocalDays,
  localDateString,
  localWeekKey,
  parseLocalDate,
  wholeWeeksBetween,
} from "@/lib/dateHelpers";
import {
  isRunWalkTemplateId,
  RUN_TEMPLATES,
  type RunTemplate,
} from "@/lib/workoutTemplates";
import { firstFullWeekKey } from "./runPlanTiming";
import { plannedRunMinutes } from "./runTimeLimits";
import type { ScheduledRunDay } from "./programTypes";

/**
 * The running a person starts a race plan from: their recent weekly minutes
 * and their longest recent run, confirmed by them, from their recorded runs
 * (`recorded`) or as they said it (`self_reported`). The plan starts there
 * and climbs (`runningClimb`): it is a starting point, not a ceiling.
 * Someone new to running has none: setup's "New to running" (Run20 (5),
 * and the starter goal Run9 reopened for them) is their start.
 */
export interface RunningBaseline {
  version: 1;
  experience: "building" | "returning" | "regular";
  weeklyMinutes: number;
  longestRunMinutes: number;
  confirmedAt: string;
  source: "self_reported" | "recorded";
}

export function isRunningBaseline(
  value: unknown,
  allowIncomplete = false
): value is RunningBaseline {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as RunningBaseline;
  if (
    v.version !== 1 ||
    !["building", "returning", "regular"].includes(v.experience) ||
    !["self_reported", "recorded"].includes(v.source) ||
    typeof v.confirmedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v.confirmedAt) ||
    localDateString(parseLocalDate(v.confirmedAt)) !== v.confirmedAt ||
    !Number.isFinite(v.weeklyMinutes) ||
    !Number.isFinite(v.longestRunMinutes)
  )
    return false;
  return (
    allowIncomplete ||
    (Number.isInteger(v.weeklyMinutes) &&
      v.weeklyMinutes >= 10 &&
      v.weeklyMinutes <= 1200 &&
      Number.isInteger(v.longestRunMinutes) &&
      v.longestRunMinutes >= 10 &&
      v.longestRunMinutes <= 300 &&
      v.longestRunMinutes <= v.weeklyMinutes)
  );
}

/**
 * The rungs a person's longest run climbs, for a runner at
 * `easyPaceSPerKm`: the easy runs shorter than the first long run, then the
 * long runs (Run23's ladder), each with its minutes at that pace (Run17;
 * the template's own minutes without a confirmed pace).
 */
function longRunRungs(easyPaceSPerKm?: number | null): number[] {
  const minutes = (t: RunTemplate) => plannedRunMinutes(t, easyPaceSPerKm);
  const longs = RUN_TEMPLATES.filter((t) => t.type === "long")
    .map(minutes)
    .sort((a, b) => a - b);
  const easies = RUN_TEMPLATES.filter(
    (t) =>
      t.type === "easy" &&
      !t.config?.strides &&
      !isRunWalkTemplateId(t.id) &&
      minutes(t) < longs[0]
  )
    .map(minutes)
    .sort((a, b) => a - b);
  return [...new Set([...easies, ...longs])];
}

/** How many minutes the week's running besides the long run climbs each
 *  week: a rung at the foot of the plan's easy ladder (10, 20, 30 … minutes),
 *  a Tropos heuristic beside the newer runner's five a run a week
 *  (`NEW_RUNNER_BUILD_MINUTES`). */
export const CLIMB_OTHER_RUNS_MINUTES = 10;

/** The most a week's runs may take in a week of the climb. */
export interface RunningClimbWeek {
  /** Any one run, in minutes: the long run's rung this week. */
  longestMinutes: number;
  /** The week's runs besides the long run, together, in minutes. */
  otherMinutes: number;
}

/**
 * How far a person's running has climbed from their starting point by the
 * week starting `weekKey`. The plan's first long run is the rung at or under
 * their longest run, and it climbs one rung a week (Run23's ladder; the
 * easy runs under its first rung are rungs too), so it is never more than a
 * rung past anything the climb held before it. The rest of the week starts
 * at what they reported beside that run and climbs a rung of the easy
 * ladder a week (`CLIMB_OTHER_RUNS_MINUTES`). In the plan's step-back weeks
 * (`isStepBack`) the climb comes a rung under the week before and doesn't
 * move on, as the race curve's own step-back weeks ease off.
 *
 * The climb starts in the first full week from the day the starting point
 * was confirmed (`firstFullWeekKey`): a week before it, a lead-in, is held
 * to the starting point. The race curve the plan is built to stays the
 * upper bound, so once the climb has passed it the starting point shapes
 * nothing.
 *
 * Tropos heuristics in the RUN-EV-06 register: the rungs are the plan's
 * own ladders; no percentage is taken from a source.
 */
export function runningClimb(
  baseline: RunningBaseline,
  weekKey: string,
  options: {
    easyPaceSPerKm?: number | null;
    isStepBack?: (weekKey: string) => boolean;
  } = {}
): RunningClimbWeek {
  const rungs = longRunRungs(options.easyPaceSPerKm);
  let start = 0;
  rungs.forEach((minutes, i) => {
    if (minutes <= baseline.longestRunMinutes) start = i;
  });
  const startWeek = firstFullWeekKey(baseline.confirmedAt);
  const week = localWeekKey(parseLocalDate(weekKey));
  const isStepBack = options.isStepBack ?? (() => false);
  let climbed = 0;
  const weeks = Math.max(0, wholeWeeksBetween(startWeek, week));
  for (let k = 0; k < weeks; k++) {
    const key = localDateString(addLocalDays(parseLocalDate(startWeek), k * 7));
    if (!isStepBack(key)) climbed += 1;
  }
  // A step-back week is a rung under the week before it.
  const steps =
    week >= startWeek && isStepBack(week) ? Math.max(0, climbed - 2) : climbed;
  return {
    longestMinutes: rungs[Math.min(rungs.length - 1, start + steps)],
    otherMinutes:
      Math.max(0, baseline.weeklyMinutes - rungs[start]) +
      CLIMB_OTHER_RUNS_MINUTES * steps,
  };
}

/**
 * Fit a week of generated runs to how far the person's running has climbed
 * (`runningClimb`). Each run takes at most the climb's longest run, and the
 * runs besides the long run at most the climb's minutes for them, so the
 * long run keeps its rung. Floors bind honestly: no day is deleted to make
 * the total appear to fit. Saved work, run-walk sessions and the race are left as
 * they are. Someone building a routine or returning after a break runs easy
 * while the climb still holds their week under the plan's; once it doesn't,
 * the plan's own sessions stand.
 */
export function fitWeekToRunningBaseline(
  week: ScheduledRunDay[],
  baseline: RunningBaseline | null | undefined,
  climb: RunningClimbWeek | null,
  easyPaceSPerKm?: number | null
): ScheduledRunDay[] {
  if (!isRunningBaseline(baseline) || !climb)
    return week;
  const templateFor = (row: ScheduledRunDay) =>
    RUN_TEMPLATES.find((t) => t.id === (row.userOverride ?? row.templateId));
  const minutes = (t: RunTemplate) => plannedRunMinutes(t, easyPaceSPerKm);
  const protectedRow = (row: ScheduledRunDay) =>
    row.type === "race" ||
    row.completed ||
    row.userOverride ||
    isRunWalkTemplateId(row.templateId) ||
    (row.status && row.status !== "planned");
  const fitted = (row: ScheduledRunDay) => !protectedRow(row);
  const runMinutes = (rows: ScheduledRunDay[]) =>
    rows.reduce((sum, row) => {
      const t = templateFor(row);
      return sum + (t && t.type !== "race" ? minutes(t) : 0);
    }, 0);
  /** The long run's day, by what the plan put there. */
  const isLongRow = (row: ScheduledRunDay) =>
    RUN_TEMPLATES.find(
      (t) => t.id === (row.trainingBasis?.originalTemplateId ?? row.templateId)
    )?.type === "long";
  // A week with no long run (a lead-in, a taper's last weeks) gives its
  // runs the long run's minutes too.
  const otherMinutes =
    climb.otherMinutes +
    (week.some((row) => fitted(row) && isLongRow(row))
      ? 0
      : climb.longestMinutes);
  // Still building towards the plan: the climb holds a run or the rest of
  // the week under what the plan asks for.
  const building =
    week.some((row) => {
      const t = templateFor(row);
      return fitted(row) && t && minutes(t) > climb.longestMinutes;
    }) ||
    runMinutes(week.filter((row) => fitted(row) && !isLongRow(row))) >
      otherMinutes;
  const easyOnly = building && baseline.experience !== "regular";
  const replace = (
    row: ScheduledRunDay,
    t: RunTemplate,
    reason: NonNullable<ScheduledRunDay["trainingBasis"]>["reason"]
  ): ScheduledRunDay =>
    t.id === row.templateId
      ? row
      : {
          ...row,
          templateId: t.id,
          type: t.type,
          trainingBasis: {
            originalTemplateId:
              row.trainingBasis?.originalTemplateId ?? row.templateId,
            confirmedAt: baseline.confirmedAt,
            reason,
          },
        };
  const choices = (
    original: RunTemplate,
    ceiling: number,
    onlyEasy = false
  ) => {
    const fitting = RUN_TEMPLATES.filter(
      (t) =>
        t.type !== "race" &&
        !isRunWalkTemplateId(t.id) &&
        minutes(t) <= ceiling &&
        (onlyEasy
          ? t.type === "easy" && !t.config?.strides
          : t.type === original.type &&
            Boolean(t.config?.strides) === Boolean(original.config?.strides))
    ).sort((a, b) => minutes(b) - minutes(a) || a.id.localeCompare(b.id));
    return (
      fitting[0] ??
      RUN_TEMPLATES.filter(
        (t) =>
          t.type === "easy" &&
          !t.config?.strides &&
          !isRunWalkTemplateId(t.id) &&
          minutes(t) <= ceiling
      ).sort((a, b) => minutes(b) - minutes(a))[0]
    );
  };
  let rows = week.map((row) => {
    const original = templateFor(row);
    if (!fitted(row) || !original) return row;
    // Faster running: a tempo, intervals or strides. A long run is run
    // easy, and climbs as a long run.
    const faster =
      (original.type !== "easy" && original.type !== "long") ||
      Boolean(original.config?.strides);
    const ceiling = Math.min(minutes(original), climb.longestMinutes);
    const replacement = choices(original, ceiling, easyOnly && faster);
    return replacement
      ? replace(row, replacement, easyOnly && faster ? "experience" : "longest")
      : row;
  });
  // The rest of the week: take the smallest available reduction from its
  // longest run, a step at a time. The long run keeps its rung.
  const others = () => rows.filter((row) => !isLongRow(row) || !fitted(row));
  while (runMinutes(others()) > otherMinutes) {
    const reductions = rows
      .flatMap((row, index) => {
        const original = templateFor(row);
        if (!fitted(row) || !original || isLongRow(row)) return [];
        const next = choices(original, minutes(original) - 0.01);
        return next ? [{ index, next, duration: minutes(original) }] : [];
      })
      .sort((a, b) => b.duration - a.duration || b.index - a.index);
    if (!reductions.length) break;
    const { index, next } = reductions[0];
    rows = rows.map((row, i) =>
      i === index ? replace(row, next, "weekly") : row
    );
  }
  return rows;
}
