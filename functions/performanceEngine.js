/* ─────────────────────────────────────────────
Performance Engine — Server-side (Cloud Functions)

PI1a rewrite: was weekly-keyed, now rolling 7-day with 28-day baseline.
The CF runs on every workout/run write (filtered by isInRollingWindow)
plus a daily cron. Each compute writes a perf doc keyed by the compute
date (YYYY-MM-DD) — old weekly-aligned IDs and new date-aligned IDs
coexist in the collection until consumers stop reading the old ones.

Spec locked in plan rows PI1 + PI5. See programme-run-followups.md.
───────────────────────────────────────────── */

const admin = require("firebase-admin");

const db = admin.firestore();

// ── Constants ────────────────────────────────

const PI_WEIGHTS = {
  load: 0.65,
  recovery: 0.25,
  adherence: 0.1,
  liftInLoad: 0.5,
  runInLoad: 0.5,
};

/** Current rolling window length in days. */
const WINDOW_DAYS = 7;

/** Baseline window length in days. */
const BASELINE_DAYS = 28;

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

// ── Date helpers ─────────────────────────────

/**
 * Returns the compute key for a given date — the "end-of-window" date
 * in YYYY-MM-DD format. Used as the perf doc ID. No Sunday alignment.
 * Kept under the legacy `getWeekKey` export name for backwards-compat
 * with functions/index.js callers — semantics shifted from Sunday-of-
 * week to today's-compute-date per PI1a.
 */
