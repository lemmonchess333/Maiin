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
import { addLocalDays, localWeekKey, parseLocalDate } from "./dateHelpers";
import { isRunDateKey, type RunExecutionTarget } from "./runExecutionEvidence";

/** Trailing window (days) a rated run must fall inside to count. */
export const WINDOW_DAYS = 10;
/** How many of the most-recent rated-in-window runs we inspect. */
export const RECENT_RATED_COUNT = 3;
/** Minimum "harder" ratings among those recent runs to trigger. */
export const MIN_HARDER = 2;
/** Days the card stays silent after any showing. */
export const COOLDOWN_DAYS = 14;

/* A6 (roadmap) — the SECOND trigger: repeated pace-verdict misses on
 * quality sessions. Where Run14's signal is user-authored effort
 * ratings, this one is measured: the persisted post-run pace verdict
 * (`paceVerdictTone` on the run doc) said the session ran outside its
 * window. Tempo sessions only — they're the recurring quality session
 * the verdict actually judges (intervals are excluded from verdicts;
 * easy/long slow days are not an intensity signal). Tempo lands ~1-2×
 * a week, so the window is longer than the effort trigger's. The
 * user-authored trigger always outranks this one (evaluation order
 * below): when the athlete SAYS it's hard, that beats an inference. */
export const PACE_WINDOW_DAYS = 28;
/** How many of the most-recent judged tempo sessions we inspect. */
export const PACE_RECENT_COUNT = 3;
/** Minimum "slow" verdicts among those to trigger. */
export const PACE_MIN_SLOW = 2;

/** Review heuristic only, not a success grade or prescription rule. The
 * distance claim policy also uses 70%; keeping it local avoids coupling
 * advisory feedback to the separate slot-completion contract. */
export const SHORT_TARGET_RATIO = 0.7;
export const EXECUTION_POLICY_VERSION = "run-execution-v1";

export type RelativeEffort = "easier" | "matched" | "harder" | null;
export type PaceVerdictTone = "on" | "fast" | "easy-too-fast" | "slow";

export interface EaseWeekNudgeRun {
  id?: string;
  completedAtMs?: number;
  distance?: number;
  duration?: number;
  isInvalid?: boolean;
  savedAnyway?: boolean;
  routeQuality?: string | null;
  executionTarget?: RunExecutionTarget | null;
  /** Local YYYY-MM-DD the run was completed. */
  date: string;
  /** The post-run check-in (#1523); null when the athlete skipped it. */
  relativeEffort: RelativeEffort;
  /** A6: the run's activity type ("tempo" gates the pace trigger). */
  activityType?: string;
  /** A6: the persisted pace verdict tone; null/absent when the session
   *  had no judgeable target (freeform, custom, pre-A6 runs). */
  paceVerdictTone?: PaceVerdictTone | null;
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
  /** The weekKey (Monday YYYY-MM-DD) the user dismissed the card in,
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
      /** A6: which signal fired. "harder_ratings" (user-authored, Run14)
       *  always outranks "pace_misses" (measured, A6). */
      trigger: "harder_ratings";
      /** Numerator for the card copy ("rated N of your last M …"). */
      harderCount: number;
      /** Denominator = the recent rated-in-window runs inspected. */
      ratedCount: number;
      /** So the caller can phrase the window if it wants. */
      windowDays: number;
    }
  | {
      show: true;
      trigger: "pace_misses";
      /** "N of your last M tempo sessions ran outside their window". */
      slowCount: number;
      judgedCount: number;
      windowDays: number;
    }
  | {
      show: true;
      trigger: "short_sessions";
      shortCount: number;
      comparedCount: number;
      windowDays: number;
      policyVersion: typeof EXECUTION_POLICY_VERSION;
      evidence: Array<{
        id: string;
        date: string;
        actual: number;
        target: RunExecutionTarget;
      }>;
    };

/** Calendar-day gap a→b (b earlier than a → positive). Local midnights,
 *  DST-safe via round. */
