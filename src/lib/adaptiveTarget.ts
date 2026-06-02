/**
 * Adaptive-TDEE target resolution + weekly rate cap (Nutr2 / #981 + #982).
 *
 * These pure functions sit between the estimator (`adaptiveTdee.ts`) and the
 * single source of truth for today's target (`useEffectiveTargets`). They
 * decide WHICH number the user sees (formula vs learned) and bound how fast
 * the learned number is allowed to move.
 *
 * Locked invariants (Nutr2):
 * - Precedence: manual override > learned (Pro/trial + ready) > formula.
 * - Free users never see learned and never see the warmup ("no tease").
 * - The learned number moves at most ±150 kcal per rolling 7 days, seeded from
 *   the formula target so the formula→learned handoff never jumps.
 */

/** Default maximum the applied target may move per rolling 7-day window. */
export const MAX_WEEKLY_STEP_KCAL = 150;

/** Rolling cadence: the cap releases one step per this many days. */
export const CAP_CADENCE_DAYS = 7;

export type TargetSource = "formula" | "learned";

export interface ResolvedTarget {
  source: TargetSource;
  /** The calorie target to display/use. */
  value: number;
  /** True when the "personalizing your metabolism" warmup bar should render. */
  showWarmup: boolean;
}

export interface ResolveTargetInput {
  /** Pro OR active trial — only these users get learned + warmup (Q4 lock A). */
  isPro: boolean;
  /** The estimator gate. */
  ready: boolean;
  /** baseTarget — customCalorieTarget if set, else the formula TDEE. */
  formulaTarget: number;
  /** The CAPPED applied learned value (from applyWeeklyCap); null if unavailable. */
  learnedApplied: number | null;
  /** True when the user has manually set a custom calorie target. */
  isManualOverride: boolean;
}

/**
 * Decide the calorie target the user sees.
 *
 * Manual override always wins (respect explicit user intent — adaptive is moot
 * when they've pinned a number). Free users always get the formula, no warmup.
 * Pro/trial users get the warmup bar until the gate clears, then the capped
 * learned value.
 */
export function resolveTargetSource(input: ResolveTargetInput): ResolvedTarget {
  const { isPro, ready, formulaTarget, learnedApplied, isManualOverride } =
    input;

  // Manual override: the user pinned a number — never override it, never tease.
  if (isManualOverride) {
    return { source: "formula", value: formulaTarget, showWarmup: false };
  }

  // Free users: plain formula, no "personalizing" language (Q4 lock A).
  if (!isPro) {
    return { source: "formula", value: formulaTarget, showWarmup: false };
  }

  // Pro/trial but the gate hasn't cleared (or no applied value yet): show the
  // formula target plus the warmup indicator.
  if (!ready || learnedApplied == null) {
    return { source: "formula", value: formulaTarget, showWarmup: true };
  }

  // Pro/trial + ready: the capped learned value takes over.
  return { source: "learned", value: learnedApplied, showWarmup: false };
}

/** Persisted state that makes the weekly cap stateful across sessions/devices. */
export interface CapState {
  /** The last value actually applied to the user. */
  lastApplied: number;
  /** ISO timestamp of the last application. */
  lastAppliedAt: string;
}

export interface ApplyWeeklyCapInput {
  /** Raw learned TDEE from the estimator (must be a finite number). */
  rawLearned: number;
  /** The formula target — the no-jump anchor when there's no prior state. */
  formulaTarget: number;
  /** Persisted cap state, or null on first-ever engage. */
  prev: CapState | null;
  /** Current time. */
  now: Date;
  /** Max kcal of movement per cadence window. Defaults to MAX_WEEKLY_STEP_KCAL. */
  maxStep?: number;
}

export interface ApplyWeeklyCapResult {
  /** The value to apply now (bounded by the cap). */
  applied: number;
  /** The cap state to persist. */
  capState: CapState;
  /** True if the applied value moved this call. */
  changed: boolean;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

/**
 * Apply the rolling weekly rate cap to the learned target.
 *
 * First-ever engage (`prev == null`) anchors at the FORMULA target with a
 * far-past timestamp, so the first step fires immediately and is bounded to
 * formula ± maxStep — the formula→learned handoff is visibly continuous (no
 * jump). Thereafter the applied value moves at most `maxStep` once per
 * `CAP_CADENCE_DAYS`; within a window it stays put.
 */
export function applyWeeklyCap(
  input: ApplyWeeklyCapInput
): ApplyWeeklyCapResult {
  const maxStep = input.maxStep ?? MAX_WEEKLY_STEP_KCAL;
  const raw = Math.round(input.rawLearned);

  // Seed from the formula target with a far-past anchor so the first step is
  // due immediately and bounded off the formula (no-jump guarantee).
  const prev: CapState = input.prev ?? {
    lastApplied: Math.round(input.formulaTarget),
    lastAppliedAt: "1970-01-01T00:00:00.000Z",
  };

  const daysSince =
    (input.now.getTime() - Date.parse(prev.lastAppliedAt)) / 86_400_000;

  // Within the cadence window — hold the last applied value.
  if (daysSince < CAP_CADENCE_DAYS) {
    return { applied: prev.lastApplied, capState: prev, changed: false };
  }

  const step = clamp(raw - prev.lastApplied, -maxStep, maxStep);
  const applied = prev.lastApplied + step;
  return {
    applied,
    capState: { lastApplied: applied, lastAppliedAt: input.now.toISOString() },
    changed: applied !== prev.lastApplied,
  };
}
