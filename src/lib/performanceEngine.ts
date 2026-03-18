// src/lib/performanceEngine.ts
/* ─────────────────────────────────────────────
   Performance Engine — Computation
   Pure functions. No Firebase imports.
   Can be extracted to Cloud Functions as-is.
   ───────────────────────────────────────────── */

import type { WeeklyAggregates, Baseline, PerformanceDoc } from "./performanceTypes";
import { PI_WEIGHTS } from "./performanceTypes";

// ── Helpers ──────────────────────────────────

/** Sunday-start week key matching useRunningStats convention */
export function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay()); // rewind to Sunday
  return d.toISOString().split("T")[0];
}

/** Get the Sunday date N weeks before a given weekKey */
export function weekKeyMinusN(weekKey: string, n: number): string {
  const d = new Date(weekKey + "T00:00:00");
  d.setDate(d.getDate() - 7 * n);
  return d.toISOString().split("T")[0];
}

/** Clamp 0–100 */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Safe ratio — avoids division by zero, returns neutral 1.0 if baseline is 0 */
function safeRatio(current: number, baseline: number): number {
  if (baseline <= 0) return current > 0 ? 1.0 : 0;
  return current / baseline;
}

// ── Baseline ─────────────────────────────────

export function computeBaseline(priorWeeks: WeeklyAggregates[]): Baseline {
  const valid = priorWeeks.filter((w) => w.liftSessions > 0 || w.runSessions > 0);
  const n = valid.length;
  return {
    liftTonnage: n > 0 ? valid.reduce((s, w) => s + w.liftTonnage, 0) / n : 0,
    liftHardSets: n > 0 ? valid.reduce((s, w) => s + w.liftHardSets, 0) / n : 0,
    runKm: n > 0 ? valid.reduce((s, w) => s + w.runKm, 0) / n : 0,
    runLongKm: n > 0 ? valid.reduce((s, w) => s + w.runLongKm, 0) / n : 0,
    weeksUsed: n,
  };
}

// ── Sub-scores ───────────────────────────────

export function computeLiftLoadScore(agg: WeeklyAggregates, bl: Baseline): number {
  if (agg.liftSessions === 0) return 0;
  // Tonnage ratio drives 70%, hard-sets ratio drives 30%
  const tonnageRatio = safeRatio(agg.liftTonnage, bl.liftTonnage);
  const hardSetRatio = safeRatio(agg.liftHardSets, bl.liftHardSets);
  // Map ratio 0–1.5 → 0–100 (1.0 = 67, >1.3 = 90+)
  const raw = tonnageRatio * 0.7 + hardSetRatio * 0.3;
  return clamp(raw * 67);
}

export function computeRunLoadScore(agg: WeeklyAggregates, bl: Baseline): number {
  if (agg.runSessions === 0) return 0;
  const kmRatio = safeRatio(agg.runKm, bl.runKm);
  const longRatio = safeRatio(agg.runLongKm, bl.runLongKm);
  const qualityBonus = agg.runQualityCount > 0 ? 10 : 0;
  const raw = kmRatio * 0.6 + longRatio * 0.4;
  return clamp(raw * 67 + qualityBonus);
}

export function computeRecoveryScore(agg: WeeklyAggregates): number {
  // Recovery is tricky without HRV/sleep. Use proxies:
  // 1. Bodyweight stability (if available) — stable = good
  // 2. Session frequency not spiking
  // 3. Nutrition logged (proxy for lifestyle consistency)
  let score = 60; // neutral starting point

  // Bodyweight stability: ±0.5kg change = good, >2kg = concerning
  if (agg.bwCurrent7dAvg != null && agg.bwPrevious7dAvg != null) {
    const delta = Math.abs(agg.bwCurrent7dAvg - agg.bwPrevious7dAvg);
    if (delta <= 0.5) score += 20;
    else if (delta <= 1.0) score += 10;
    else if (delta > 2.0) score -= 15;
  }

  // Meal tracking consistency boosts confidence in recovery
  if (agg.mealDaysLogged >= 5) score += 15;
  else if (agg.mealDaysLogged >= 3) score += 8;

  // Very high total session count suggests possible overtraining
  const totalSessions = agg.liftSessions + agg.runSessions;
  if (totalSessions > 8) score -= 10;
  else if (totalSessions >= 4 && totalSessions <= 6) score += 5;

  return clamp(score);
}

