/** Programme timing and display metadata. No session generation imports. */
import {
  parseLocalDate,
  startOfLocalWeek,
  weekPosition,
} from "@/lib/dateHelpers";
interface RaceConfig {
  peakLongKm: number;
  baseLongKm: number;
  minWeeks: number;
}

export const RACE_CONFIGS: Record<string, RaceConfig> = {
  "5k": { peakLongKm: 8, baseLongKm: 4, minWeeks: 4 },
  "10k": { peakLongKm: 12, baseLongKm: 6, minWeeks: 6 },
  half: { peakLongKm: 20, baseLongKm: 10, minWeeks: 8 },
  marathon: { peakLongKm: 32, baseLongKm: 14, minWeeks: 12 },
};

/**
 * PR-K Q9b — distance-aware hard cap on taper duration.
 *
 * Replaces the prior 25%-of-plan rule which mis-scaled at the short
 * end (a full-length 5K plan landed on 2 weeks of taper — too much
 * for a 5K). Each entry counts taper weeks IMMEDIATELY BEFORE the
 * final race week (which keeps its own "race" phase classification).
 *
 *   5K       → 1 taper week
 *   10K      → 1 taper week
 *   half     → 2 taper weeks
 *   marathon → 3 taper weeks
 *
 * Hard cap: taper phase begins at `totalWeeks - taperWeeks - 1`
 * (the -1 leaves room for the trailing race week). For plans whose
 * `totalWeeks` is shorter than `taperWeeks + base + build` (eg. a
 * compressed 4-week marathon plan), taper still respects the cap
 * but the build phase collapses first. Base phase is then whatever
 * remains, never negative.
 */
export const TAPER_WEEKS_BY_DISTANCE: Record<
  "5k" | "10k" | "half" | "marathon",
  number
> = {
  "5k": 1,
  "10k": 1,
  half: 2,
  marathon: 3,
};

export function getPhaseForWeek(
  weekIndex: number,
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon"
): "base" | "build" | "taper" | "race" {
  if (weekIndex >= totalWeeks - 1) return "race";
  const taperWeeks = TAPER_WEEKS_BY_DISTANCE[distance];
  /* Taper occupies the `taperWeeks` immediately before the final
     race week. For a 12-week marathon (taperWeeks=3): race=11,
     taper=8/9/10, build/base split the remainder. */
  if (weekIndex >= totalWeeks - 1 - taperWeeks) return "taper";
  /* Base/build split on the remaining weeks. 0.4 of the remaining
     pre-taper window goes to base, the rest is build. Keeps the
     historical "longer plans get a proper base block" behaviour
     without leaking into the now-distance-aware taper. */
  const preTaperWeeks = Math.max(1, totalWeeks - 1 - taperWeeks);
  if (weekIndex < preTaperWeeks * 0.4) return "base";
  return "build";
}

/** Run9 phase-3 (Slice B) — the taper-safe FLOOR, in weeks, per distance.
 *
 *  Floor = taperWeeks + 1 (locked 2026-05-29). Below this there isn't even
 *  room for the distance's taper plus the race week, so compressing toward
 *  the date is no longer the safe default — the plan flips to "finish-safely".
 *  5k=2, 10k=2, half=3, marathon=4. */
export function getRaceFloorWeeks(
  distance: "5k" | "10k" | "half" | "marathon"
): number {
  return TAPER_WEEKS_BY_DISTANCE[distance] + 1;
}

/** Ideal-build length per distance (5k=4, 10k=6, half=8, marathon=12). */
export function getRaceMinWeeks(
  distance: "5k" | "10k" | "half" | "marathon"
): number {
  return RACE_CONFIGS[distance].minWeeks;
}

export type RaceTiming = "healthy" | "compressible" | "below-floor";

/** Three-state timing classification for the Realign decision (Run9 phase-3):
 *
 *   weeksRemaining >= minWeeks          → "healthy"      (full ideal build)
 *   floor <= weeksRemaining < minWeeks  → "compressible" (compress-to-keep-date
 *                                          is the safe default — `compressed`)
 *   weeksRemaining < floor              → "below-floor"  (finish-safely is the
 *                                          honest default; compress no longer
 *                                          offered as safe)
 *
 * Pure; the Realign UI branches on this to pick the primary action + copy. */
export function classifyRaceTiming(input: {
  distance: "5k" | "10k" | "half" | "marathon";
  weeksRemaining: number;
}): RaceTiming {
  const minWeeks = RACE_CONFIGS[input.distance].minWeeks;
  const floor = getRaceFloorWeeks(input.distance);
  if (input.weeksRemaining >= minWeeks) return "healthy";
  if (input.weeksRemaining >= floor) return "compressible";
  return "below-floor";
}

/** Calendar weeks a race plan spans: `weeks[0]` is the week containing
 *  `weekStartDate` (already normalised to the week's first day) and the race
 *  sits in the last, so the count is the race's week index plus one. A race
 *  in the current week (or already past) is a single week ending on race day
 *  — no room for two forward weeks, and a bare 2-week floor pushed it into a
 *  phantom FUTURE week that vanished from the rail. */
