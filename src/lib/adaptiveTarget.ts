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
 * Locked invariants (Nutr2, stale-hold amendment 2026-08-05):
 * - Precedence: manual override > learned (Pro/trial + ready-or-held) > formula.
 * - Free users never see learned and never see the warmup ("no tease").
 * - The learned number moves at most ±150 kcal per rolling 7 days, seeded from
 *   the formula target so the formula→learned handoff never jumps — and once
 *   learned, an un-ready gate HOLDS the last applied value rather than
 *   reverting to formula (see the stale-hold branch), so the cap's no-jump
 *   guarantee survives a logging lapse in both directions.
 */

import { estimateAdaptiveTDEE, computeWarmupProgress } from "./adaptiveTdee";
import { clamp } from "@/lib/utils";
import {
  floorTargetCalories,
  ESSENTIAL_FAT_FLOOR_PER_KG,
} from "./macroConstants";

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
  /**
   * Race-taper freeze: TODAY is inside the taper/race/post-race exclusion
   * window. Hold the pre-taper learned value (`capPrev.lastApplied`) and do NOT
   * advance the cap, so glycogen/water swings + reduced taper intake can't
   * drift the estimate and cause post-race over-correction. No-op when there's
   * no prior learned value to freeze.
   */
  frozen?: boolean;
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
    frozen,
  } = input;

  if (!isAdaptiveActive({ hasUser, isPro, isManualOverride })) {
    return {
      view: inactiveView(formulaTarget),
      capState: null,
      capChanged: false,
    };
  }

  // Taper freeze: hold the persisted pre-taper learned value, no cap advance.
  // Only when a learned value already exists (capPrev) — otherwise there's
  // nothing to freeze, so fall through to the normal (formula/warmup) path.
  if (frozen && capPrev) {
    return {
      view: {
        active: true,
        ready: true,
        source: "learned",
        value: capPrev.lastApplied,
        showWarmup: false,
        warmupFraction: Math.max(latched, 1),
        stalled: false,
      },
      capState: capPrev,
      capChanged: false,
    };
  }

  const result = estimateAdaptiveTDEE({ intakeByDay, weighIns });

  /* Stale-hold (2026-08-05): once learned, an un-ready gate stops UPDATES —
     it does not evaporate the estimate.

     The gate reads a trailing 21-day window, so a user who stops weighing
     (the higher-friction habit dies first; they are often still logging
     every meal) slides under `minWeighIns` and — without this branch —
     their target snapped from the learned value back to the formula
     OVERNIGHT. Measured on the probe journey: 2919 → 2500 (−419 kcal) six
     days after the last weigh-in, then 36 days of formula (the gate needs
     a fresh 14-day span to re-clear), then 2500 → 2928 back up in one day.
     The ±150/week cap exists precisely so this number never moves like
     that, and the gate was bypassing it in both directions.

     So: hold the last APPLIED value while the gate is down. The estimate
     goes stale rather than wrong — the fresh window corrects it at the
     capped rate once the gate re-clears, and the hold is what makes that
     correction continuous (re-engage steps from the held value, not from
     a formula the user was never actually eating to). MacroFactor — the
     reference app the Nutr2 lock itself validated against — holds
     expenditure through logging gaps the same way.

     What this deliberately does NOT change: the cold-start. A user with no
     prior learned value (`capPrev == null`) still gets the formula until
     the gate first clears — the lock's early-water-weight conservatism is
     about NEW estimates, and this branch never manufactures one. The
     warmup bar + the locked "keep logging to keep personalizing" stall
     nudge still render (showWarmup stays on the un-ready path), so the
     hold is visible as "stale", never silently passed off as fresh. */
  if (!result.ready && capPrev) {
    const liveFraction = computeWarmupProgress(result).fraction;
    return {
      view: {
        active: true,
        ready: false,
        source: "learned",
        value: capPrev.lastApplied,
        showWarmup: loaded,
        warmupFraction: Math.max(latched, liveFraction),
        stalled: loaded && liveFraction + 0.001 < latched,
      },
      capState: capPrev,
      capChanged: false,
    };
  }

  // Apply the weekly rate cap once the gate is ready (seeded from formula on
  // first engage → no jump).
  // Re-apply the goal offset to the learned MAINTENANCE estimate so the capped
  // learned target preserves the deficit/surplus (C-NUTRITION). The cap is
  // seeded from `formulaTarget` (which already carries the offset), so both
  // endpoints share it and the formula→learned handoff stays continuous.
  // NUTR-L5: the same safety floor as `calculateTDEE` — the offset can never
  // push the learned target below min(learned maintenance, MIN_TARGET_CALORIES).
  const cap =
    result.ready && result.learnedTDEE != null
      ? applyWeeklyCap({
          rawLearned: floorTargetCalories(
            result.learnedTDEE + goalOffset,
            result.learnedTDEE
          ),
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

/**
 * Has a learned target actually been APPLIED to this user?
 *
 * Client copy of the marker check in
 * functions/lib/calorieTargetResolution.js (`hasAppliedLearnedTarget`) —
 * pinned to it by adaptiveTargetMirror.cross.test.ts. `adaptiveCapState`
 * is persisted only by `applyWeeklyCap`, which runs after the warmup gate
 * clears, so a real (non-epoch) `lastAppliedAt` is the record that the
 * handoff happened. The epoch timestamp is the seed anchor used on first
 * engage and means "never applied".
 */
export const CAP_STATE_EPOCH = "1970-01-01T00:00:00.000Z";

export function hasAppliedLearnedTarget(capState: unknown): boolean {
  if (!capState || typeof capState !== "object") return false;
  const cs = capState as Partial<CapState>;
  if (typeof cs.lastApplied !== "number") return false;
  if (!Number.isFinite(cs.lastApplied)) return false;
  const at = cs.lastAppliedAt;
  if (typeof at !== "string" || at === CAP_STATE_EPOCH) return false;
  return Number.isFinite(Date.parse(at));
}

/**
 * The calorie target a POINT-IN-TIME surface should quote for this user —
 * resolved from persisted profile fields alone, no estimator reads.
 *
 * Client copy of the server's `resolveScoringCalorieTarget` (same file as
 * above), which decides what the PI scores adherence against. A snapshot
 * surface (the weekly review) must quote the SAME number, or the recap
 * contradicts both the app's own guidance and the PI it sits beside: a
 * Pro user who ate exactly what the app showed them reads as off-target
 * in their own review, by up to the unbounded cumulative adaptive drift
 * (150 kcal per window). Live surfaces keep resolving through
 * `useAdaptiveTdee` → `useEffectiveTargets`; this is for the ones that
 * assemble from a profile read.
 *
 * Returns null when the profile carries no usable target — the review
 * already renders that as "no target line" rather than a guess.
 */
export function resolveSnapshotCalorieTarget(
  profile:
    | {
        targetCalories?: unknown;
        customCalorieTarget?: unknown;
        adaptiveCapState?: unknown;
        weightKg?: unknown;
      }
    | null
    | undefined,
  isPro: boolean
): ResolvedTarget | null {
  const formulaTarget =
    profile && typeof profile.targetCalories === "number"
      ? profile.targetCalories
      : null;
  if (formulaTarget == null) return null;

  const capState = profile ? profile.adaptiveCapState : null;
  const applied = hasAppliedLearnedTarget(capState);
  const resolved = resolveTargetSource({
    isPro,
    ready: applied,
    formulaTarget,
    learnedApplied: applied ? (capState as CapState).lastApplied : null,
    isManualOverride: !!(profile && profile.customCalorieTarget),
  });
  // Nutr3: an infeasible target is no target — mirror of the server's
  // resolveScoringCalorieTarget guard (calorieTargetResolution.js).
  if (isBelowEssentialFatCost(resolved.value, profile?.weightKg)) return null;
  return resolved;
}

/** Nutr3: true when `targetCalories` cannot fund the essential fat floor at
 *  `weightKg` — no protein or carbs can be funded, so nothing downstream may
 *  treat the number as a goal. Unknown weight → false. */
export function isBelowEssentialFatCost(
  targetCalories: number,
  weightKg: unknown
): boolean {
  if (
    typeof weightKg !== "number" ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0
  )
    return false;
  const essentialFatG = Math.round(ESSENTIAL_FAT_FLOOR_PER_KG * weightKg);
  return targetCalories < essentialFatG * 9;
}
