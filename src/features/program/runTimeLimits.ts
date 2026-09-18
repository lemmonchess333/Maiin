import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import type { ScheduledRunDay } from "./programTypes";

/** Recurring availability, chosen by the runner. Null means no extra limit. */
export interface RunTimeLimits {
  sessionMinutes: number | null;
  longRunMinutes: number | null;
}

export function isRunTimeLimits(value: unknown): value is RunTimeLimits {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const limits = value as RunTimeLimits;
  return [limits.sessionMinutes, limits.longRunMinutes].every(
    (minutes) =>
      minutes === null ||
      (typeof minutes === "number" &&
        Number.isInteger(minutes) &&
        minutes >= 30 &&
        minutes <= 150)
  );
}

export function normalizeRunTimeLimits(value: unknown): RunTimeLimits {
  return isRunTimeLimits(value)
    ? {
        sessionMinutes: value.sessionMinutes,
        longRunMinutes: value.longRunMinutes,
      }
    : { sessionMinutes: null, longRunMinutes: null };
}

const positive = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;
const nonNegative = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

/** Estimate session time at the prescribed pace, including fixed parts.
 * Long runs use confirmed easy pace; distance reps use confirmed interval
 * pace, never easy pace. Timed reps need no pace. Missing pace retains the
 * nominal catalogue estimate; this is not a guarantee of elapsed run time.
 * Recovery is BETWEEN reps, matching segmentsFromIntervals, not after the
 * final rep. Regression tests compare this calculation with that builder. */
export function plannedRunMinutes(
  template: RunTemplate,
  easyPaceSPerKm?: number | null,
  intervalPaceSPerKm?: number | null
): number {
  const km = template.config?.targetDistanceKm;
  if (template.type === "long" && positive(km) && positive(easyPaceSPerKm)) {
    return (km * easyPaceSPerKm) / 60;
  }

  const intervals = template.config?.intervals;
  if (template.type === "intervals" && intervals) {
    const warmup = intervals.warmupDuration ?? 0;
    const cooldown = intervals.cooldownDuration ?? 0;
    // Templates are catalogue data. Malformed shapes retain their nominal
    // estimate rather than leaking NaN/Infinity into sorting and budgets.
    if (
      !Number.isInteger(intervals.reps) ||
      intervals.reps < 1 ||
      ![warmup, cooldown, intervals.restDuration].every(nonNegative)
    )
      return template.estimatedDuration;

    const workSeconds = positive(intervals.workDistance)
      ? positive(intervalPaceSPerKm)
        ? (intervals.workDistance / 1000) * intervalPaceSPerKm
        : null
      : positive(intervals.workDuration)
        ? intervals.workDuration
        : null;
    if (workSeconds !== null) {
      const seconds =
        intervals.reps * workSeconds +
        (intervals.reps - 1) * intervals.restDuration +
        warmup +
        cooldown;
      if (Number.isFinite(seconds)) return seconds / 60;
    }
  }

  return template.estimatedDuration;
}

/** Shape only newly generated prescriptions. Saved completions, moves and
 * explicit swaps are carried separately by the existing regeneration path. */
export function fitRunToTimeLimit(
  run: ScheduledRunDay,
  limits: RunTimeLimits | null | undefined,
  easyPaceSPerKm?: number | null,
  intervalPaceSPerKm?: number | null
): ScheduledRunDay {
  if (
    !isRunTimeLimits(limits) ||
    run.type === "race" ||
    run.userOverride ||
    run.completed ||
    (run.status && run.status !== "planned")
  )
    return run;
  const original = RUN_TEMPLATES.find(
    (template) => template.id === run.templateId
  );
  if (!original || original.type === "race") return run;
  const limit =
    original.type === "long" ? limits.longRunMinutes : limits.sessionMinutes;
  const minutes = (template: RunTemplate) =>
    plannedRunMinutes(template, easyPaceSPerKm, intervalPaceSPerKm);
  if (limit === null || minutes(original) <= limit) return run;
  const candidates = RUN_TEMPLATES.filter(
    (template) =>
      template.type === original.type &&
      Boolean(template.config?.strides) === Boolean(original.config?.strides) &&
      minutes(template) <= limit &&
      minutes(template) < minutes(original)
  ).sort((a, b) => minutes(b) - minutes(a));
  // The shortest matching tier may not fit. Keep the date and use an easy
  // timed session; the validated availability floor is 30 minutes.
  const replacement =
    candidates[0] ??
    RUN_TEMPLATES.find((template) => template.id === "easy_30")!;
  return {
    ...run,
    templateId: replacement.id,
    type: replacement.type,
    timeLimit: { minutes: limit, originalTemplateId: original.id },
  };
}
