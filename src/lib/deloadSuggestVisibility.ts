import { isCurrentWeekInRaceWindDown } from "@/features/program/runScheduler";

export interface DeloadSuggestInput {
  /** `resolveDeloadRecommended(perfWeek)` — the PI's recommendation. */
  deloadRecommended: boolean;
  /** `programState.runPlan.currentWeek` — absent for non-race plans. */
  currentWeek: number | undefined;
  /** `programState.runPlan.totalWeeks` — absent for non-race plans. */
  totalWeeks: number | undefined;
  /** Resolved race distance — absent for non-race plans. */
  distance: "5k" | "10k" | "half" | "marathon" | undefined;
}

/**
 * Should the Programme page offer "Apply deload week"?
 *
 * Extracted rather than inlined into the JSX, following the precedent
 * Program.tsx set for `runHeaderLine`: a derivation living as an
 * expression in a 1500-line page render cannot be tested, and the whole
 * failure being fixed here is a MISSING TERM in exactly such an
 * expression. A predicate that is only correct in a file no test can
 * reach is the thing that let this sit.
 *
 * The rule (P1d pin 2): the Performance Index can recommend a deload for
 * a runner who is already tapering into a race, and the banner had no
 * guard — it offered a lifting deload on top of a taper that is itself a
 * planned load cut. The lock's words: "taper IS the deload; no
 * double-deload."
 *
 * Two deliberate departures from the lock's literal text, both argued at
 * `isCurrentWeekInRaceWindDown`:
 *
 *   - it reads the DERIVED phase, because the `runPlan.phase === "taper"`
 *     the lock names cannot happen (that field is typed `"recovery"`), so
 *     a literal guard would never have fired;
 *   - it covers race week as well as taper, because "don't stack a second
 *     load cut on the race wind-down" is the pin's reason, and race week
 *     is the deepest part of that wind-down.
 *
 * Everyone without a race plan is unaffected: no currentWeek/totalWeeks/
 * distance means the guard is false and the recommendation passes through
 * exactly as before. That direction matters as much as the other — a
 * guard that over-fired would silently disable deload suggestions for
 * every race-prep runner, which is worse than the double-deload it
 * prevents.
 */
export function shouldSuggestDeload(input: DeloadSuggestInput): boolean {
  if (!input.deloadRecommended) return false;
  return !isCurrentWeekInRaceWindDown(
    input.currentWeek,
    input.totalWeeks,
    input.distance
  );
}
