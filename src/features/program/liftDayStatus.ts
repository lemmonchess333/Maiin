/** A lift day's state on Train's session card. */
export type LiftDayStatus =
  | "today"
  | "upcoming"
  | "completed"
  | "skipped"
  | "missed";

/**
 * A lift day's state on Train, from its flags and where it sits.
 *
 * Lifts are split-ordered (ADR-0002), so a week's days carry no dates: a
 * day of the current week that is neither done nor skipped is still to
 * come, and the rotation cursor is the one up next. A past week's day
 * cannot come up again. The week rolled over with it neither done nor
 * skipped, so it was missed, the word Home's week strip uses for a passed
 * day.
 */
export function liftDayStatus(
  day: { completed?: boolean; skipped?: boolean } | undefined,
  where: { pastWeek: boolean; cursor: boolean }
): LiftDayStatus {
  if (day?.completed) return "completed";
  if (day?.skipped) return "skipped";
  if (where.pastWeek) return "missed";
  return where.cursor ? "today" : "upcoming";
}

/** The card's word for each state, beside the day's category. */
export const LIFT_DAY_STATUS_LABEL: Record<LiftDayStatus, string> = {
  today: "Up next",
  upcoming: "Upcoming",
  completed: "Completed",
  skipped: "Skipped",
  missed: "Missed",
};