function daysBetween(a: string, b: string): number {
  const ms = parseLocalDate(a).getTime() - parseLocalDate(b).getTime();
  return Math.round(ms / 86_400_000);
}

function eligible(run: EaseWeekNudgeRun): boolean {
  return (
    isRunDateKey(run.date) &&
    run.isInvalid !== true &&
    run.savedAnyway !== true &&
    (run.distance === undefined ||
      (Number.isFinite(run.distance) && run.distance >= 50)) &&
    (run.duration === undefined ||
      (Number.isFinite(run.duration) && run.duration >= 30))
  );
}

function latestFirst(a: EaseWeekNudgeRun, b: EaseWeekNudgeRun): number {
  return (
    b.date.localeCompare(a.date) ||
    (b.completedAtMs ?? 0) - (a.completedAtMs ?? 0) ||
    (a.id ?? "").localeCompare(b.id ?? "")
  );
}

function recentRuns(runs: EaseWeekNudgeRun[]): EaseWeekNudgeRun[] {
  const seen = new Set<string>();
  return runs
    .filter(eligible)
    .sort(latestFirst)
    .filter((run) => {
      if (!run.id) return true; // compatibility with the original pure input
      if (seen.has(run.id)) return false;
      seen.add(run.id);
      return true;
    });
}

function judgeableTempo(run: EaseWeekNudgeRun): boolean {
  return (
    run.activityType === "tempo" &&
    ["on", "slow", "fast"].includes(run.paceVerdictTone ?? "") &&
    run.routeQuality !== "poor" &&
    run.routeQuality !== "patchy"
  );
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
  if (!isRunDateKey(input.today)) return { show: false };
  if (input.phaseSuppressed) return { show: false };
  if (input.weekAlreadyEased) return { show: false };
  if (input.fellBehindPending) return { show: false };

  const currentWeekKey = localWeekKey(parseLocalDate(input.today));
  if (input.dismissedWeekKey === currentWeekKey) return { show: false };

  if (isRunDateKey(input.lastShownAt)) {
    const sinceShown = daysBetween(input.today, input.lastShownAt);
    // `sinceShown === 0` is the SAME day the card is currently showing —
    // the card records lastShownAt on mount, and the parent re-evaluates
    // live, so treating "today" as cooled-down would make the card
    // suppress itself the render after it appears. Only a PRIOR showing
    // 1..13 days ago suppresses; day 14+ may show again.
    if (sinceShown > 0 && sinceShown < COOLDOWN_DAYS) return { show: false };
  }

  // ── Trigger (Run14b) ──
  const runs = recentRuns(input.runs);
  const recentRated = runs
    .filter((r) => {
      if (!["easier", "matched", "harder"].includes(r.relativeEffort ?? ""))
        return false;
      const age = daysBetween(input.today, r.date);
      // In window, and never a future-dated run.
      return age >= 0 && age <= WINDOW_DAYS;
    })
    .slice(0, RECENT_RATED_COUNT);

  const harderCount = recentRated.filter(
    (r) => r.relativeEffort === "harder"
  ).length;

  if (harderCount >= MIN_HARDER) {
    return {
      show: true,
      trigger: "harder_ratings",
      harderCount,
      ratedCount: recentRated.length,
      windowDays: WINDOW_DAYS,
    };
  }

  // Repeated substantial shortfalls are a reason to REVIEW the remaining
  // quality, not evidence of fatigue. Compare only unchanged saved targets.
  const compared = runs
    .filter((run) => {
      const age = daysBetween(input.today, run.date);
      const target = run.executionTarget;
      const actual = target?.unit === "seconds" ? run.duration : run.distance;
      return (
        age >= 0 &&
        age <= WINDOW_DAYS &&
        run.routeQuality !== "poor" &&
        run.routeQuality !== "patchy" &&
        !!run.id &&
        !!target &&
        (target.unit === "seconds" || target.unit === "metres") &&
        Number.isFinite(target.value) &&
        target.value > 0 &&
        typeof actual === "number" &&
        Number.isFinite(actual) &&
        actual > 0
      );
    })
    .slice(0, RECENT_RATED_COUNT);
  const short = compared.filter((run) => {
    const target = run.executionTarget!;
    const actual = target.unit === "seconds" ? run.duration! : run.distance!;
    return actual / target.value < SHORT_TARGET_RATIO;
  });
  if (short.length >= MIN_HARDER) {
    return {
      show: true,
      trigger: "short_sessions",
      shortCount: short.length,
      comparedCount: compared.length,
      windowDays: WINDOW_DAYS,
      policyVersion: EXECUTION_POLICY_VERSION,
      evidence: short.map((run) => ({
        id: run.id!,
        date: run.date,
        actual:
          run.executionTarget!.unit === "seconds"
            ? run.duration!
            : run.distance!,
        target: run.executionTarget!,
      })),
    };
  }

  // ── A6 trigger: repeated pace misses on quality sessions ──
  // Evaluated only when the user-authored trigger did not fire.
  const judgedTempo = runs
    .filter((r) => {
      if (!judgeableTempo(r)) return false;
      const age = daysBetween(input.today, r.date);
      return age >= 0 && age <= PACE_WINDOW_DAYS;
    })
    .slice(0, PACE_RECENT_COUNT);

  const slowCount = judgedTempo.filter(
    (r) => r.paceVerdictTone === "slow"
  ).length;

  if (slowCount >= PACE_MIN_SLOW) {
    return {
      show: true,
      trigger: "pace_misses",
      slowCount,
      judgedCount: judgedTempo.length,
      windowDays: PACE_WINDOW_DAYS,
    };
  }
  return { show: false };
}

