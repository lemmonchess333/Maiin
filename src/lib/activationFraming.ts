/**
 * Home cold-start activation framing (#972).
 *
 * Pure + deterministic (now is injected, never read inside) so the
 * day-type × per-domain-emptiness × account-age matrix is unit-testable in
 * one place — both the Home wiring and the test read this, never a parallel
 * inline formula.
 *
 * The rule: for a NEW user, the Home cold-start should drive a first action
 * matching what today actually is, reusing the existing day-type cards:
 *   - lift / both day → frame the existing LiftCTACard as "your first workout"
 *   - run / both day  → frame the existing RunCTACard as "your first run"
 *   - rest day        → surface a "log your first meal" card
 *
 * Each domain activates INDEPENDENTLY off its own lifetime count (a committed
 * lifter who has never logged food still gets the rest-day meal nudge). The
 * 14-day window off `createdAt` is the guard against permanently telling a
 * settled single-domain user they haven't done X — and it's what naturally
 * excludes returning-but-reset users (who are almost always well past 14 days).
 */
export const ACTIVATION_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export type TodayType = "lift" | "run" | "both" | "rest";

export interface ActivationFramingInput {
  /** profile.createdAt in epoch ms, or null when not yet a Timestamp. */
  createdAtMs: number | null;
  /** Injected for determinism. */
  nowMs: number;
  todayType: TodayType;
  /** Lifetime logged-workout count. */
  workoutCount: number;
  /** Lifetime logged-run count. */
  runCount: number;
  /** Lifetime logged-meal count. */
  mealCount: number;
}

export interface ActivationFraming {
  withinWindow: boolean;
  /** Frame the lift card as "your first workout". */
  firstWorkout: boolean;
  /** Frame the run card as "your first run". */
  firstRun: boolean;
  /** Show the rest-day "log your first meal" card. */
  firstMeal: boolean;
}

/** True when `nowMs` is within ACTIVATION_WINDOW_DAYS of `createdAtMs`. */
export function isWithinActivationWindow(
  createdAtMs: number | null,
  nowMs: number
): boolean {
  if (createdAtMs == null) return false;
  const age = nowMs - createdAtMs;
  // age >= 0 guards clock skew / a future createdAt.
  return age >= 0 && age <= ACTIVATION_WINDOW_DAYS * DAY_MS;
}

/** Hard-suppress the welcome checklist once a user has this many workouts. */
export const WELCOME_CHECKLIST_WORKOUT_CAP = 3;

export interface WelcomeChecklistInput {
  /** profile.createdAt in epoch ms, or null when not yet a Timestamp. */
  createdAtMs: number | null;
  /** Injected for determinism. */
  nowMs: number;
  /** Lifetime logged-workout count. */
  workoutCount: number;
  /** Lifetime logged-run count. */
  runCount: number;
  /** Lifetime logged-meal count. */
  mealCount: number;
  /** Persisted "user tapped the dismiss X" flag. */
  dismissed: boolean;
}

/**
 * The welcome checklist's job is done once the user has completed the core
 * activation loop derived from real signals: started training (a workout OR a
 * run) AND logged a meal. (Viewing Analytics is a passive surface with no
 * loggable signal, so it isn't a completion gate.)
 */
export function isWelcomeChecklistComplete(
  input: Pick<WelcomeChecklistInput, "workoutCount" | "runCount" | "mealCount">
): boolean {
  const startedTraining = input.workoutCount + input.runCount > 0;
  const loggedMeal = input.mealCount > 0;
  return startedTraining && loggedMeal;
}

/**
 * Whether the Home "Welcome to Tropos!" cold-start checklist should render.
 *
 * Visibility is DATA-DERIVED, not just a one-time localStorage flag — the old
 * behaviour (a bare `useCoachMarks` dismissed-flag) left the card stranded on
 * rich accounts that never tapped the X, e.g. a returning user on a fresh
 * device or after clearing storage (audit #7). It hides when ANY of:
 *   - the user explicitly dismissed it, OR
 *   - hard suppression: an established account — >= WELCOME_CHECKLIST_WORKOUT_CAP
 *     logged workouts, or older than the 14-day activation window (a null
 *     createdAt fails closed here too), OR
 *   - auto-hide: the activation loop is already complete.
 */
export function shouldShowWelcomeChecklist(
  input: WelcomeChecklistInput
): boolean {
  if (input.dismissed) return false;
  // Hard suppression — established accounts are past cold-start.
  if (input.workoutCount >= WELCOME_CHECKLIST_WORKOUT_CAP) return false;
  if (!isWithinActivationWindow(input.createdAtMs, input.nowMs)) return false;
  // Auto-hide once the user has actually activated.
  if (isWelcomeChecklistComplete(input)) return false;
  return true;
}

export function getActivationFraming(
  input: ActivationFramingInput
): ActivationFraming {
  const { createdAtMs, nowMs, todayType, workoutCount, runCount, mealCount } =
    input;
  const withinWindow = isWithinActivationWindow(createdAtMs, nowMs);
  const isLiftish = todayType === "lift" || todayType === "both";
  const isRunish = todayType === "run" || todayType === "both";
  return {
    withinWindow,
    firstWorkout: withinWindow && isLiftish && workoutCount === 0,
    firstRun: withinWindow && isRunish && runCount === 0,
    firstMeal: withinWindow && todayType === "rest" && mealCount === 0,
  };
}