export function computeAdherenceScore(
  agg: WeeklyAggregates,
  targetWorkouts: number,
  targetCalories: number | null,
  targetProtein: number | null,
): number {
  let score = 0;
  let factors = 0;

  // Workout adherence (biggest factor)
  if (targetWorkouts > 0) {
    const totalSessions = agg.liftSessions + agg.runSessions;
    const ratio = Math.min(totalSessions / targetWorkouts, 1.2);
    score += ratio * 100;
    factors++;
  }

  // Calorie adherence
  if (targetCalories && agg.mealDaysLogged >= 3 && agg.avgDailyCalories > 0) {
    const calRatio = agg.avgDailyCalories / targetCalories;
    // 0.85–1.15 = perfect, deductions outside
    const calScore =
      calRatio >= 0.85 && calRatio <= 1.15
        ? 100
        : Math.max(0, 100 - Math.abs(1 - calRatio) * 200);
    score += calScore;
    factors++;
  }

  // Protein adherence
  if (targetProtein && agg.mealDaysLogged >= 3 && agg.avgDailyProtein > 0) {
    const protRatio = agg.avgDailyProtein / targetProtein;
    const protScore = protRatio >= 0.9 ? 100 : protRatio * 111;
    score += protScore;
    factors++;
  }

  return factors > 0 ? clamp(score / factors) : 50; // default 50 if no data
}

// ── Confidence ───────────────────────────────

export function computeConfidence(
  agg: WeeklyAggregates,
  bl: Baseline,
): "high" | "medium" | "low" {
  let signals = 0;
  if (agg.liftSessions > 0) signals++;
  if (agg.runSessions > 0) signals++;
  if (agg.mealDaysLogged >= 3) signals++;
  if (agg.bwCurrent7dAvg != null) signals++;
  if (bl.weeksUsed >= 3) signals++;

  if (signals >= 4) return "high";
  if (signals >= 2) return "medium";
  return "low";
}

// ── Load band ────────────────────────────────

export function computeLoadBand(pi: number): PerformanceDoc["loadBand"] {
  if (pi >= 85) return "overreach";
  if (pi >= 70) return "high";
  if (pi >= 45) return "moderate";
  if (pi >= 25) return "low";
  return "deload";
}

// ── Deload recommendation ────────────────────

export function shouldRecommendDeload(
  currentPI: number,
  recoveryScore: number,
  adherenceScore: number,
  previousWeekPI?: number,
): boolean {
  // PI ≥ 80 with poor recovery
  if (currentPI >= 80 && recoveryScore < 45) return true;
  // Sustained high load (two weeks in a row ≥ 75)
  if (currentPI >= 75 && previousWeekPI != null && previousWeekPI >= 75) return true;
  // High load with poor adherence (burning out)
  if (currentPI >= 70 && adherenceScore < 50) return true;
  return false;
}

// ── Insights ─────────────────────────────────

export function generateInsight(
  doc: Pick<
    PerformanceDoc,
    | "performanceIndex"
    | "liftLoadScore"
    | "runLoadScore"
    | "recoveryScore"
    | "adherenceScore"
    | "deloadRecommended"
    | "liftProgression"
    | "runVolume"
    | "loadBand"
  >,
): PerformanceDoc["insight"] {
  const {
    performanceIndex: pi,
    liftLoadScore: lls,
    runLoadScore: rls,
    recoveryScore: rs,
    adherenceScore: as_,
    deloadRecommended,
    liftProgression: lp,
    runVolume: rv,
  } = doc;

  // Title
  let title: string;
  if (pi >= 75) title = "Momentum: High";
  else if (pi >= 45) title = "Momentum: Stable";
  else title = "Momentum: Low";

  const bullets: string[] = [];

  if (deloadRecommended) {
    bullets.push("Consider a deload week — sustained high load with limited recovery signals.");
  }

  if (lls >= 70 && rls >= 70) {
    bullets.push("Both lifting and running loads are strong this week — solid hybrid output.");
  } else if (lls >= 70 && rls < 40) {
    bullets.push("Lifting is on point but running volume is low. Add an easy run if schedule allows.");
  } else if (rls >= 70 && lls < 40) {
    bullets.push("Running volume is great but lifting load dropped. Prioritise your next session.");
  }

  if (rs < 50 && bullets.length < 3) {
    bullets.push("Recovery signals are low — check sleep, hydration, and nutrition consistency.");
  }

  if (as_ < 50 && bullets.length < 3) {
    bullets.push("Adherence dipped — focus on showing up consistently over hitting PRs.");
  }

  if (lp > 1.15 && bullets.length < 3) {
    bullets.push(`Lifting tonnage is ${Math.round((lp - 1) * 100)}% above baseline — great progression.`);
  }

  if (rv > 1.2 && bullets.length < 3) {
    bullets.push(`Running volume ${Math.round((rv - 1) * 100)}% above baseline — watch for overuse.`);
  }

  if (bullets.length === 0) {
    if (pi >= 45) bullets.push("Consistent week. Keep the rhythm going.");
    else bullets.push("Light week — a good time to focus on mobility and recovery.");
  }

  return { title, bullets: bullets.slice(0, 3) };
}