export function raceCalendarWeeks(weekStartDate: Date, target: Date): number {
  // Calendar days, not elapsed hours: a DST transition between the two
  // local midnights is ±1h, which `floor` would turn into a missing week
  // for a race exactly N weeks out.
  const raceWeekOffset = Math.floor(
    calendarDaysBetween(weekStartDate, target) / 7
  );
  return raceWeekOffset <= 0 ? 1 : Math.max(raceWeekOffset + 1, 2);
}

/** Whole local calendar days from `a` to `b` (negative when `b` is earlier). */
export function calendarDaysBetween(a: Date, b: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** Of `blockWeeks` calendar weeks, the ones the runner can TRAIN in. The
 *  race's week holds training days only when the race is not its first
 *  day: a Monday race makes the block one week longer than the training it
 *  contains, and read as block weeks a 5k three Mondays out came back
 *  "healthy" with quality sessions in it. The race's weekday is fixed for
 *  the life of the plan, so this is the same on creation and on every
 *  carried regen — which is what lets it be derived rather than persisted.
 *  The declaration-side counterpart (a plan declared on the week's LAST day
 *  counts a week already behind the runner) is deliberately not corrected:
 *  it is true only at creation, a carry could not reproduce it, and the
 *  extra week unlocks nothing (`racePlanSafetySweep` pins that). */
export function trainingWeeksOf(blockWeeks: number, target: Date): number {
  const raceOnFirstDay = weekPosition(target.getDay()) === 0;
  return Math.max(
    1,
    raceOnFirstDay && blockWeeks > 1 ? blockWeeks - 1 : blockWeeks
  );
}

/** Weeks the runner can train in before `targetDate`, counted from the week
 *  containing `currentDate` — the number `generateRacePlanV2` judges
 *  `compressed` / `belowFloor` against for a fresh plan. The Realign preview
 *  (`AdjustWeekSheet`) classifies with THIS rather than its own
 *  `ceil(daysLeft / 7)`, so the timing it previews is the one the generator
 *  lands on; `generateRacePlanV2.property.test.ts` pins the two together. */
export function raceTrainingWeeks(args: {
  currentDate: string;
  targetDate: string;
}): number {
  const target = parseLocalDate(args.targetDate);
  const weekStartDate = startOfLocalWeek(parseLocalDate(args.currentDate));
  return trainingWeeksOf(raceCalendarWeeks(weekStartDate, target), target);
}

/**
 * Clamp a carried 0-based `currentWeek` into a freshly (re)generated plan's
 * bounds. `currentWeek` is 0-based and the race cockpit renders
 * `currentWeek + 1`, so the last valid index is `totalWeeks - 1` — clamping to
 * `totalWeeks` (the previous behaviour) would still display "Week N+1 of N".
 * Returns a value in `[0, totalWeeks - 1]`, or 0 for a degenerate plan.
 */
export function clampPlanWeek(currentWeek: number, totalWeeks: number): number {
  if (!Number.isFinite(totalWeeks) || totalWeeks <= 0) return 0;
  return Math.min(Math.max(0, currentWeek), totalWeeks - 1);
}

export function getRacePhaseLabel(
  weekIndex: number,
  totalWeeks: number,
  distance: "5k" | "10k" | "half" | "marathon"
): string {
  const phase = getPhaseForWeek(weekIndex, totalWeeks, distance);
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

/**
 * Convenience predicate for surfacing UI affordances (PR-K Q9d):
 * is the current week IN the taper phase for this race plan? Returns
 * false for non-race-prep modes (no totalWeeks / distance available).
 */
export function isCurrentWeekInTaper(
  currentWeek: number | undefined,
  totalWeeks: number | undefined,
  distance: "5k" | "10k" | "half" | "marathon" | undefined
): boolean {
  if (currentWeek == null || totalWeeks == null || !distance) return false;
  return getPhaseForWeek(currentWeek, totalWeeks, distance) === "taper";
}

/**
 * Is the current week part of the race WIND-DOWN — taper or race week?
 *
 * Distinct from {@link isCurrentWeekInTaper} on purpose: that one answers
 * "which phase is this" for labelling, and race week is genuinely not the
 * taper. This one answers "is load already being deliberately cut", which
 * is the question a second load-cutting feature has to ask before it acts,
 * and both phases answer yes.
 *
 * Exists for the deload-suggest guard. The P1d lock pins "deload-suggest
 * banner suppressed when the plan is tapering — taper IS the deload; no
 * double-deload", and race week is the deepest part of that same wind-down:
 * proposing a lifting deload in race week is the advice the pin exists to
 * prevent, one week later.
 *
 * The lock words that pin as `programState.runPlan.phase === 'taper'`, and
 * that field CANNOT hold "taper" — `RunPlan.phase` is typed `"recovery"`
 * and nothing writes anything else. Implemented literally, the guard would
 * have compared against a value no writer produces and never fired: the
 * same shape as PR #1775's `templateId === "race"`, which read as covered
 * for months while the accept path was fiction. Phase is DERIVED per week
 * by `getPhaseForWeek`, so that is what the guard reads.
 */
export function isCurrentWeekInRaceWindDown(
  currentWeek: number | undefined,
  totalWeeks: number | undefined,
  distance: "5k" | "10k" | "half" | "marathon" | undefined
): boolean {
  if (currentWeek == null || totalWeeks == null || !distance) return false;
  const phase = getPhaseForWeek(currentWeek, totalWeeks, distance);
  return phase === "taper" || phase === "race";
}
