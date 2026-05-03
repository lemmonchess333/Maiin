/**
 * Weekly schedule generation for hybrid athletes.
 * day: 0=Sun, 1=Mon ... 6=Sat (matches JS Date.getDay())
 */

export type DayType = "lift" | "run" | "both" | "rest";

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
export function countByType(schedule: ScheduleDay[]): { lift: number; run: number; both: number; rest: number } {
  return schedule.reduce(
    (acc, s) => {
      acc[s.type]++;
      return acc;
    },
    { lift: 0, run: 0, both: 0, rest: 0 }
  );
}

/**
 * Resolve the user's weekly run-day target across two profile fields.
 *
 * Historical drift: onboarding writes BOTH `weeklyRunsTarget` and
 * `weeklyRunDaysTarget` (Onboarding.tsx:378-379). The Settings schedule-
 * apply path only writes `weeklyRunsTarget` (Settings.tsx:126, 140), so
 * once a user edits their schedule the two diverge. Different surfaces
 * read different fields:
 *   - useProgram (5 sites)        → weeklyRunDaysTarget
 *   - Home / useDailyTargets      → weeklyRunsTarget
 * After any Settings edit, Home and Program disagree about how many run
 * days the user wants.
 *
 * This helper resolves both. Prefer the run-day-specific field when
 * present; fall back to the legacy field; default to 0. Migration path
 * is to write both via `runTargetWriteFields()` so the two stay in sync
 * on every save.
 */
type ProfileLike = {
  weeklyRunDaysTarget?: number;
  weeklyRunsTarget?: number;
};
export function getWeeklyRunTarget(profile: ProfileLike | null | undefined): number {
  return profile?.weeklyRunDaysTarget ?? profile?.weeklyRunsTarget ?? 0;
}

/**
 * Patch object that writes BOTH legacy and new run-target fields.
 * Use anywhere a save changes the user's run-day count so the two
 * fields stay in lockstep until we deprecate one.
 */
export function runTargetWriteFields(target: number): {
  weeklyRunsTarget: number;
  weeklyRunDaysTarget: number;
} {
  return { weeklyRunsTarget: target, weeklyRunDaysTarget: target };
}


