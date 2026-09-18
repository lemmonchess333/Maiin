import { CALORIE_UNIT } from "@/utils/formatNutrition";
import type { DayType } from "@/lib/types";

/**
 * Structured caption shape used by the Food hero card. Null on rest days.
 * Both `useDailyTargets` and `useEffectiveTargets` produce this shape.
 *
 * Sentence case for the decorative eyebrow: "Lift day · +150 kcal" reads
 * as information rather than a heading, which matches how the caption is
 * actually used (an info line above a bigger number). Reserves all-caps for
 * structural dividers (BREAKFAST, PROTEIN, etc.) so uppercase stays a real
 * signal instead of ambient noise.
 *
 * Pre-F4 the suffix was a vague noun — "+150 Recovery" / "+200 Fuel" —
 * which omitted the unit. Users read "Fuel" as the metric being shown
 * rather than the unit being implied. Switched to the calorie unit as a
 * suffix so the value is unambiguous: "+150 kcal" / "+200 kcal". The word
 * itself comes from `CALORIE_UNIT` so it cannot drift from the rest of
 * the app — this suffix was one of the sites that had.
 */
export interface DailyTargetsCaption {
  /** Sentence case training type — "Lift day" / "Run day" / "Lift + Run" */
  trainingType: string;
  /** Sentence case adjustment — "+150 kcal" / "+200 kcal" / "" */
  adjustment: string;
}

/**
 * Build a structured caption from a day type and calorie adjustment.
 * Returns null on rest days. Extracted from useDailyTargets so that
 * useEffectiveTargets can reuse the same helper for the effective day type
 * without duplicating the logic.
 */
export function buildCaption(
  dayType: DayType,
  activityBonus: number
): DailyTargetsCaption | null {
  if (dayType === "rest") return null;
  const trainingType =
    dayType === "lift"
      ? "Lift day"
      : dayType === "run"
        ? "Run day"
        : "Lift + Run";
  const adjustment =
    activityBonus > 0 ? `+${activityBonus} ${CALORIE_UNIT}` : "";
  return { trainingType, adjustment };
}
