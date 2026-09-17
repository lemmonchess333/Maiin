import { differenceInCalendarDays } from "date-fns";
import { RUN_TEMPLATES, type RunTemplate } from "@/lib/workoutTemplates";
import { parseLocalDate, localDateString } from "@/lib/dateHelpers";
import { plannedRunMinutes } from "./runTimeLimits";
import type { ScheduledRunDay } from "./programTypes";

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
  return (
    v.version === 1 &&
    ["building", "returning", "regular"].includes(v.experience) &&
    ["self_reported", "recorded"].includes(v.source) &&
    Number.isFinite(v.weeklyMinutes) &&
    (allowIncomplete ||
      (Number.isInteger(v.weeklyMinutes) &&
        v.weeklyMinutes >= 10 &&
        v.weeklyMinutes <= 1200)) &&
    Number.isFinite(v.longestRunMinutes) &&
    (allowIncomplete ||
      (Number.isInteger(v.longestRunMinutes) &&
        v.longestRunMinutes >= 10 &&
        v.longestRunMinutes <= 300 &&
        v.longestRunMinutes <= v.weeklyMinutes)) &&
    typeof v.confirmedAt === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v.confirmedAt) &&
    localDateString(parseLocalDate(v.confirmedAt)) === v.confirmedAt
  );
}

/** A stale report remains a ceiling. It never expires into more work. */
export function runningBaselineNeedsReview(
  baseline: RunningBaseline,
  today: string
): boolean {
  return (
    baseline.confirmedAt > today ||
    differenceInCalendarDays(
      parseLocalDate(today),
      parseLocalDate(baseline.confirmedAt)
    ) > 28
  );
}

/** Fit generated rows only. Saved user work is carried by the caller after
 * generation, just as it is for availability changes. No new progression
 * formula: the existing race curve remains below this confirmed envelope. */
export function fitWeekToRunningBaseline(
  week: ScheduledRunDay[],
  baseline: RunningBaseline | null | undefined,
  today: string,
  easyPaceSPerKm?: number | null,
  intervalPaceSPerKm?: number | null
): ScheduledRunDay[] {
  if (!isRunningBaseline(baseline)) return week;
  const review = runningBaselineNeedsReview(baseline, today);
  const easyOnly = review || baseline.experience !== "regular";
  const templateFor = (row: ScheduledRunDay) =>
    RUN_TEMPLATES.find((t) => t.id === (row.userOverride ?? row.templateId));
  const minutes = (t: RunTemplate) =>
    plannedRunMinutes(t, easyPaceSPerKm, intervalPaceSPerKm);
  const protectedRow = (row: ScheduledRunDay) =>
    row.type === "race" ||
    row.completed ||
    row.userOverride ||
    (row.status && row.status !== "planned");
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
        minutes(t) <= ceiling &&
        (onlyEasy
          ? t.type === "easy" && !t.config?.strides
          : t.type === original.type &&
            Boolean(t.config?.strides) === Boolean(original.config?.strides))
    ).sort((a, b) => minutes(b) - minutes(a) || a.id.localeCompare(b.id));
    return (
      fitting[0] ??
      RUN_TEMPLATES.filter(
        (t) => t.type === "easy" && !t.config?.strides && minutes(t) <= ceiling
      ).sort((a, b) => minutes(b) - minutes(a))[0]
    );
  };
  let fitted = week.map((row) => {
    const original = templateFor(row);
    if (protectedRow(row) || !original) return row;
    const hard = original.type !== "easy" || Boolean(original.config?.strides);
    const ceiling = Math.min(minutes(original), baseline.longestRunMinutes);
    const replacement = choices(original, ceiling, easyOnly && hard);
    return replacement
      ? replace(
          row,
          replacement,
          easyOnly && hard ? (review ? "review" : "experience") : "longest"
        )
      : row;
  });
  // Greedily take the smallest available reduction from the longest session.
  // Floors bind honestly: never delete a day to make the total appear to fit.
  const total = () =>
    fitted.reduce((sum, row) => {
      const t = templateFor(row);
      return sum + (t && t.type !== "race" ? minutes(t) : 0);
    }, 0);
  while (total() > baseline.weeklyMinutes) {
    const reductions = fitted
      .flatMap((row, index) => {
        const original = templateFor(row);
        if (protectedRow(row) || !original) return [];
        const next = choices(original, minutes(original) - 0.01);
        return next ? [{ index, next, duration: minutes(original) }] : [];
      })
      .sort((a, b) => b.duration - a.duration || b.index - a.index);
    if (!reductions.length) break;
    const { index, next } = reductions[0];
    fitted = fitted.map((row, i) =>
      i === index ? replace(row, next, "weekly") : row
    );
  }
  return fitted;
}
