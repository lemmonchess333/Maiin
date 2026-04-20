import type { DayType } from "@/lib/types";

/**
 * Structured caption shape used by the Food hero card. Null on rest days.
 * Both `useDailyTargets` and `useEffectiveTargets` produce this shape.
 *
 * Sentence case for the decorative eyebrow: "Lift day · +150 Recovery" reads
 * as information rather than a heading, which matches how the caption is
 * actually used (an info line above a bigger number). Reserves all-caps for
 * structural dividers (BREAKFAST, PROTEIN, etc.) so uppercase stays a real
 * signal instead of ambient noise.
 */
export interface DailyTargetsCaption {
  /** Sentence case training type — "Lift day" / "Run day" / "Lift + Run" */
  trainingType: string;
  /** Sentence case adjustment — "+150 Recovery" / "+200 Fuel" / "" */
  adjustment: string;
}

const DAY_NOUN: Record<DayType, string> = {
  lift: "Recovery",
  run: "Fuel",
  both: "Fuel",
  rest: "",
};

/**
 * Build a structured caption from a day type and calorie adjustment.
 * Returns null on rest days. Extracted from useDailyTargets so that
 * useEffectiveTargets can reuse the same helper for the effective day type
 * without duplicating the logic.
 */
export function buildCaption(
  dayType: DayType,
  activityBonus: number,
): DailyTargetsCaption | null {
  if (dayType === "rest") return null;
  const trainingType =
    dayType === "lift"
      ? "Lift day"
      : dayType === "run"
        ? "Run day"
        : "Lift + Run";
  const noun = DAY_NOUN[dayType];
  const adjustment =
    activityBonus > 0 && noun ? `+${activityBonus} ${noun}` : "";
  return { trainingType, adjustment };
}
