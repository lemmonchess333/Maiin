import type { WorkoutDay } from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";

export type DisplayDay =
  | { type: "workout"; workout: WorkoutDay; workoutIndex: number }
  | { type: "rest" };

/**
 * Build a merged display array that interleaves rest markers
 * with workout days based on the weekly schedule.
 *
 * Schedule has 7 entries (Sun-Sat). Workout days are training days in order.
 * Rest slots get rest markers; lift/both/run slots consume the next workout.
 *
 * If no schedule is available, returns workout days only (no rest markers).
 */
export function buildDisplayDays(
  workouts: WorkoutDay[],
  weekSchedule?: ScheduleDay[],
): DisplayDay[] {
  // No schedule or invalid → just return workout days
  if (!weekSchedule || weekSchedule.length !== 7) {
    return workouts.map((w, i) => ({ type: "workout", workout: w, workoutIndex: i }));
  }

  // Sort schedule by day-of-week starting from Monday (1,2,3,4,5,6,0)
  const sorted = [...weekSchedule].sort((a, b) => {
    const aKey = a.day === 0 ? 7 : a.day;
    const bKey = b.day === 0 ? 7 : b.day;
    return aKey - bKey;
  });

  const result: DisplayDay[] = [];
  let workoutIdx = 0;

  for (const schedDay of sorted) {
    if (schedDay.type === "rest") {
      result.push({ type: "rest" });
    } else {
      // lift, run, or both — consume next workout if available
      if (workoutIdx < workouts.length) {
        result.push({ type: "workout", workout: workouts[workoutIdx], workoutIndex: workoutIdx });
        workoutIdx++;
      }
    }
  }

  // Append remaining workouts if schedule has fewer active slots than workouts
  while (workoutIdx < workouts.length) {
    result.push({ type: "workout", workout: workouts[workoutIdx], workoutIndex: workoutIdx });
    workoutIdx++;
  }

  return result;
}
