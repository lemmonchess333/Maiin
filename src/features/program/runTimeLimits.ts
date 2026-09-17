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

/** Resolve elapsed session time from the prescription rather than trusting a
 * catalogue estimate when pace changes the clock. Long runs use confirmed
 * easy pace; distance-based intervals use confirmed interval pace plus their
 * actual warm-up/recoveries/cool-down. Without a confirmed pace the catalogue
 * estimate remains the honest fallback. */
export function plannedRunMinutes(
  template: RunTemplate,
  easyPaceSPerKm?: number | null,
  intervalPaceSPerKm?: number | null
): number {
  const km = template.config?.targetDistanceKm;
  if (
    template.type === "long" &&
    km &&
    easyPaceSPerKm &&
    Number.isFinite(easyPaceSPerKm) &&
    easyPaceSPerKm > 0
  ) {
    return (km * easyPaceSPerKm) / 60;
  }

  const intervals = template.config?.intervals;
  if (
    template.type === "intervals" &&
    intervals?.workDistance &&
    intervalPaceSPerKm &&
    Number.isFinite(intervalPaceSPerKm) &&
    intervalPaceSPerKm > 0
  ) {
    const workSeconds =
      intervals.reps * (intervals.workDistance / 1000) * intervalPaceSPerKm;
    const recoverySeconds =
      Math.max(0, intervals.reps - 1) * intervals.restDuration;
    const fixedSeconds =
      (intervals.warmupDuration ?? 0) + (intervals.cooldownDuration ?? 0);
    return (workSeconds + recoverySeconds + fixedSeconds) / 60;
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
  if (limit === null || plannedRunMinutes(original, easyPaceSPerKm, intervalPaceSPerKm) <= limit)
    return run;
  const candidates = RUN_TEMPLATES.filter(
    (template) =>
      template.type === original.type &&
      Boolean(template.config?.strides) === Boolean(original.config?.strides) &&
      plannedRunMinutes(template, easyPaceSPerKm, intervalPaceSPerKm) <= limit &&
      plannedRunMinutes(template, easyPaceSPerKm, intervalPaceSPerKm) <
        plannedRunMinutes(original, easyPaceSPerKm, intervalPaceSPerKm)
  ).sort(
    (a, b) =>
      plannedRunMinutes(b, easyPaceSPerKm, intervalPaceSPerKm) -
      plannedRunMinutes(a, easyPaceSPerKm, intervalPaceSPerKm)
  );
  // The catalogue's shortest long tier can still exceed a slow runner's
  // availability. Keep the date and offer an easy timed session honestly.
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
