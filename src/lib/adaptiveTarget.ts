/**
 * Adaptive-TDEE target resolution + weekly rate cap (Nutr2 / #981 + #982).
 *
 * This module is the adaptive-target ENGINE: it sits between the estimator
 * (`adaptiveTdee.ts`) and the single source of truth for today's target
 * (`useEffectiveTargets`). `resolveAdaptiveTarget` is the deep entry point — it
 * owns the whole estimate → cap → precedence → view-assembly pipeline as ONE
 * pure function, so the decision matrix has a single test surface and the hook
 * (`useAdaptiveTdee`) is left as plumbing (Firestore I/O + the session latch +
 * cap persistence). The smaller `resolveTargetSource` / `applyWeeklyCap` /
 * `isAdaptiveActive` are the pure steps it composes (kept exported so each step
 * stays independently table-testable).
 *
 * Locked invariants (Nutr2):
 * - Precedence: manual override > learned (Pro/trial + ready) > formula.
 * - Free users never see learned and never see the warmup ("no tease").
 * - The learned number moves at most ±150 kcal per rolling 7 days, seeded from
 *   the formula target so the formula→learned handoff never jumps.
 */

import { estimateAdaptiveTDEE, computeWarmupProgress } from "./adaptiveTdee";

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

// ── Orchestrator: the adaptive-target engine entry point ─────────────────

/**
 * Adaptive is active ONLY for a signed-in Pro/trial user without a manual
 * calorie override (Q4 lock A). This is the SINGLE definition of the
 * eligibility gate — both the resolver and the hook's data-load gate call it,
 * so the precedence ladder can't drift between "do we read data" and "what do
 * we show".
 */
export function isAdaptiveActive(p: {
  hasUser: boolean;
  isPro: boolean;
  isManualOverride: boolean;
}): boolean {
  return p.hasUser && p.isPro && !p.isManualOverride;
}

/** The fully-resolved adaptive view consumed by `useEffectiveTargets`. */
export interface AdaptiveTdeeView {
  /** True when adaptive is active (Pro/trial, signed in, no manual override). */
  active: boolean;
  /** Estimator gate — true once enough data has accumulated. */
  ready: boolean;
  /** Which number wins: "formula" (default) or "learned". */
  source: TargetSource;
  /** The resolved calorie target to use. */
  value: number;
  /** Render the warmup bar (active, loaded, gate not yet cleared). */
  showWarmup: boolean;
  /** 0..1 bar fill — high-water latched within the session so it never shrinks. */
  warmupFraction: number;
  /** True when live progress has slipped behind the rolling window. */
  stalled: boolean;
}

export interface ResolveAdaptiveTargetInput {
  /** `!!user`. */
  hasUser: boolean;
  /** Pro OR active trial. */
  isPro: boolean;
  /** `!!profile.customCalorieTarget`. */
  isManualOverride: boolean;
  /** baseTarget — customCalorieTarget if set, else the formula TDEE. */
  formulaTarget: number;
  /**
   * The goal calorie offset baked into `formulaTarget` (cut -500 / lean bulk
   * +300, or rate-derived; 0 for recomp/maintain). The estimator returns the
   * user's MAINTENANCE TDEE, so this offset is re-applied to the learned value
   * before the cap — otherwise the learned target converges on bare maintenance
   * and silently erases the user's deficit/surplus over a few weeks
   * (C-NUTRITION). Both the cap's formula seed and its learned destination then
   * carry the same offset, so the deficit is preserved through the handoff.
   */
  goalOffset: number;
  /** Trailing-window intake, summed per date (loaded by the hook). */
  intakeByDay: { dateKey: string; kcal: number }[];
  /** Raw dated weigh-ins within the window (loaded by the hook). */
  weighIns: { dateKey: string; weightKg: number }[];
  /** True once the hook's trailing-window read has resolved. */
  loaded: boolean;
  /** Persisted cap state, or null on first-ever engage. */
  capPrev: CapState | null;
  /** Current time — held stable across latch churn by the caller. */
  now: Date;
  /**
   * Session high-water latch value. The latch STATE lives in the hook (so it
   * survives re-renders); its value is threaded in here so the whole view is a
   * pure function. `warmupFraction = max(latched, liveFraction)`.
   */
  latched: number;
}

export interface ResolveAdaptiveTargetResult {
  view: AdaptiveTdeeView;
  /** Cap state to persist when `capChanged`; null when no cap was applied. */
  capState: CapState | null;
  /** True when the cap moved this resolve and `capState` should be persisted. */
  capChanged: boolean;
}

function inactiveView(formulaTarget: number): AdaptiveTdeeView {
  return {
    active: false,
    ready: false,
    source: "formula",
    value: formulaTarget,
    showWarmup: false,
    warmupFraction: 0,
    stalled: false,
  };
}

/**
 * The deep entry point. Pure: estimate → weekly cap → source precedence →
 * view assembly (incl. the latch-derived warmup fraction + stall). Returns the
 * complete view the user sees, plus the cap state the hook should persist when
 * `capChanged`. Inactive users short-circuit to the plain formula with zero
 * estimator work.
 */
export function resolveAdaptiveTarget(
  input: ResolveAdaptiveTargetInput
): ResolveAdaptiveTargetResult {
  const {
    hasUser,
    isPro,
    isManualOverride,
    formulaTarget,
    goalOffset,
    intakeByDay,
    weighIns,
    loaded,
    capPrev,
    now,
    latched,
  } = input;

  if (!isAdaptiveActive({ hasUser, isPro, isManualOverride })) {
    return {
      view: inactiveView(formulaTarget),
      capState: null,
      capChanged: false,
    };
  }

  const result = estimateAdaptiveTDEE({ intakeByDay, weighIns });

  // Apply the weekly rate cap once the gate is ready (seeded from formula on
  // first engage → no jump).
  // Re-apply the goal offset to the learned MAINTENANCE estimate so the capped
  // learned target preserves the deficit/surplus (C-NUTRITION). The cap is
  // seeded from `formulaTarget` (which already carries the offset), so both
  // endpoints share it and the formula→learned handoff stays continuous.
  const cap =
    result.ready && result.learnedTDEE != null
      ? applyWeeklyCap({
          rawLearned: result.learnedTDEE + goalOffset,
          formulaTarget,
          prev: capPrev,
          now,
        })
      : null;

  const resolved = resolveTargetSource({
    isPro,
    ready: result.ready,
    formulaTarget,
    learnedApplied: cap?.applied ?? null,
    isManualOverride,
  });

  const liveFraction = computeWarmupProgress(result).fraction;
  const warmupFraction = Math.max(latched, liveFraction);
  const stalled = loaded && !result.ready && liveFraction + 0.001 < latched;

  return {
    view: {
      active: true,
      ready: result.ready,
      source: resolved.source,
      value: resolved.value,
      showWarmup: loaded && resolved.showWarmup,
      warmupFraction,
      stalled,
    },
    capState: cap?.capState ?? null,
    capChanged: cap?.changed ?? false,
  };
}
