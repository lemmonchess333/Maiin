import { format } from "date-fns";
import { Timestamp } from "firebase/firestore";

/**
 * Single source of truth for matching a workout record to a target date.
 *
 * The reference logic is taken from useEffectiveTargets' original inline
 * filter: a workout with `date: "2026-04-17"` belongs to April 17th in
 * the viewer's LOCAL timezone. Any date representation for the workout
 * (already-formatted string, Date, Firestore Timestamp) gets normalised
 * to the same local "yyyy-MM-dd" key and compared for equality.
 *
 * Both useEffectiveTargets (workout burn for Food ring) and useHomeData
 * (workout burn for Home "Today's budget" line) must use this helper so
 * their totals stay in sync.
 */
export function isWorkoutOnDate(
  workout: { date: string | Date | Timestamp },
  target: Date,
): boolean {
  const targetKey = format(target, "yyyy-MM-dd");
  const raw = workout.date;

  if (typeof raw === "string") {
    return raw === targetKey;
  }
  if (raw instanceof Date) {
    return format(raw, "yyyy-MM-dd") === targetKey;
  }
  if (raw instanceof Timestamp) {
    return format(raw.toDate(), "yyyy-MM-dd") === targetKey;
  }
  return false;
}
