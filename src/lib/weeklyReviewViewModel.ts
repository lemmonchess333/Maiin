/**
 * Weekly Review view-model (Rev1 lock, plan file).
 *
 * Pure assembly of the Sunday recap from data the app already stores —
 * no engine re-runs, no server materialization, no new storage. The lock's
 * behavioural rules ALL live here so they're unit-testable:
 *
 *  - Sunday-start local weeks (the performance engine's convention —
 *    `localWeekKey`); the review covers the last COMPLETED Sun–Sat week.
 *  - Eligibility: renders only when the reviewed week has ≥1 DELIBERATE
 *    event (workout / run / meal / weigh-in — never passive data). A fully
 *    quiet week renders the gentle "quiet" variant ONLY for established
 *    users; brand-new users get nothing (never a guilt screen).
 *  - Headline PI collapses for zero-training weeks (no garbage PI on a
 *    one-meal first week); the delta renders only when the PREVIOUS week
 *    also has a PI (no "+41" return-from-vacation spikes); the verdict is
 *    TEMPLATED from the engine's band/deload flags (no AI) and a PI drop
 *    is never negative-framed in a detected deload week.
 *  - Planned-vs-done comparisons render only when a plan exists (Run9a
 *    freeform substrate has no planned km → done-only framing).
 *  - Run stats count only runs passing the standard eligibility predicate
 *    (isVolumeEligible); any run DOC still counts toward eligibility (a
 *    discarded run is still a deliberate act).
 *  - Body section reuses the SAME trend/projection maths as the Progress
 *    chart (calculateEMA / projectGoalDate — extracted, not re-derived)
 *    and respects hideWeightNumber (direction-only, no figures).
 *
 * The data-fetching lives in useWeeklyReview; this module never touches
 * Firestore or React.
 */

import {
  calculateEMA,
  deriveGoalWeightKg,
  projectGoalDate,
} from "@/utils/weightTrend";
import { computeDataConfidence } from "@/lib/dataConfidence";
import { parseLocalDate, localDateString } from "@/lib/dateHelpers";

/* ── Week bounds ──────────────────────────────────────────────── */

/** Sunday "YYYY-MM-DD" → { start, end } local-date strings (Sun..Sat). */
export function weekBounds(weekKey: string): { start: string; end: string } {
  const start = parseLocalDate(weekKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: weekKey, end: localDateString(end) };
}

/** Is a local "YYYY-MM-DD" date inside the week? (ISO strings compare lexically.) */
export function inWeek(date: string, weekKey: string): boolean {
  const { start, end } = weekBounds(weekKey);
  return date >= start && date <= end;
}


/** "22–28 Jun" / "28 Jun – 4 Jul" — explicit range label (Rev1: the header
 *  always names its window, killing "my fresh Sunday run isn't in it"). */
