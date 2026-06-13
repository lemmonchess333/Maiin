/**
 * Badge PROGRESS — the goal-gradient pull. For an unearned badge, "how close
 * am I, in human terms?" so the grid can show a ring + "X / Y" and surface the
 * single nearest badge. Returns `null` for badges whose progress can't be
 * computed from the client's windowed snapshots (lifetime distance, PRs,
 * nutrition) — those earn server-side (a follow-up); the UI just renders them
 * as a plain locked badge with no ring.
 *
 * Pure + `today`-injected so the rolling-window maths is unit-testable. Reuses
 * `activeDayCounts` from ./badgeEarning so progress and earning never disagree
 * (earned ⇔ pct >= 1 for every badge that has progress here).
 */
import type { BadgeDef } from "./badges";
import {
  activeDayCounts,
  maxConsecutiveDayRun,
  MEAL_PREP_RUN_DAYS,
  EARLY_BIRD_DAYS,
  ULTIMATE_ATHLETE_COUNT,
  NUTRITION_STREAK_DAYS,
  type BadgeEarningContext,
} from "./badgeEarning";

export interface BadgeProgress {
  /** Clamped current value (never exceeds target). */
  current: number;
  target: number;
  /** 0..1, clamped. 1 ⇒ the badge is (about to be) earned. */
  pct: number;
  /** Short human label, e.g. "5 / 7 days" or "2/5 lifts · 1/5 runs". */
  label: string;
}

/** Progress context — same inputs as the earning decision. */
export type BadgeProgressContext = BadgeEarningContext;

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function badgeProgress(
  badge: BadgeDef,
  ctx: BadgeProgressContext
): BadgeProgress | null {
  // Streak-threshold badges — currentStreak is accurate + persisted.
  if (typeof badge.threshold === "number" && badge.threshold > 0) {
    const target = badge.threshold;
    const current = Math.min(ctx.currentStreak, target);
    return {
      current,
      target,
      pct: clamp01(ctx.currentStreak / target),
      label: `${current} / ${target} days`,
    };
  }

  // Balanced — 5 lift-days + 5 run-days in the rolling 14d.
  if (badge.id === "balanced") {
    const { liftDays, runDays } = activeDayCounts(
      ctx.workouts,
      ctx.runs,
      ctx.today,
      14
    );
    const lift = Math.min(liftDays, 5);
    const run = Math.min(runDays, 5);
    return {
      current: lift + run,
      target: 10,
      pct: clamp01((lift + run) / 10),
      label: `${lift}/5 lifts · ${run}/5 runs`,
    };
  }

  // Hybrid Athlete — a lift AND a run in the rolling 7d.
  if (badge.id === "hybrid_athlete") {
    const { liftDays, runDays } = activeDayCounts(
      ctx.workouts,
      ctx.runs,
      ctx.today,
      7
    );
    const lift = liftDays > 0 ? 1 : 0;
    const run = runDays > 0 ? 1 : 0;
    return {
      current: lift + run,
      target: 2,
      pct: clamp01((lift + run) / 2),
      label: `${lift ? "✓" : "–"} lift · ${run ? "✓" : "–"} run this week`,
    };
  }

  // Iron Runner — 3 lift-days + 3 run-days in the rolling 7d.
  if (badge.id === "iron_runner") {
    const { liftDays, runDays } = activeDayCounts(
      ctx.workouts,
      ctx.runs,
      ctx.today,
      7
    );
    const lift = Math.min(liftDays, 3);
    const run = Math.min(runDays, 3);
    return {
      current: lift + run,
      target: 6,
      pct: clamp01((lift + run) / 6),
      label: `${lift}/3 lifts · ${run}/3 runs`,
    };
  }

  // Meal Prep Master — longest run of consecutive meal-logged days vs 14.
  if (badge.id === "meal_prep_master") {
    const run = maxConsecutiveDayRun(ctx.mealDates ?? []);
    const current = Math.min(run, MEAL_PREP_RUN_DAYS);
    return {
      current,
      target: MEAL_PREP_RUN_DAYS,
      pct: clamp01(run / MEAL_PREP_RUN_DAYS),
      label: `${current} / ${MEAL_PREP_RUN_DAYS} days logged`,
    };
  }

  // Early Bird — distinct days with a before-7am log vs 5.
  if (badge.id === "early_bird") {
    const days = ctx.earlyLogDays?.length ?? 0;
    const current = Math.min(days, EARLY_BIRD_DAYS);
    return {
      current,
      target: EARLY_BIRD_DAYS,
      pct: clamp01(days / EARLY_BIRD_DAYS),
      label: `${current} / ${EARLY_BIRD_DAYS} early days`,
    };
  }

  // Ultimate Athlete — badges earned (excl. itself) vs 15.
  if (badge.id === "ultimate_athlete") {
    const earned = ctx.earnedBadgeCount ?? 0;
    const current = Math.min(earned, ULTIMATE_ATHLETE_COUNT);
    return {
      current,
      target: ULTIMATE_ATHLETE_COUNT,
      pct: clamp01(earned / ULTIMATE_ATHLETE_COUNT),
      label: `${current} / ${ULTIMATE_ATHLETE_COUNT} badges`,
    };
  }

  // Protein Pro / Hydration Hero — longest run of target-hit days vs 7.
  if (badge.id === "protein_pro" || badge.id === "hydration_hero") {
    const days =
      badge.id === "protein_pro" ? ctx.proteinHitDays : ctx.waterHitDays;
    const run = maxConsecutiveDayRun(days ?? []);
    const current = Math.min(run, NUTRITION_STREAK_DAYS);
    return {
      current,
      target: NUTRITION_STREAK_DAYS,
      pct: clamp01(run / NUTRITION_STREAK_DAYS),
      label: `${current} / ${NUTRITION_STREAK_DAYS} days`,
    };
  }

  // No honest gradient for the one-shot "perfect day" badges (macro_master, the
  // nutrition leg of triple_threat) or for milestone/lifetime (server-side).
  return null;
}

/**
 * The single nearest unearned, in-progress badge — what to dangle in front of
 * the user ("3 days to Week Warrior"). Strictly between 0 and 1 progress, so
 * not-yet-started (pct 0) and done (pct ≥ 1) badges don't hijack the slot.
 * Returns the badge + its progress, or null when nothing is mid-flight.
 */
export function nearestBadge(
  badges: { id: string; earnedAt: string | null; def: BadgeDef }[],
  ctx: BadgeProgressContext
): { def: BadgeDef; progress: BadgeProgress } | null {
  let best: { def: BadgeDef; progress: BadgeProgress } | null = null;
  for (const b of badges) {
    if (b.earnedAt) continue;
    const progress = badgeProgress(b.def, ctx);
    if (!progress || progress.pct <= 0 || progress.pct >= 1) continue;
    if (!best || progress.pct > best.progress.pct) {
      best = { def: b.def, progress };
    }
  }
  return best;
}