/* ── A6: the post-ease bounce check ─────────────────────────────────
 *
 * After the athlete APPLIED an easier week (the AdjustWeekSheet apply
 * records the weekKey), the interesting question the following week is:
 * did the quality come back? One factual read, in the honest register:
 *
 *   "recovered"     — legacy internal name: latest tempo was on target.
 *                     It does not establish recovery or causation.
 *   "above_window"  — latest tempo was faster than its target window.
 *   "still_missing" — this week's judged tempo is still slow: worth
 *                     keeping the load gentle (the nudge machinery
 *                     stays available; this line only INFORMS).
 *   null            — nothing to say: no eased week on record, the
 *                     eased week wasn't LAST week, or no judged tempo
 *                     has happened yet this week.
 *
 * The read uses the LATEST judged tempo of the current week, so an
 * early miss followed by an on-target repeat resolves to "recovered".
 */
export type PostEaseBounce =
  | "recovered"
  | "still_missing"
  | "above_window"
  | null;

export function evaluatePostEaseBounce(input: {
  /** Monday weekKey the athlete applied an easier week in, or null. */
  easedWeekKey: string | null;
  /** Local YYYY-MM-DD "today". */
  today: string;
  runs: EaseWeekNudgeRun[];
}): PostEaseBounce {
  if (!isRunDateKey(input.easedWeekKey) || !isRunDateKey(input.today))
    return null;
  const currentWeek = localWeekKey(parseLocalDate(input.today));
  const lastWeek = localWeekKey(addLocalDays(parseLocalDate(input.today), -7));
  // Only the week immediately after the eased week gets the read —
  // later weeks are back to normal evaluation.
  if (input.easedWeekKey !== lastWeek) return null;

  const thisWeekJudged = recentRuns(input.runs).filter(
    (r) =>
      judgeableTempo(r) &&
      localWeekKey(parseLocalDate(r.date)) === currentWeek &&
      r.date <= input.today
  );
  if (thisWeekJudged.length === 0) return null;
  if (thisWeekJudged[0].paceVerdictTone === "fast") return "above_window";
  return thisWeekJudged[0].paceVerdictTone === "slow"
    ? "still_missing"
    : "recovered";
}
