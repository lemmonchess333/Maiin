/**
 * Run14 — adaptive load v1: the ease-week nudge (RUN-05).
 *
 * Pure trigger evaluator for the "take this week easier?" cockpit card.
 * The engine only ever SUGGESTS: this decides whether to SHOW the card;
 * the card opens the existing AdjustWeekSheet and the user applies
 * (Run14a suggest+approve — no auto-adapt, no scheduler math here).
 *
 * Trigger (Run14b, harder-streak only): among the athlete's RATED runs
 * inside the last WINDOW_DAYS, look at the most recent RECENT_RATED_COUNT
 * — if at least MIN_HARDER of them were rated "harder", the week is a
 * candidate to ease. The signal is entirely user-authored
 * (relativeEffort check-ins, #1523) — zero inference — so the card can
 * say honestly "you rated N of your last M runs harder than expected".
 * Skipped check-ins simply never contribute.
 *
 * Self-gating (Run14g): the trigger cannot fire without >= MIN_HARDER
 * real ratings, which IS Run13(5)'s "signals accumulated" unlock — no
 * feature flag needed.
 *
 * Scope + restraint are all handled here as short-circuits (Run14d/f)
 * so the card component stays dumb:
 *   - race-prep only (freeform has no forward plan to ease)
 *   - suppressed during taper / race week / recovery
 *   - suppressed when the week was already eased / re-planned
 *   - suppressed while a PR-L fell-behind prompt is pending (the
 *     stronger signal wins — one prompt per surface, Run9c)
 *   - suppressed for the rest of a week the user dismissed it in
 *   - 14-day cooldown after any showing
 *
 * Pure + deterministic (all time + flags injected). Table-tested like
 * gradeAdjustedPace / raceGoalPlanner. Local-date math only, via the
 * dateHelpers (never UTC).
 */
import { localWeekKey, parseLocalDate } from "./dateHelpers";

/** Trailing window (days) a rated run must fall inside to count. */
export const WINDOW_DAYS = 10;
/** How many of the most-recent rated-in-window runs we inspect. */
export const RECENT_RATED_COUNT = 3;
/** Minimum "harder" ratings among those recent runs to trigger. */
export const MIN_HARDER = 2;
/** Days the card stays silent after any showing. */
export const COOLDOWN_DAYS = 14;

export type RelativeEffort = "easier" | "matched" | "harder" | null;

export interface EaseWeekNudgeRun {
  /** Local YYYY-MM-DD the run was completed. */
  date: string;
  /** The post-run check-in (#1523); null when the athlete skipped it. */
  relativeEffort: RelativeEffort;
}

export interface EaseWeekNudgeInput {
  /** An active race-prep block is in progress (Run14d scope guard). */
  isRacePrep: boolean;
  /** The block's runs (rated or not) — we filter to rated-in-window. */
  runs: EaseWeekNudgeRun[];
  /** Local YYYY-MM-DD "today". */
  today: string;
  /** taper OR race week OR recovery phase — never tell a tapering
   *  runner to ease more (Run14f). */
  phaseSuppressed: boolean;
  /** This week was already eased / re-planned via AdjustWeekSheet. */
  weekAlreadyEased: boolean;
  /** A PR-L fell-behind prompt is pending for this user. */
  fellBehindPending: boolean;
  /** The weekKey (Sunday YYYY-MM-DD) the user dismissed the card in,
   *  or null. Silences the card for the rest of that week. */
  dismissedWeekKey: string | null;
  /** Local YYYY-MM-DD the card was last shown, or null. Drives the
   *  14-day cooldown. */
  lastShownAt: string | null;
}

export type EaseWeekNudgeResult =
  | { show: false }
  | {
      show: true;
      /** Numerator for the card copy ("rated N of your last M …"). */
      harderCount: number;
      /** Denominator = the recent rated-in-window runs inspected. */
      ratedCount: number;
      /** So the caller can phrase the window if it wants. */
      windowDays: number;
    };

/** Calendar-day gap a→b (b earlier than a → positive). Local midnights,
 *  DST-safe via round. */
function daysBetween(a: string, b: string): number {
  const ms = parseLocalDate(a).getTime() - parseLocalDate(b).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Decide whether to show the ease-week nudge. All suppression rules are
 * checked before the trigger so a suppressed week never even evaluates
 * the ratings.
 */
export function evaluateEaseWeekNudge(
  input: EaseWeekNudgeInput
): EaseWeekNudgeResult {
  // ── Scope + restraint short-circuits (Run14d / Run14f) ──
  if (!input.isRacePrep) return { show: false };
  if (input.phaseSuppressed) return { show: false };
  if (input.weekAlreadyEased) return { show: false };
  if (input.fellBehindPending) return { show: false };

  const currentWeekKey = localWeekKey(parseLocalDate(input.today));
  if (input.dismissedWeekKey === currentWeekKey) return { show: false };

  if (input.lastShownAt !== null) {
    const sinceShown = daysBetween(input.today, input.lastShownAt);
    // `sinceShown === 0` is the SAME day the card is currently showing —
    // the card records lastShownAt on mount, and the parent re-evaluates
    // live, so treating "today" as cooled-down would make the card
    // suppress itself the render after it appears. Only a PRIOR showing
    // 1..13 days ago suppresses; day 14+ may show again.
    if (sinceShown > 0 && sinceShown < COOLDOWN_DAYS) return { show: false };
  }

  // ── Trigger (Run14b) ──
  const recentRated = input.runs
    .filter((r) => {
      if (r.relativeEffort === null) return false;
      const age = daysBetween(input.today, r.date);
      // In window, and never a future-dated run.
      return age >= 0 && age <= WINDOW_DAYS;
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, RECENT_RATED_COUNT);

  const harderCount = recentRated.filter(
    (r) => r.relativeEffort === "harder"
  ).length;

  if (harderCount >= MIN_HARDER) {
    return {
      show: true,
      harderCount,
      ratedCount: recentRated.length,
      windowDays: WINDOW_DAYS,
    };
  }
  return { show: false };
}
