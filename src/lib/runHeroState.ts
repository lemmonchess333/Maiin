/**
 * Run8 PR1c — Programme Run hero state machine.
 *
 * Single discriminator for the hero rendered on Programme's Run
 * sub-tab. Replaces the scattered `currentMode === X && raceGoal &&
 * !raceElapsed && ...` conditionals that decide which hero variant
 * shows and which controls live alongside it.
 *
 * The state name names the user-facing situation, not the internal
 * combination of flags. Consumers can branch on a single string
 * instead of re-deriving the same conjunction in five places.
 *
 * Lock anchors:
 *   - L7 — single `getRunHeroState()` discriminator; uniform shape;
 *          content varies by state.
 *   - L12 — `...` overflow visible on planned-today / catch-up /
 *           race-today / race-prep-week (non-race-day); hidden
 *           otherwise.
 *   - L14 — race-today's overflow opens DayActionSheet's race-day
 *           variant (DNF / DNS — see PR1d).
 *
 * What this function does NOT decide: banner stack (race-elapsed
 * warning, recovery info), section subtitle, week strip, and the
 * Manage Run Plan footer link. Those live at a different layer —
 * the hero state is only about which CTA / preview / affirmation
 * sits in the operational slot under the section header.
 */

import type { ScheduledRunDay } from "@/features/program/programTypes";

export type RunHeroState =
  /** runMode === "freeform" — Start CTA + recent-run context. */
  | "freeform"
  /** race_prep mode but no raceGoal saved — deeplink to settings. */
  | "unset"
  /** nextStartable.date === today AND template is non-race. */
  | "structured-today"
  /** nextStartable.date === tomorrow. */
  | "structured-tomorrow"
  /** nextStartable.date is later this week (>tomorrow). */
  | "structured-future"
  /** nextStartable.date < today — overdue planned slot. */
  | "catch-up"
  /** raceGoal.targetDate === today (race day proper). */
  | "race-today"
  /** race_prep with nextStartable that isn't today's race. */
  | "race-prep-week"
  /** runPlan.phase === "recovery" and recoveryEndDate is in the future. */
  | "race-recovery"
  /** Structured / race_prep, runDays exist, none startable. */
  | "all-done"
  /** Structured / race_prep with no nextStartable and not all-done
   *  (e.g. plan empty / today is a planned rest day). */
  | "rest";

export interface RunHeroStateInput {
  mode: "freeform" | "structured" | "race_prep" | string | undefined;
  raceGoal: { distance: string; targetDate: string } | null | undefined;
  phase: string | null | undefined;
  recoveryEndDate: string | null | undefined;
  nextStartable: ScheduledRunDay | null;
  /** Local "YYYY-MM-DD" — today's key from `localDateString(new Date())`. */
  todayKey: string;
  /** Local "YYYY-MM-DD" — tomorrow's key from `localDateString(addLocalDays(today, 1))`. */
  tomorrowKey: string;
  /** runDays.length > 0 (used to disambiguate `rest` from `all-done`). */
  hasRunDays: boolean;
}

export function getRunHeroState(input: RunHeroStateInput): RunHeroState {
  const {
    mode,
    raceGoal,
    phase,
    recoveryEndDate,
    nextStartable,
    todayKey,
    tomorrowKey,
    hasRunDays,
  } = input;

  // Recovery takes precedence over EVERYTHING — even the freeform
  // short-circuit below. Run9 R3-cycle: the materialization rule clears
  // raceGoal at recovery-END (→ runMode freeform), but the phase clear is a
  // separate server write; between them (or on a legacy/partial doc) a user
  // can be `phase === "recovery"` while `mode === "freeform"`. The recovery
  // hero must still win there, so this check MUST sit before the freeform
  // return — otherwise a post-race user briefly sees a bare freeform Start CTA
  // instead of their recovery hero.
  if (phase === "recovery" && !!recoveryEndDate && todayKey < recoveryEndDate) {
    return "race-recovery";
  }

  if (mode === "freeform") return "freeform";

  if (mode === "race_prep" && !raceGoal) return "unset";

  if (nextStartable) {
    const date = nextStartable.date ?? null;
    const isRace = nextStartable.templateId === "race";
    const isToday = date === todayKey;
    const isTomorrow = date === tomorrowKey;
    const isPast = !!date && date < todayKey;

    if (isToday && isRace) return "race-today";
    if (isToday) {
      // Structured + race_prep both land here for a non-race today.
      return mode === "race_prep" ? "race-prep-week" : "structured-today";
    }
    if (isPast) return "catch-up";
    if (isTomorrow) return "structured-tomorrow";
    return "structured-future";
  }

  if (hasRunDays) return "all-done";
  return "rest";
}

/**
 * L12: `...` overflow visibility. Visible on planned-today /
 * catch-up / race-today / race-prep-week non-race-day; hidden
 * otherwise. Race-today opens the race-day variant of DayActionSheet
 * (PR1d — DNF / DNS); the other states open the default sheet.
 */
export function shouldShowHeroOverflow(state: RunHeroState): boolean {
  return (
    state === "structured-today" ||
    state === "catch-up" ||
    state === "race-today" ||
    state === "race-prep-week"
  );
}