// ── Plan adjustments ─────────────────────────

export function generatePlanAdjustments(
  doc: Pick<PerformanceDoc, "loadBand" | "liftLoadScore" | "runLoadScore" | "recoveryScore" | "deloadRecommended">,
): PerformanceDoc["planAdjustments"] {
  const lift: string[] = [];
  const run: string[] = [];

  if (doc.deloadRecommended) {
    lift.push("Reduce working sets by 30–40% or drop accessory work.");
    run.push("Cap runs at easy pace. Replace one session with active recovery.");
    return { lift, run };
  }

  if (doc.loadBand === "overreach") {
    lift.push("Maintain intensity but consider reducing total volume 10–15%.");
    run.push("Keep long run but drop one mid-week session if fatigued.");
  } else if (doc.loadBand === "low" || doc.loadBand === "deload") {
    if (doc.liftLoadScore < 30) lift.push("Focus on progressive overload — small weight jumps or extra set.");
    if (doc.runLoadScore < 30) run.push("Add one easy 20-min run to rebuild aerobic base.");
  }

  return { lift, run };
}

// ── Main computation ─────────────────────────

export function computePerformanceIndex(
  currentWeek: WeeklyAggregates,
  priorWeeks: WeeklyAggregates[],
  profile: {
    weeklyWorkoutsTarget?: number;
    targetCalories?: number | null;
    targetProtein?: number | null;
  },
  previousWeekPI?: number,
): PerformanceDoc {
  const bl = computeBaseline(priorWeeks);

  const liftLoadScore = computeLiftLoadScore(currentWeek, bl);
  const runLoadScore = computeRunLoadScore(currentWeek, bl);
  const recoveryScore = computeRecoveryScore(currentWeek);
  const adherenceScore = computeAdherenceScore(
    currentWeek,
    profile.weeklyWorkoutsTarget || 4,
    profile.targetCalories ?? null,
    profile.targetProtein ?? null,
  );

  const loadScore = PI_WEIGHTS.liftInLoad * liftLoadScore + PI_WEIGHTS.runInLoad * runLoadScore;
  const pi = clamp(
    PI_WEIGHTS.load * loadScore + PI_WEIGHTS.recovery * recoveryScore + PI_WEIGHTS.adherence * adherenceScore,
  );

  const liftProgression = safeRatio(currentWeek.liftTonnage, bl.liftTonnage);
  const runVolume = safeRatio(currentWeek.runKm, bl.runKm);
  const confidence = computeConfidence(currentWeek, bl);
  const loadBand = computeLoadBand(pi);
  const deloadRecommended = shouldRecommendDeload(pi, recoveryScore, adherenceScore, previousWeekPI);

  const partial = {
    performanceIndex: pi,
    liftLoadScore,
    runLoadScore,
    recoveryScore,
    adherenceScore,
    liftProgression,
    runVolume,
    loadBand,
    deloadRecommended,
  };

  const insight = generateInsight(partial);
  const planAdjustments = generatePlanAdjustments(partial);

  return {
    weekKey: currentWeek.weekKey,
    computedAt: new Date().toISOString(),
    performanceIndex: pi,
    liftLoadScore,
    runLoadScore,
    recoveryScore,
    adherenceScore,
    liftProgression,
    runVolume,
    runPaceAdjustmentPct: 0, // placeholder
    confidence,
    loadBand,
    deloadRecommended,
    insight,
    planAdjustments,
    aggregates: currentWeek,
    baseline: bl,
  };
}