function getComputeKey(date) {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

/** Legacy alias — getComputeKey is the canonical name post-PI1a. */
const getWeekKey = getComputeKey;

/** Get the YYYY-MM-DD date N days before a given compute key. */
function dateKeyMinusN(computeKey, n) {
  const d = new Date(computeKey + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split("T")[0];
}

/**
 * Current rolling window: [computeKey - (WINDOW_DAYS - 1), computeKey],
 * inclusive on both ends. Returned as Date objects spanning the full
 * day boundaries.
 */
function currentWindow(computeKey) {
  const endStr = dateKeyMinusN(computeKey, -1); // day AFTER computeKey at 00:00 = end exclusive
  const startStr = dateKeyMinusN(computeKey, WINDOW_DAYS - 1);
  const start = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  return { start, end };
}

/**
 * Baseline window: the BASELINE_DAYS immediately preceding the current
 * window. For computeKey=2026-05-19 with WINDOW_DAYS=7, BASELINE_DAYS=28,
 * baseline is [2026-04-15, 2026-05-12] inclusive.
 */
function baselineWindow(computeKey) {
  const baselineEndStr = dateKeyMinusN(computeKey, WINDOW_DAYS); // day BEFORE current window starts
  const baselineStartStr = dateKeyMinusN(
    computeKey,
    WINDOW_DAYS + BASELINE_DAYS - 1
  );
  const start = new Date(baselineStartStr + "T00:00:00Z");
  const end = new Date(baselineEndStr + "T00:00:00Z"); // exclusive — start of day baselineEndStr+1 minus one ms is ugly; using end-of-day below
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

/**
 * Trigger gate: returns true if `dateStr` (YYYY-MM-DD) falls within
 * the rolling window ending at `computeKey`. Used by onWorkoutCreated
 * / onRunCreated to skip recompute when a backdated entry is outside
 * the relevant 7-day window.
 */
function isInRollingWindow(dateStr, computeKey) {
  if (!dateStr) return false;
  const windowStartStr = dateKeyMinusN(computeKey, WINDOW_DAYS - 1);
  return dateStr >= windowStartStr && dateStr <= computeKey;
}

function clamp(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

function safeRatio(current, baseline) {
  // Zero baseline (cold-start: no 28-day history) → NEUTRAL 1.0, matching the
  // client engine (src/lib/performanceEngine.ts). Returning 1.2 here inflated
  // every cold-start ratio to "20% above baseline", pushing a brand-new user's
  // first-week PI into the overreach band off a baseline they don't have.
  if (baseline <= 0) return current > 0 ? 1.0 : 0;
  return current / baseline;
}

// ── Firestore data fetching ──────────────────

/**
 * Fetch all raw data for a user across a date window (covers both
 * current + baseline ranges in one query so we don't double-fetch).
 * Returns { workouts, runs, meals, bodyweightLogs } as arrays.
 */
async function fetchWindowData(uid, windowStart, windowEnd) {
  const userRef = db.collection("users").doc(uid);
  const startTs = admin.firestore.Timestamp.fromDate(windowStart);
  const endTs = admin.firestore.Timestamp.fromDate(windowEnd);

  const startStr = windowStart.toISOString().split("T")[0];
  const endStr = windowEnd.toISOString().split("T")[0];

  // The four queries are independent — fan out in parallel rather
  // than four serial round-trips. Pre-fix this added 4×RTT to every
  // performance recompute (onWorkoutCreated, onRunCreated, weekly
  // rollup, daily refresh — fired thousands of times per day at the
  // target user base).
  const [workoutsSnap, runsSnap, mealsResult, bwResult] = await Promise.all([
    userRef
      .collection("workouts")
      .where("date", ">=", startStr)
      .where("date", "<=", endStr)
      .get(),
    userRef
      .collection("runs")
      .where("completedAt", ">=", startTs)
      .where("completedAt", "<=", endTs)
      .get(),
    userRef
      .collection("meals")
      .where("date", ">=", startStr)
      .where("date", "<=", endStr)
      .get()
      .catch(() => null),
    userRef
      .collection("bodyweightLogs")
      .where("date", ">=", startStr)
      .where("date", "<=", endStr)
      .get()
      .catch(() => null),
  ]);

  const workouts = workoutsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Volume-eligibility filter mirrors src/lib/runStatsEligibility.ts
  // (functions/ is plain JS, no path alias for direct import).
  const runs = runsSnap.docs
    .filter((d) => {
      const data = d.data();
      if (data.isInvalid === true) return false;
      if (data.savedAnyway === true) return false;
      const distance = Number(data.distance) || 0;
      const duration = Number(data.duration) || 0;
      return distance >= 50 && duration >= 30;
    })
    .map((d) => ({ id: d.id, ...d.data() }));

  const meals = mealsResult
    ? mealsResult.docs.map((d) => ({ id: d.id, ...d.data() }))
    : [];
  const bodyweightLogs = bwResult
    ? bwResult.docs.map((d) => ({ id: d.id, ...d.data() }))
    : [];

  return { workouts, runs, meals, bodyweightLogs };
}

/**
 * Fetch lifetime aggregates + last-training timestamps via
 * Firestore aggregation queries. Wrapped in try/catch with
 * sensible fallbacks per PI3 amendment 1 — partial failure
 * shouldn't block the compute.
 */
async function fetchLifetimeData(uid) {
  const userRef = db.collection("users").doc(uid);
  const result = {
    lifetimeWorkoutCount: 0,
    lifetimeRunCount: 0,
    lastWorkoutDateStr: null, // "YYYY-MM-DD"
    lastRunCompletedAt: null, // Date
  };

  // Same parallelisation as fetchWindowData — four independent
  // aggregations / one-shot lookups should not be a serial 4×RTT
  // chain on every recompute. allSettled keeps partial-failure
  // semantics: each branch independently falls back to its default.
  const [workoutsCountRes, runsCountRes, lastWorkoutRes, lastRunRes] =
    await Promise.allSettled([
      userRef.collection("workouts").count().get(),
      userRef.collection("runs").count().get(),
      userRef.collection("workouts").orderBy("date", "desc").limit(1).get(),
      userRef.collection("runs").orderBy("completedAt", "desc").limit(1).get(),
    ]);

  if (workoutsCountRes.status === "fulfilled") {
    result.lifetimeWorkoutCount = workoutsCountRes.value.data().count;
  } else {
    console.warn("fetchLifetimeData: workouts count failed", {
      uid,
      message: workoutsCountRes.reason && workoutsCountRes.reason.message,
    });
  }

  if (runsCountRes.status === "fulfilled") {
    result.lifetimeRunCount = runsCountRes.value.data().count;
  } else {
    console.warn("fetchLifetimeData: runs count failed", {
      uid,
      message: runsCountRes.reason && runsCountRes.reason.message,
    });
  }

  if (lastWorkoutRes.status === "fulfilled" && !lastWorkoutRes.value.empty) {
    const d = lastWorkoutRes.value.docs[0].data();
    if (typeof d.date === "string") result.lastWorkoutDateStr = d.date;
  } else if (lastWorkoutRes.status === "rejected") {
    console.warn("fetchLifetimeData: last workout query failed", {
      uid,
      message: lastWorkoutRes.reason && lastWorkoutRes.reason.message,
    });
  }

  if (lastRunRes.status === "fulfilled" && !lastRunRes.value.empty) {
    const d = lastRunRes.value.docs[0].data();
    if (d.completedAt && d.completedAt.toDate)
      result.lastRunCompletedAt = d.completedAt.toDate();
  } else if (lastRunRes.status === "rejected") {
    console.warn("fetchLifetimeData: last run query failed", {
      uid,
      message: lastRunRes.reason && lastRunRes.reason.message,
    });
  }

  return result;
}

// ── Aggregation ──────────────────────────────

/**
 * Aggregate raw data within an arbitrary date window [start, end).
 * Returns same shape as the legacy weekly aggregate, plus the
 * inclusive day-count for downstream baseline normalisation.
 */
function aggregateWindow(start, end, workouts, runs, meals, bodyweightLogs) {
  // ── Lifting ──
  let liftTonnage = 0;
  let liftHardSets = 0;
  let liftSessions = 0;

  workouts.forEach((w) => {
    const d = new Date(w.date + "T00:00:00Z");
    if (d < start || d >= end) return;
    liftSessions++;
    (w.exercises || []).forEach((ex) => {
      const isCardio = (ex.category || "").toLowerCase() === "cardio";
      (ex.sets || []).forEach((set, idx) => {
        liftTonnage += (set.weightKg || 0) * (set.reps || 0);
        if (!isCardio && idx === (ex.sets || []).length - 1) {
          liftHardSets++;
        }
      });
    });
  });

  // ── Running ──
  let runKm = 0;
  let runLongKm = 0;
  let runQualityCount = 0;
  let runSessions = 0;

  runs.forEach((r) => {
    const d =
      r.completedAt && r.completedAt.toDate ? r.completedAt.toDate() : null;
    if (!d || d < start || d >= end) return;
    runSessions++;
    const km = (r.distance || 0) / 1000;
    runKm += km;
    if (km > runLongKm) runLongKm = km;
    const at = (r.activityType || "").toLowerCase();
    if (r.intervalData || at === "tempo" || at === "interval") {
      runQualityCount++;
    }
  });

  // ── Meals ──
  const mealDays = new Set();
  let totalCal = 0;
  let totalProt = 0;
  meals.forEach((m) => {
    const d = new Date((m.date || "") + "T00:00:00Z");
    if (d < start || d >= end) return;
    mealDays.add(m.date);
    totalCal += m.totalCalories || 0;
    totalProt += m.totalProtein || 0;
  });
  const mealDaysLogged = mealDays.size;

  // ── Bodyweight ──
  // Average over current window; previous window for delta is the same-length
  // window immediately preceding [start, end).
  const windowMs = end.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - windowMs);
  const bwCurrent = [];
  const bwPrev = [];

  bodyweightLogs.forEach((l) => {
    const d = new Date((l.date || "") + "T00:00:00Z");
    if (d >= start && d < end) bwCurrent.push(l.weight);
    else if (d >= prevStart && d < start) bwPrev.push(l.weight);
  });

  const avg = (arr) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Day count of window — used for baseline normalisation in
  // computeBaselineFromAgg(). end is exclusive so subtract.
  const dayCount = Math.round((end.getTime() - start.getTime()) / 86400000);

  return {
    liftTonnage,
    liftHardSets,
    liftSessions,
    runKm: Math.round(runKm * 10) / 10,
    runLongKm: Math.round(runLongKm * 10) / 10,
    runQualityCount,
    runSessions,
    mealDaysLogged,
    avgDailyCalories:
      mealDaysLogged > 0 ? Math.round(totalCal / mealDaysLogged) : 0,
    avgDailyProtein:
      mealDaysLogged > 0 ? Math.round(totalProt / mealDaysLogged) : 0,
    bwCurrent7dAvg: avg(bwCurrent),
    bwPrevious7dAvg: avg(bwPrev),
    dayCount,
  };
}

// ── Scoring ──

/**
 * Normalise a baseline aggregate (BASELINE_DAYS span) to a
 * "current-window equivalent" so ratios against the current
 * window aggregate are comparable. liftTonnage / hardSets / runKm
 * scale linearly; runLongKm (max over period) does NOT — keep as
 * the longest single run observed in the baseline period.
 */
function computeBaselineFromAgg(baselineAgg) {
  const days = baselineAgg.dayCount || BASELINE_DAYS;
  const scale = WINDOW_DAYS / days; // e.g. 7/28 = 0.25
  return {
    liftTonnage: baselineAgg.liftTonnage * scale,
    liftHardSets: baselineAgg.liftHardSets * scale,
    runKm: baselineAgg.runKm * scale,
    runLongKm: baselineAgg.runLongKm,
    weeksUsed: Math.max(0, Math.floor(days / WINDOW_DAYS)),
  };
}

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

function computeRecoveryScore(agg) {
  let score = 60;
  if (agg.bwCurrent7dAvg != null && agg.bwPrevious7dAvg != null) {
    const delta = Math.abs(agg.bwCurrent7dAvg - agg.bwPrevious7dAvg);
    if (delta <= 0.5) score += 20;
    else if (delta <= 1.0) score += 10;
    else if (delta > 2.0) score -= 15;
  }
  if (agg.mealDaysLogged >= 5) score += 15;
  else if (agg.mealDaysLogged >= 3) score += 8;
  const totalSessions = agg.liftSessions + agg.runSessions;
  if (totalSessions > 8) score -= 10;
  else if (totalSessions >= 4 && totalSessions <= 6) score += 5;
  return clamp(score);
}

function computeAdherenceScore(
  agg,
  targetWorkouts,
  targetCalories,
  targetProtein
) {
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
    const calScore =
      calRatio >= 0.85 && calRatio <= 1.15
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

function computeConfidence(agg, bl) {
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

function computeLoadBand(pi) {
  if (pi >= 85) return "overreach";
  if (pi >= 70) return "high";
  if (pi >= 45) return "moderate";
  if (pi >= 25) return "low";
  return "deload";
}

function shouldRecommendDeload(
  currentPI,
  recoveryScore,
  adherenceScore,
  previousComputePI
) {
  if (currentPI >= 80 && recoveryScore < 45) return true;
  // Sustained overreach: two consecutive full-window-separated computes in the
  // overreach band. Threshold is 85 to match the client engine (raised from 75;
  // see src/lib/performanceEngine.ts) — 75-84 for two weeks is high-but-fine.
  if (currentPI >= 85 && previousComputePI != null && previousComputePI >= 85)
    return true;
  if (currentPI >= 70 && adherenceScore < 50) return true;
  return false;
}

// ── Signals (PI1a addition) ───────────────────

/**
 * Build the `signals` field consumed by client-side getLine.
 * All thresholds match the spec in src/lib/performanceLine.ts so
 * the client mapping has the data it needs to fire data-rich copy.
 */
function computeSignals({
  liftLoadScore,
  runLoadScore,
  liftProgression,
  runVolume,
  recoveryScore,
  adherenceScore,
  deloadRecommended,
  lifetimeData,
  baselineDayCount,
  computeKey,
}) {
  const bothLoadsStrong = liftLoadScore >= 70 && runLoadScore >= 70;
  // liftProgression is a ratio (current / baseline-normalised). When > 1.0
  // the user is above baseline. We only emit ratios above a 5% threshold to
  // avoid noise — falsey 0 fall-through tells getLine to render generic.
  const liftAheadOfBaseline = liftProgression > 1.05 ? liftProgression - 1 : 0;
  const runAheadOfBaseline = runVolume > 1.05 ? runVolume - 1 : 0;

  // lifetimeWeeks: approximate via baseline coverage.
  // A user with 28+ days of activity history has lifetimeWeeks >= 4.
  // Below that, fall back to "weeks of perf data" via baselineDayCount.
  const lifetimeWeeks = Math.max(0, Math.floor(baselineDayCount / WINDOW_DAYS));

  // daysSinceLastTraining: max of (today - lastWorkout, today - lastRun),
  // clamped at 0. Uses the more recent of the two.
  const today = new Date(computeKey + "T00:00:00Z");
  let daysSinceLastTraining = Infinity;
  if (lifetimeData.lastWorkoutDateStr) {
    const last = new Date(lifetimeData.lastWorkoutDateStr + "T00:00:00Z");
    const days = Math.floor((today.getTime() - last.getTime()) / 86400000);
    if (days < daysSinceLastTraining) daysSinceLastTraining = days;
  }
  if (lifetimeData.lastRunCompletedAt) {
    const days = Math.floor(
      (today.getTime() - lifetimeData.lastRunCompletedAt.getTime()) / 86400000
    );
    if (days < daysSinceLastTraining) daysSinceLastTraining = days;
  }
  if (!Number.isFinite(daysSinceLastTraining)) daysSinceLastTraining = 0;
  daysSinceLastTraining = Math.max(0, daysSinceLastTraining);

  return {
    bothLoadsStrong,
    liftAheadOfBaseline: Math.round(liftAheadOfBaseline * 1000) / 1000, // 3 decimal places
    runAheadOfBaseline: Math.round(runAheadOfBaseline * 1000) / 1000,
    recoveryWeak: recoveryScore < 50,
    adherenceWeak: adherenceScore < 50,
    deloadFlag: deloadRecommended,
    lifetimeWeeks,
    daysSinceLastTraining,
  };
}

// ── Insights (unchanged from weekly engine) ──

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
  if (deloadRecommended)
    bullets.push(
      "Consider a deload week — sustained high load with limited recovery signals."
    );
  if (lls >= 70 && rls >= 70)
    bullets.push(
      "Both lifting and running loads are strong this week — solid hybrid output."
    );
  else if (lls >= 70 && rls < 40)
    bullets.push(
      "Lifting is on point but running volume is low. Add an easy run if schedule allows."
    );
  else if (rls >= 70 && lls < 40)
    bullets.push(
      "Running volume is great but lifting load dropped. Prioritise your next session."
    );
  if (rs < 50 && bullets.length < 3)
    bullets.push(
      "Recovery signals are low — check sleep, hydration, and nutrition consistency."
    );
  if (as_ < 50 && bullets.length < 3)
    bullets.push(
      "Adherence dipped — focus on showing up consistently over hitting PRs."
    );
  if (lp > 1.15 && bullets.length < 3)
    bullets.push(
      `Lifting tonnage is ${Math.round((lp - 1) * 100)}% above baseline — great progression.`
    );
  if (rv > 1.2 && bullets.length < 3)
    bullets.push(
      `Running volume ${Math.round((rv - 1) * 100)}% above baseline — watch for overuse.`
    );
  if (bullets.length === 0) {
    if (pi >= 45) bullets.push("Consistent week. Keep the rhythm going.");
    else
      bullets.push(
        "Light week — a good time to focus on mobility and recovery."
      );
  }
  return { title, bullets: bullets.slice(0, 3) };
}

function generatePlanAdjustments(doc) {
  const lift = [];
  const run = [];
  if (doc.deloadRecommended) {
    lift.push("Reduce working sets by 30–40% or drop accessory work.");
    run.push(
      "Cap runs at easy pace. Replace one session with active recovery."
    );
    return { lift, run };
  }
  if (doc.loadBand === "overreach") {
    lift.push("Maintain intensity but consider reducing total volume 10–15%.");
    run.push("Keep long run but drop one mid-week session if fatigued.");
  } else if (doc.loadBand === "low" || doc.loadBand === "deload") {
    if (doc.liftLoadScore < 30)
      lift.push(
        "Focus on progressive overload — small weight jumps or extra set."
      );
    if (doc.runLoadScore < 30)
      run.push("Add one easy 20-min run to rebuild aerobic base.");
  }
  return { lift, run };
}

// ── Main compute + write ─────────────────────

/**
 * Core engine: compute rolling-7-day PI for one user ending at a
 * given compute key (defaulting to today) and write to Firestore.
 *
 * Doc ID and weekKey field both use the compute date YYYY-MM-DD
 * (no Sunday alignment). Old weekly-aligned IDs (Sunday dates) and
 * new daily IDs coexist in the same collection during the PI1a
 * transition window.
 *
 * @param {string} uid
 * @param {string|null} computeKeyOverride — null → today
 * @returns {{ ok, weekKey, performanceIndex, confidence, loadBand }}
 */
async function computeAndWritePerformanceForUser(uid, computeKeyOverride) {
  try {
    const computeKey = computeKeyOverride || getComputeKey(new Date());

    // Fetch combined window covering baseline + current + bodyweight prev
    const { start: baselineStart } = baselineWindow(computeKey);
    const { end: currentEnd } = currentWindow(computeKey);

    // Pull profile + raw data + lifetime in parallel
    const [profileSnap, rawData, lifetimeData] = await Promise.all([
      db.collection("users").doc(uid).get(),
      fetchWindowData(uid, baselineStart, currentEnd),
      fetchLifetimeData(uid),
    ]);

    const profile = profileSnap.exists ? profileSnap.data() : {};
    const { workouts, runs, meals, bodyweightLogs } = rawData;

    // Aggregate current rolling window
    const { start: cStart, end: cEnd } = currentWindow(computeKey);
    const currentAgg = aggregateWindow(
      cStart,
      cEnd,
      workouts,
      runs,
      meals,
      bodyweightLogs
    );

    // Aggregate baseline window
    const { start: bStart, end: bEnd } = baselineWindow(computeKey);
    const baselineAgg = aggregateWindow(
      bStart,
      bEnd,
      workouts,
      runs,
      meals,
      bodyweightLogs
    );

    // Normalise baseline to a 7-day-equivalent for ratio comparisons
    const bl = computeBaselineFromAgg(baselineAgg);

    // Score
    const liftLoadScore = computeLiftLoadScore(currentAgg, bl);
    const runLoadScore = computeRunLoadScore(currentAgg, bl);
    const recoveryScore = computeRecoveryScore(currentAgg);
    const adherenceScore = computeAdherenceScore(
      currentAgg,
      profile.weeklyWorkoutsTarget || 4,
      profile.targetCalories || null,
      profile.targetProtein || null
    );

    const loadScore =
      PI_WEIGHTS.liftInLoad * liftLoadScore +
      PI_WEIGHTS.runInLoad * runLoadScore;
    const pi = clamp(
      PI_WEIGHTS.load * loadScore +
        PI_WEIGHTS.recovery * recoveryScore +
        PI_WEIGHTS.adherence * adherenceScore
    );

    const liftProgression = safeRatio(currentAgg.liftTonnage, bl.liftTonnage);
    const runVolume = safeRatio(currentAgg.runKm, bl.runKm);
    const confidence = computeConfidence(currentAgg, bl);
    const loadBand = computeLoadBand(pi);

    // Previous compute's PI — sliding window: 7 days back is the
    // "full window separation" comparison; using 1 day back would
    // compare against a window that shares 6/7 days with the current
    // one, weakening the signal.
    let previousComputePI = null;
    try {
      const prevKey = dateKeyMinusN(computeKey, WINDOW_DAYS);
      const prevDoc = await db
        .collection("users")
        .doc(uid)
        .collection("performance")
        .doc(prevKey)
        .get();
      if (prevDoc.exists) previousComputePI = prevDoc.data().performanceIndex;
    } catch (_) {
      /* no previous doc, that's fine */
    }

    // Gate on baseline sufficiency, matching the client engine: a deload
    // recommendation off an unreliable (<3-week) baseline is noise, and
    // combined with cold-start ratios it would nag brand-new users to deload.
    const deloadRecommended =
      bl.weeksUsed >= 3
        ? shouldRecommendDeload(
            pi,
            recoveryScore,
            adherenceScore,
            previousComputePI
          )
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

    // PI1a signals — fed into client getLine() via the perf doc
    const signals = computeSignals({
      liftLoadScore,
      runLoadScore,
      liftProgression,
      runVolume,
      recoveryScore,
      adherenceScore,
      deloadRecommended,
      lifetimeData,
      baselineDayCount: baselineAgg.dayCount,
      computeKey,
    });

    const perfDoc = {
      weekKey: computeKey, // semantics shifted PI1a — "compute date" not "week-start"
      computedAt: new Date().toISOString(),
      performanceIndex: pi,
      liftLoadScore,
      runLoadScore,
      recoveryScore,
      adherenceScore,
      liftProgression,
      runVolume,
      runPaceAdjustmentPct: 0,
      confidence,
      loadBand,
      deloadRecommended,
      insight,
      planAdjustments,
      aggregates: currentAgg,
      baseline: bl,
      signals,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db
      .collection("users")
      .doc(uid)
      .collection("performance")
      .doc(computeKey)
      .set(perfDoc, { merge: true });

    return {
      ok: true,
      weekKey: computeKey,
      performanceIndex: pi,
      confidence,
      loadBand,
    };
  } catch (error) {
    console.error("computeAndWritePerformanceForUser error:", {
      uid,
      computeKeyOverride,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

// ── Cooldown lock ────────────────────────────

/**
 * Check and acquire a cooldown lock. Returns true if compute should proceed.
 * Simple timestamp check — no transactions needed at this scale.
 */
async function acquireCooldownLock(uid) {
  try {
    const lockRef = db
      .collection("users")
      .doc(uid)
      .collection("_engine")
      .doc("performanceLock");
    const lockSnap = await lockRef.get();

    if (lockSnap.exists) {
      const data = lockSnap.data();
      const nextAllowed =
        data.nextAllowedAt && data.nextAllowedAt.toDate
          ? data.nextAllowedAt.toDate()
          : new Date(0);
      if (new Date() < nextAllowed) {
        return false;
      }
    }

    await lockRef.set(
      {
        inProgress: true,
        nextAllowedAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + COOLDOWN_MS)
        ),
        lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return true;
  } catch (error) {
    console.error("acquireCooldownLock error:", {
      uid,
      message: error.message,
      stack: error.stack,
    });
    throw error;
  }
}

async function releaseLock(uid, ok, error) {
  const lockRef = db
    .collection("users")
    .doc(uid)
    .collection("_engine")
    .doc("performanceLock");
  await lockRef.set(
    {
      inProgress: false,
      lastRunOk: ok,
      lastError: error || null,
    },
    { merge: true }
  );
}

// ── Exports ──────────────────────────────────

module.exports = {
  computeAndWritePerformanceForUser,
  acquireCooldownLock,
  releaseLock,
  getComputeKey,
  getWeekKey, // legacy alias
  isInRollingWindow,
  COOLDOWN_MS,
  // Pure helpers exposed for unit testing
  _internal: {
    dateKeyMinusN,
    currentWindow,
    baselineWindow,
    aggregateWindow,
    computeBaselineFromAgg,
    computeLiftLoadScore,
    computeRunLoadScore,
    computeRecoveryScore,
    computeAdherenceScore,
    computeConfidence,
    computeLoadBand,
    shouldRecommendDeload,
    computeSignals,
    clamp,
    safeRatio,
    WINDOW_DAYS,
    BASELINE_DAYS,
  },
};