export function formatWeekRange(start: string, end: string): string {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short" });
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()}–${e.getDate()} ${month(e)}`;
  }
  return `${s.getDate()} ${month(s)} – ${e.getDate()} ${month(e)}`;
}

/* ── Inputs ───────────────────────────────────────────────────── */

export interface ReviewWorkout {
  date: string; // local "YYYY-MM-DD"
  tonnageKg: number;
}

export interface ReviewRun {
  date: string; // local "YYYY-MM-DD"
  distanceMeters: number;
  /** isVolumeEligible(run) — computed by the data layer. */
  eligible: boolean;
}

export interface ReviewMealDay {
  date: string;
  calories: number;
}

export interface ReviewPerfWeek {
  pi: number;
  loadBand: string | null;
  deloadRecommended: boolean;
}

export interface WeekAheadPlan {
  lifts: number | null;
  runs: number | null;
  /** e.g. "Race prep — build week 3 of 6"; null when freeform. */
  phaseNote: string | null;
}

export interface WeeklyReviewData {
  /** Sunday key of the REVIEWED (last completed) week. */
  weekKey: string;
  /** Week-scoped rows (the view-model re-filters defensively). */
  workouts: ReviewWorkout[];
  runs: ReviewRun[];
  mealDays: ReviewMealDay[];
  /** Full available weigh-in history up to the review moment (asc or desc). */
  weighIns: { date: string; weight: number }[];
  /** PRs fired inside the week (data layer via prTracking); null = unknown. */
  prsHit: number | null;
  perf: ReviewPerfWeek | null;
  prevPi: number | null;
  plannedLifts: number | null;
  /** Planned eligible-run count for the reviewed week; null when freeform. */
  plannedRuns: number | null;
  calorieTarget: number | null;
  adaptiveRetunedInWeek: boolean;
  hideWeightNumber: boolean;
  /** Any deliberate event exists BEFORE the reviewed week (quiet-week gate). */
  established: boolean;
  weekAhead: WeekAheadPlan;
  goalProgram:
    | { startWeight?: number | null; goal?: string | null }
    | null
    | undefined;
  /** Injected clock (projection labels); defaults to now. */
  now?: Date;
}

/* ── Output ───────────────────────────────────────────────────── */

export interface WeeklyReview {
  kind: "normal" | "quiet";
  weekKey: string;
  /** Local-date bounds for the header range label. */
  range: { start: string; end: string };
  headline: {
    pi: number;
    /** Display delta — null when prior week has no PI OR suppressed (deload drop). */
    delta: number | null;
    verdict: string;
    deload: boolean;
  } | null;
  training: {
    lifts: { done: number; planned: number | null; tonnageKg: number } | null;
    runs: {
      count: number;
      km: number;
      longestKm: number | null;
      planned: number | null;
    } | null;
    prsHit: number | null;
  } | null;
  nutrition: {
    daysLogged: number;
    avgCalories: number;
    target: number | null;
    retuned: boolean;
  } | null;
  body: {
    hidden: boolean;
    /** Trend movement across the week, kg (rounded 0.1); null when hidden. */
    deltaKg: number | null;
    direction: "down" | "up" | "stable";
    /** "on pace for goal by <date>" label; null when suppressed. */
    projectionDate: string | null;
  } | null;
  weekAhead: WeekAheadPlan;
}

/* ── WeekPulse ("Your week so far" — Rev1 PR2) ────────────────── */

export interface WeekPulse {
  lifts: { done: number; planned: number | null } | null;
  runs: { count: number; km: number; planned: number | null } | null;
  /** Current streak in days; null hides the line (0-day = nothing to say). */
  streak: number | null;
}

/**
 * Live mid-week counterpart of the review's training section, shown on
 * the two completion screens. Same rules as the review: eligible runs
 * only, planned comparisons only when a plan exists (Run9a freeform →
 * done-only), Sunday-start weeks. NO PI claims — the index recomputes
 * async server-side after a save, so an instant delta would be a guess.
 * Returns null when there is nothing to say (no lanes at all).
 */
export function buildWeekPulse(args: {
  weekKey: string;
  workouts: { date: string }[];
  runs: ReviewRun[];
  plannedLifts: number | null;
  plannedRuns: number | null;
  streak: number;
}): WeekPulse | null {
  const workouts = args.workouts.filter((w) => inWeek(w.date, args.weekKey));
  const eligibleRuns = args.runs.filter(
    (r) => r.eligible && inWeek(r.date, args.weekKey)
  );

  const lifts =
    workouts.length > 0 || args.plannedLifts !== null
      ? { done: workouts.length, planned: args.plannedLifts }
      : null;
  const runs =
    eligibleRuns.length > 0 || args.plannedRuns !== null
      ? {
          count: eligibleRuns.length,
          km:
            Math.round(
              (eligibleRuns.reduce((s, r) => s + r.distanceMeters, 0) / 1000) *
                10
            ) / 10,
          planned: args.plannedRuns,
        }
      : null;

  if (!lifts && !runs) return null;
  return { lifts, runs, streak: args.streak > 0 ? args.streak : null };
}

/* ── Verdict templates (no AI — engine flags only) ────────────── */

export function verdictFor(args: {
  delta: number | null;
  loadBand: string | null;
  deloadRecommended: boolean;
}): string {
  const { delta, loadBand, deloadRecommended } = args;
  if (deloadRecommended || loadBand === "deload") {
    return "A lighter week by design — recovery is part of the plan.";
  }
  if (loadBand === "overreach") {
    return "A big week. Keep an eye on recovery going into this one.";
  }
  if (loadBand === "high") {
    return "Strong week — training load ran high.";
  }
  if (delta !== null && delta >= 5) return "Momentum's building.";
  if (delta !== null && delta <= -5) {
    return "A softer week — this week's plan resets the rhythm.";
  }
  return "Steady week.";
}

/* ── Assembly ─────────────────────────────────────────────────── */

export function buildWeeklyReview(
  data: WeeklyReviewData
): WeeklyReview | null {
  const { weekKey } = data;
  const range = weekBounds(weekKey);

  // Defensive re-filter to the week (the data layer already scopes,
  // but the rules below must hold regardless of caller discipline).
  const workouts = data.workouts.filter((w) => inWeek(w.date, weekKey));
  const runs = data.runs.filter((r) => inWeek(r.date, weekKey));
  const mealDays = data.mealDays.filter((m) => inWeek(m.date, weekKey));
  const weighInsAsc = [...data.weighIns].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const weekWeighIns = weighInsAsc.filter((w) => inWeek(w.date, weekKey));

  // Eligibility: any DELIBERATE act. Any run doc counts (a discarded
  // invalid run is still the user acting); stats below use eligible only.
  const deliberateEvents =
    workouts.length + runs.length + mealDays.length + weekWeighIns.length;

  if (deliberateEvents === 0) {
    if (!data.established) return null; // brand-new user → silence
    return {
      kind: "quiet",
      weekKey,
      range,
      headline: null,
      training: null,
      nutrition: null,
      body: null,
      weekAhead: data.weekAhead,
    };
  }

  /* Headline — collapses entirely for zero-training weeks so a
     one-meal first week never leads with a garbage PI. */
  const trainedThisWeek = workouts.length > 0 || runs.some((r) => r.eligible);
  let headline: WeeklyReview["headline"] = null;
  if (trainedThisWeek && data.perf) {
    const deload =
      data.perf.deloadRecommended || data.perf.loadBand === "deload";
    const rawDelta =
      data.prevPi !== null ? Math.round(data.perf.pi - data.prevPi) : null;
    // Deload weeks: a PI drop is by design — never framed as a loss.
    const delta = deload && rawDelta !== null && rawDelta < 0 ? null : rawDelta;
    headline = {
      pi: Math.round(data.perf.pi),
      delta,
      deload,
      verdict: verdictFor({
        delta: rawDelta,
        loadBand: data.perf.loadBand,
        deloadRecommended: data.perf.deloadRecommended,
      }),
    };
  }

  /* Training — lanes collapse independently; planned comparisons only
     when a plan exists (freeform → done-only framing). */
  const eligibleRuns = runs.filter((r) => r.eligible);
  const runKm = eligibleRuns.reduce((s, r) => s + r.distanceMeters, 0) / 1000;
  const longestKm = eligibleRuns.length
    ? Math.max(...eligibleRuns.map((r) => r.distanceMeters)) / 1000
    : null;
  const liftLane =
    workouts.length > 0
      ? {
          done: workouts.length,
          planned: data.plannedLifts,
          tonnageKg: Math.round(
            workouts.reduce((s, w) => s + w.tonnageKg, 0)
          ),
        }
      : null;
  const runLane =
    eligibleRuns.length > 0
      ? {
          count: eligibleRuns.length,
          km: Math.round(runKm * 10) / 10,
          longestKm:
            longestKm !== null ? Math.round(longestKm * 10) / 10 : null,
          planned: data.plannedRuns,
        }
      : null;
  const training =
    liftLane || runLane
      ? { lifts: liftLane, runs: runLane, prsHit: data.prsHit }
      : null;

  /* Nutrition — adherence-neutral: days logged + average, never a
     per-day judgement. Collapses when nothing was logged. */
  const nutrition =
    mealDays.length > 0
      ? {
          daysLogged: mealDays.length,
          avgCalories: Math.round(
            mealDays.reduce((s, m) => s + m.calories, 0) / mealDays.length
          ),
          target: data.calorieTarget,
          retuned: data.adaptiveRetunedInWeek,
        }
      : null;

  /* Body — needs a weigh-in IN the week plus enough history for the
     EMA to mean something. Reuses the Progress chart's exact trend +
     projection maths (including its honest self-suppression). */
  let body: WeeklyReview["body"] = null;
  if (weekWeighIns.length > 0 && weighInsAsc.length >= 3) {
    const upToWeekEnd = weighInsAsc.filter((w) => w.date <= range.end);
    const series = calculateEMA(upToWeekEnd);
    const last = series[series.length - 1];
    const beforeWeek = [...series]
      .reverse()
      .find((p) => p.date < range.start);
    const baseline = beforeWeek ?? series[0];
    const deltaKg = Math.round((last.trend - baseline.trend) * 10) / 10;
    const direction =
      Math.abs(deltaKg) < 0.1 ? "stable" : deltaKg > 0 ? "up" : "down";

    const firstDate = new Date(series[0].date);
    const lastDate = new Date(last.date);
    const daysSpan =
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
    const confidence = computeDataConfidence({
      pointsInWindow: series.length,
      pointsInPriorWindow: 0,
      windowDays: daysSpan,
    });
    const projection = projectGoalDate({
      trendSeries: series,
      goalWeight: deriveGoalWeightKg(data.goalProgram),
      hasProjection: confidence.hasProjection,
      now: data.now,
    });

    body = {
      hidden: data.hideWeightNumber,
      deltaKg: data.hideWeightNumber ? null : deltaKg,
      direction,
      projectionDate: projection?.date ?? null,
    };
  }

  return {
    kind: "normal",
    weekKey,
    range,
    headline,
    training,
    nutrition,
    body,
    weekAhead: data.weekAhead,
  };
}
