/**
 * Weekly schedule generation for hybrid athletes.
 * day: 0=Sun, 1=Mon ... 6=Sat (matches JS Date.getDay())
 */

export type DayType = "lift" | "run" | "rest";

export interface ScheduleDay {
  day: number;
  type: DayType;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_LABELS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export { DAY_LABELS, DAY_LABELS_SHORT };

/**
 * Generate a sensible weekly schedule given lift + run day counts.
 * Alternates lift/run where possible, clusters rest at weekend.
 *
 * Examples:
 *   3 lift, 2 run => Mon:lift, Tue:run, Wed:lift, Thu:run, Fri:lift, Sat:rest, Sun:rest
 *   4 lift, 0 run => Mon:lift, Tue:rest, Wed:lift, Thu:rest, Fri:lift, Sat:lift, Sun:rest
 *   3 lift, 3 run => Mon:lift, Tue:run, Wed:lift, Thu:run, Fri:lift, Sat:run, Sun:rest
 */
export function generateSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const totalActive = liftDays + runDays;
  const schedule: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    type: "rest" as DayType,
  }));

  if (totalActive === 0) return schedule;

  // Fill Monday (1) through Saturday (6), then Sunday (0) last
  // Priority order: Mon, Wed, Fri, Tue, Thu, Sat, Sun
  const slotOrder = [1, 3, 5, 2, 4, 6, 0];

  // Interleave lift and run slots
  const pattern: DayType[] = [];
  let l = liftDays;
  let r = runDays;

  while (l > 0 || r > 0) {
    if (l > 0) {
      pattern.push("lift");
      l--;
    }
    if (r > 0) {
      pattern.push("run");
      r--;
    }
  }

  // Assign pattern to slots in priority order
  for (let i = 0; i < pattern.length && i < slotOrder.length; i++) {
    schedule[slotOrder[i]].type = pattern[i];
  }

  return schedule;
}

/**
 * Get today's scheduled activity type from a week schedule.
 */
export function getTodaySchedule(schedule: ScheduleDay[]): ScheduleDay | null {
  const today = new Date().getDay();
  return schedule.find((s) => s.day === today) || null;
}

/**
 * Count active days by type.
 */
export function countByType(schedule: ScheduleDay[]): { lift: number; run: number; rest: number } {
  return schedule.reduce(
    (acc, s) => {
      acc[s.type]++;
      return acc;
    },
    { lift: 0, run: 0, rest: 0 }
  );
}

