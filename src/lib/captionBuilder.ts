import type { DayType } from "@/lib/types";

/**
 * Structured caption shape used by the Food hero card. Null on rest days.
 * Both `useDailyTargets` and `useEffectiveTargets` produce this shape.
 */
export interface DailyTargetsCaption {
  /** Uppercase training type — "LIFT DAY" / "RUN DAY" / "LIFT + RUN" */
  trainingType: string;
  /** Uppercase adjustment — "+150 RECOVERY" / "+200 FUEL" / "" if no adjustment */
  adjustment: string;
}

const DAY_NOUN: Record<DayType, string> = {
  lift: "RECOVERY",
  run: "FUEL",
  both: "FUEL",
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
      ? "LIFT DAY"
      : dayType === "run"
        ? "RUN DAY"
        : "LIFT + RUN";
  const noun = DAY_NOUN[dayType];
  const adjustment =
    activityBonus > 0 && noun ? `+${activityBonus} ${noun}` : "";
  return { trainingType, adjustment };
}
