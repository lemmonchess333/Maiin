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

/** Long runs have a distance target; only confirmed pace personalises its
 * duration. Other templates already include their full timed session. */
export function plannedRunMinutes(
  template: RunTemplate,
  easyPaceSPerKm?: number | null
): number {
  const km = template.config?.targetDistanceKm;
  return template.type === "long" &&
    km &&
    easyPaceSPerKm &&
    Number.isFinite(easyPaceSPerKm) &&
    easyPaceSPerKm > 0
    ? (km * easyPaceSPerKm) / 60
    : template.estimatedDuration;
}

/** Shape only newly generated prescriptions. Saved completions, moves and
 * explicit swaps are carried separately by the existing regeneration path. */
export function fitRunToTimeLimit(
  run: ScheduledRunDay,
  limits: RunTimeLimits | null | undefined,
  easyPaceSPerKm?: number | null
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
  if (limit === null || plannedRunMinutes(original, easyPaceSPerKm) <= limit)
    return run;
  const candidates = RUN_TEMPLATES.filter(
    (template) =>
      template.type === original.type &&
      Boolean(template.config?.strides) === Boolean(original.config?.strides) &&
      plannedRunMinutes(template, easyPaceSPerKm) <= limit &&
      plannedRunMinutes(template, easyPaceSPerKm) <
        plannedRunMinutes(original, easyPaceSPerKm)
  ).sort(
    (a, b) =>
      plannedRunMinutes(b, easyPaceSPerKm) -
      plannedRunMinutes(a, easyPaceSPerKm)
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
