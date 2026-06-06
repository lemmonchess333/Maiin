/**
 * Performance Index scoring — admin-free pure mirror of the canonical client
 * engine `src/lib/performanceEngine.ts`.
 *
 * The single conceptual PI engine has two physical copies. This is the
 * server's. It is the AUTHORITATIVE copy — the weekly rollup / daily refresh
 * persist the PI users actually see (the client copy only drives previews).
 *
 * This file is PURE: no `firebase-admin`, no Firestore, no `require` of the
 * admin SDK. That is load-bearing — the cross-copy parity test
 * (`src/lib/__tests__/performanceEngineParity.cross.test.ts`) `require()`s this
 * module from the client Vitest suite, which has no admin init. Keep it pure so
 * that import can't explode.
 *
 * INVARIANT (mirror): `scorePerformance(agg, bl, profile, prevPI)` here MUST
 * return output identical to the TS `scorePerformance` for identical inputs.
 * The parity seam is the *post-baseline* scoring — each copy derives its own
 * baseline (client from priorWeeks[], server by aggregating a window) and then
 * calls this shared-shape scorer. The four goal-aware branches below
 * (recovery bodyweight thresholds, adherence calorie tolerance, lift/run load
 * weighting, default workouts target) are the ones that historically drifted
 * goal-blind on this copy — keep them in lockstep with the TS source.
 */

// ── Constants ────────────────────────────────

const PI_WEIGHTS = {
  load: 0.65,
  recovery: 0.25,
  adherence: 0.1,
  liftInLoad: 0.5,
  runInLoad: 0.5,
};

// ── Helpers ──────────────────────────────────

