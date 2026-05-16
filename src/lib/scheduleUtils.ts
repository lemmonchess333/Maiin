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
 * Sport-coding for weekSchedule chips. Single source of truth used by:
 *   - Onboarding weekly preview step (P0-5)
 *   - ConfigurePlanModal weekly preview step (P0-9)
 *   - Programme Week tab strip (P1-1)
 *
 * Lift = purple (#7B72E9, matches THEME.lifting / brand).
 * Run  = coral (#D4637A, matches THEME.running).
 * Both = teal (#52A3BD, the cross-discipline accent).
 * Rest = muted grey (#8E8E93, iOS system grey).
 *
 * Anchored here rather than theme.ts so the rest of the
 * schedule API (generateSchedule, day labels) lives in one
 * import statement for callers.
 */
export const SCHEDULE_TYPE_META: Record<DayType, { label: string; color: string }> = {
  lift: { label: "Lift", color: "#7B72E9" },
  run: { label: "Run", color: "#D4637A" },
  both: { label: "Both", color: "#52A3BD" },
  rest: { label: "Rest", color: "#8E8E93" },
};

/**
 * Generate a sensible weekly schedule given lift + run day counts.
 *
 * Two regimes:
 *
 * 1. **Fits in 7 days** (`liftDays + runDays ≤ 7`):
 *    Alternate lift/run in priority slots (Mon, Wed, Fri preferred).
 *    No "both" days — every active day gets a single modality.
 *
 * 2. **Overflows 7 days** (`liftDays + runDays > 7`) — P0-B / spec v7:
 *    Collapse the overflow onto "both" days. Each "both" day consumes
 *    1 lift AND 1 run. Counting:
 *      bothCount      = min(total - 7, liftDays, runDays)
 *      liftOnlyCount  = max(0, liftDays - bothCount)
 *      runOnlyCount   = max(0, runDays - bothCount)
 *      restCount      = 7 - bothCount - liftOnlyCount - runOnlyCount
 *
 *    Each "both" day produces ONE lift exposure AND ONE run exposure,
 *    so totals add correctly:
 *      lift exposure = liftOnlyCount + bothCount = liftDays  ✓
 *      run exposure  = runOnlyCount + bothCount  = runDays   ✓
 *      total days    = 7                                      ✓
 *
 *    Stress-aware Both-day placement (which lift pairs with which
 *    run) is NOT done here — `generateSchedule` only knows counts,
 *    not session content. Pairing logic lives in `runScheduler`
 *    (P0-3) where lift workouts and run templates are both known.
 *
 * Examples:
 *   generateSchedule(3, 2)  → 3 lift + 2 run + 0 both + 2 rest
 *   generateSchedule(4, 0)  → 4 lift + 0 both + 3 rest
 *   generateSchedule(3, 3)  → 3 lift + 3 run + 0 both + 1 rest
 *   generateSchedule(6, 2)  → 5 lift + 1 run + 1 both + 0 rest    [P0-B]
 *   generateSchedule(7, 7)  → 0 lift + 0 run + 7 both + 0 rest    [P0-B]
 *
 * Degenerate inputs (single modality > 7, e.g. `generateSchedule(0, 8)`)
 * are clamped at 7 of that modality with no doubles. The UI should
 * cap individual targets at 7 so this case shouldn't arise in
 * production, but the function stays safe under bad input.
 */
export function generateSchedule(liftDays: number, runDays: number): ScheduleDay[] {
  const totalActive = liftDays + runDays;
  const schedule: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    type: "rest" as DayType,
  }));

  if (totalActive === 0) return schedule;

  // Slot order — Mon/Wed/Fri/Tue/Thu/Sat/Sun.
  // Both days take the highest-priority slots (most-used training
  // days) so the user's hardest sessions land early in the week.
  const slotOrder = [1, 3, 5, 2, 4, 6, 0];

  if (totalActive <= 7) {
    // Original behaviour — no doubles needed. Interleave lift/run
    // and place into priority slots.
    const pattern: DayType[] = [];
    let l = liftDays;
    let r = runDays;

    while (l > 0 || r > 0) {
      if (l > 0) { pattern.push("lift"); l--; }
      if (r > 0) { pattern.push("run"); r--; }
    }

    for (let i = 0; i < pattern.length && i < slotOrder.length; i++) {
      schedule[slotOrder[i]].type = pattern[i];
    }

    return schedule;
  }

  // Overflow regime — total > 7. Use "both" days to fit.
  // Math.min(total-7, lift, run) ensures we never request more "both"
  // days than the smaller modality can supply (each both consumes
  // one of each).
  const bothCount = Math.min(totalActive - 7, liftDays, runDays);
  const liftOnlyCount = Math.max(0, liftDays - bothCount);
  const runOnlyCount = Math.max(0, runDays - bothCount);

  // Defensive cap for degenerate inputs (e.g. 0 lift + 9 runs):
  // when bothCount = 0 because one modality is empty, the dominant
  // modality still has to fit in 7 slots. Clamp here rather than
  // emit a -1 restCount or panic. UI validation should prevent this
  // state, but the function stays safe if it slips through.
  const totalDaysNeeded = bothCount + liftOnlyCount + runOnlyCount;
  if (totalDaysNeeded > 7) {
    const overflow = totalDaysNeeded - 7;
    if (liftOnlyCount >= runOnlyCount) {
      const cappedLift = Math.max(0, liftOnlyCount - overflow);
      return assembleSlots({ bothCount, liftOnlyCount: cappedLift, runOnlyCount }, slotOrder);
    }
    const cappedRun = Math.max(0, runOnlyCount - overflow);
    return assembleSlots({ bothCount, liftOnlyCount, runOnlyCount: cappedRun }, slotOrder);
  }

  return assembleSlots({ bothCount, liftOnlyCount, runOnlyCount }, slotOrder);
}

/** Place computed counts into the 7 weekday slots in priority order.
 *  Both > Lift > Run > Rest (rest is implicit — slots not assigned
 *  remain "rest" from the initial fill).
 *
 *  Why this order: "both" days are the highest-density training days
 *  and benefit from the user's most consistent slots (typically
 *  Mon/Wed/Fri). Lift days follow, then run days. */
function assembleSlots(
  counts: { bothCount: number; liftOnlyCount: number; runOnlyCount: number },
  slotOrder: number[],
): ScheduleDay[] {
  const schedule: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => ({
    day: i,
    type: "rest" as DayType,
  }));
  const types: DayType[] = [
    ...Array(counts.bothCount).fill("both"),
    ...Array(counts.liftOnlyCount).fill("lift"),
    ...Array(counts.runOnlyCount).fill("run"),
  ];
  for (let i = 0; i < types.length && i < slotOrder.length; i++) {
    schedule[slotOrder[i]].type = types[i];
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
 * Map a day-of-week (0=Sun … 6=Sat) to its position in the lift
 * programme's `workouts[]` array. The workouts array is ordered by
 * lift exposure: workouts[0] is the first lift/both day in the
 * week, workouts[1] is the second, etc. This helper counts how
 * many lift+both slots precede `dayIndex` (inclusive) in the
 * (sorted by `day`) weekSchedule to find that position.
 *
 * Returns -1 when:
 *   - the schedule is missing or wrong-length
 *   - the day-of-week isn't a lift+both slot
 *   - the day-of-week isn't in the schedule at all
 *
 * Callers responsible for bounds-checking against `workouts.length`
 * (legacy plans where schedule drifted from workouts).
 *
 * Used by:
 *   - Programme Today tab (P1-2) — find today's workout to read
 *     completion state
 *   - Programme Week tab overflow menu (P1-3) — dispatch
 *     skipWorkoutDay against the right lift index
 */
export function liftIndexForDayOfWeek(
  schedule: ScheduleDay[] | undefined | null,
  dayOfWeek: number,
): number {
  if (!schedule || schedule.length !== 7) return -1;
  const sorted = [...schedule].sort((a, b) => a.day - b.day);
  let counter = 0;
  for (const d of sorted) {
    if (d.type === "lift" || d.type === "both") {
      if (d.day === dayOfWeek) return counter;
      counter++;
    }
  }
  return -1;
}

const VALID_DAY_TYPES = new Set<DayType>(["lift", "run", "both", "rest"]);

/**
 * Returns true iff `schedule` is a structurally valid 7-day week:
 *   - exactly 7 entries
 *   - days 0..6 each present exactly once
 *   - every entry's `type` is one of "rest" | "lift" | "run" | "both"
 *
 * The narrower-than-`length === 7` check exists because Firestore
 * documents can be corrupted (duplicate days, missing days, unknown
 * type strings from a future schema). `backfillWeekScheduleIfMissing`
 * regenerates the schedule when this returns false, so the
 * authoritative invariant lives here — one place to update if the
 * day-type enum changes.
 */
export function isValidWeekSchedule(schedule: unknown): schedule is ScheduleDay[] {
  if (!Array.isArray(schedule) || schedule.length !== 7) return false;
  const seenDays = new Set<number>();
  for (const entry of schedule) {
    if (!entry || typeof entry !== "object") return false;
    const day = (entry as ScheduleDay).day;
    const type = (entry as ScheduleDay).type;
    if (typeof day !== "number" || day < 0 || day > 6) return false;
    if (seenDays.has(day)) return false;
    seenDays.add(day);
    if (!VALID_DAY_TYPES.has(type as DayType)) return false;
  }
  return seenDays.size === 7;
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