function clamp(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function safeRatio(current, baseline) {
  if (baseline <= 0) return current > 0 ? 1.0 : 0;
  return current / baseline;
}

// ── Sub-scores ───────────────────────────────

function computeLiftLoadScore(agg, bl) {
  if (agg.liftSessions === 0) return 0;
  const tonnageRatio = safeRatio(agg.liftTonnage, bl.liftTonnage);
  const hardSetRatio = safeRatio(agg.liftHardSets, bl.liftHardSets);
  const raw = tonnageRatio * 0.7 + hardSetRatio * 0.3;
  return clamp(raw * 67);
}

function computeRunLoadScore(agg, bl) {
  if (agg.runSessions === 0) return 0;
  const kmRatio = safeRatio(agg.runKm, bl.runKm);
  const longRatio = safeRatio(agg.runLongKm, bl.runLongKm);
  const qualityBonus = agg.runQualityCount > 0 ? 10 : 0;
  const raw = kmRatio * 0.6 + longRatio * 0.4;
  return clamp(raw * 67 + qualityBonus);
}

/**
 * Goal-aware recovery score. Cuts allow larger weight drops before penalising;
 * bulks allow moderate gain; recomp/unknown treat stability as the goal.
 * Mirrors src/lib/performanceEngine.ts computeRecoveryScore.
 */
function computeRecoveryScore(agg, goal) {
  let score = 60;

  if (agg.bwCurrent7dAvg != null && agg.bwPrevious7dAvg != null) {
    const rawDelta = agg.bwCurrent7dAvg - agg.bwPrevious7dAvg; // negative = loss
    const absDelta = Math.abs(rawDelta);

    if (goal === "cut") {
      if (rawDelta <= 0 && absDelta <= 1.0) score += 20;
      else if (rawDelta <= 0 && absDelta <= 2.0) score += 10;
      else if (rawDelta > 0 && absDelta <= 0.5) score += 10;
      else if (absDelta > 2.0) score -= 15;
    } else if (goal === "lean bulk") {
      if (rawDelta >= 0 && absDelta <= 0.5) score += 20;
      else if (rawDelta >= 0 && absDelta <= 1.0) score += 10;
      else if (rawDelta < 0 && absDelta <= 0.5) score += 10;
      else if (absDelta > 2.0) score -= 15;
    } else {
      if (absDelta <= 0.5) score += 20;
      else if (absDelta <= 1.0) score += 10;
      else if (absDelta > 2.0) score -= 15;
    }
  }

  if (agg.mealDaysLogged >= 5) score += 15;
  else if (agg.mealDaysLogged >= 3) score += 8;

  const totalSessions = agg.liftSessions + agg.runSessions;
  if (totalSessions > 8) score -= 10;
  else if (totalSessions >= 4 && totalSessions <= 6) score += 5;

  return clamp(score);
}

/**
 * Goal-aware adherence score. Cuts use a tighter calorie tolerance (±10%) since
 * overeating undermines the deficit; bulks/recomp are looser (±15%).
 * Mirrors src/lib/performanceEngine.ts computeAdherenceScore.
 */
function computeAdherenceScore(agg, targetWorkouts, targetCalories, targetProtein, goal) {
  let score = 0;
  let factors = 0;

  if (targetWorkouts > 0) {
    const totalSessions = agg.liftSessions + agg.runSessions;
    const ratio = Math.min(totalSessions / targetWorkouts, 1.2);
    score += ratio * 100;
    factors++;
  }

  if (targetCalories && agg.mealDaysLogged >= 3 && agg.avgDailyCalories > 0) {
    const calRatio = agg.avgDailyCalories / targetCalories;
    const tolerance = goal === "cut" ? 0.1 : 0.15;
    const calScore =
      calRatio >= 1 - tolerance && calRatio <= 1 + tolerance
        ? 100
        : Math.max(0, 100 - Math.abs(1 - calRatio) * 200);
    score += calScore;
    factors++;
  }

  if (targetProtein && agg.mealDaysLogged >= 3 && agg.avgDailyProtein > 0) {
    const protRatio = agg.avgDailyProtein / targetProtein;
    const protScore = protRatio >= 0.9 ? 100 : protRatio * 111;
    score += protScore;
    factors++;
  }

  return factors > 0 ? clamp(score / factors) : 50;
}

// ── Load band ────────────────────────────────

function computeLoadBand(pi) {
  if (pi >= 85) return "overreach";
  if (pi >= 70) return "high";
  if (pi >= 45) return "moderate";
  if (pi >= 25) return "low";
  return "deload";
}

// ── Deload recommendation ────────────────────

function shouldRecommendDeload(currentPI, recoveryScore, adherenceScore, previousWeekPI) {
  if (currentPI >= 80 && recoveryScore < 45) return true;
  if (currentPI >= 85 && previousWeekPI != null && previousWeekPI >= 85) return true;
  if (currentPI >= 70 && adherenceScore < 50) return true;
  return false;
}

// ── Insights ─────────────────────────────────

function generateInsight(doc) {
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

  let title;
  if (pi >= 75) title = "Momentum: High";
  else if (pi >= 45) title = "Momentum: Stable";
  else title = "Momentum: Low";

  const bullets = [];

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
    bullets.push("Recovery below baseline — sleep is the biggest lever.");
  }

  if (as_ < 50 && bullets.length < 3) {
    bullets.push("Consistency matters more than PRs this week.");
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

function generatePlanAdjustments(doc) {
  const lift = [];
  const run = [];

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

// ── Post-baseline scoring (the parity seam) ──

/**
 * Pure, deterministic scoring of a window aggregate against a normalised
 * baseline. Returns ONLY the scored fields — the caller assembles the full
 * persisted doc (weekKey, computedAt, confidence, aggregates, baseline,
 * signals). `confidence` is deliberately excluded: it is model-specific (the
 * client adds a recency check the server's rolling window doesn't need).
 *
 * @param {object} agg     window aggregate (lift/run/meal/bodyweight)
 * @param {object} bl       normalised baseline { liftTonnage, liftHardSets, runKm, runLongKm, weeksUsed }
 * @param {object} profile  { goal?, weeklyWorkoutsTarget?, targetCalories?, targetProtein? }
 * @param {number} [previousWeekPI]
 */
function scorePerformance(agg, bl, profile, previousWeekPI) {
  const goal = profile.goal;

  const targetWorkouts =
    profile.weeklyWorkoutsTarget ||
    (goal === "cut" ? 3 : goal === "lean bulk" ? 5 : 4);

  const liftLoadScore = computeLiftLoadScore(agg, bl);
  const runLoadScore = computeRunLoadScore(agg, bl);
  const recoveryScore = computeRecoveryScore(agg, goal);
  const adherenceScore = computeAdherenceScore(
    agg,
    targetWorkouts,
    profile.targetCalories != null ? profile.targetCalories : null,
    profile.targetProtein != null ? profile.targetProtein : null,
    goal
  );

  // Goal-dependent lift/run weighting within the load score.
  let liftW = PI_WEIGHTS.liftInLoad;
  let runW = PI_WEIGHTS.runInLoad;
  if (goal === "lean bulk") {
    liftW = 0.65;
    runW = 0.35;
  } else if (goal === "cut") {
    liftW = 0.6;
    runW = 0.4;
  }

  const loadScore = liftW * liftLoadScore + runW * runLoadScore;
  const pi = clamp(
    PI_WEIGHTS.load * loadScore +
      PI_WEIGHTS.recovery * recoveryScore +
      PI_WEIGHTS.adherence * adherenceScore
  );

  const liftProgression = safeRatio(agg.liftTonnage, bl.liftTonnage);
  const runVolume = safeRatio(agg.runKm, bl.runKm);
  const loadBand = computeLoadBand(pi);
  const deloadRecommended =
    bl.weeksUsed >= 3
      ? shouldRecommendDeload(pi, recoveryScore, adherenceScore, previousWeekPI)
      : false;

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

  return { ...partial, insight, planAdjustments };
}

module.exports = {
  PI_WEIGHTS,
  clamp,
  safeRatio,
  computeLiftLoadScore,
  computeRunLoadScore,
  computeRecoveryScore,
  computeAdherenceScore,
  computeLoadBand,
  shouldRecommendDeload,
  generateInsight,
  generatePlanAdjustments,
  scorePerformance,
};
