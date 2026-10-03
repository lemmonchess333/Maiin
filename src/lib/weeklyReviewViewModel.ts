/**
 * Weekly Review view-model (Rev1 lock, plan file).
 *
 * Pure assembly of the Sunday recap from data the app already stores —
 * no engine re-runs, no server materialization, no new storage. The lock's
 * behavioural rules ALL live here so they're unit-testable:
 *
 *  - Monday-start local weeks (the performance engine's convention —
 *    `localWeekKey`); the review covers the last COMPLETED Mon–Sun week.
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
  userGoalWeightKg,
  projectGoalDate,
} from "@/utils/weightTrend";
import { computeDataConfidence } from "@/lib/dataConfidence";
import type { TrainingWeek } from "@/lib/trainingWeek";
import { parseLocalDate, localDateString } from "@/lib/dateHelpers";

/* ── Week bounds ──────────────────────────────────────────────── */

/** Week-start "YYYY-MM-DD" → { start, end } local-date strings, the
 *  seven-day span it opens. Anchor-agnostic: it adds six days to
 *  whatever first day it is handed. */
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

/** One new best: the set, and the best it beat. */
export interface WeekBest {
  /** The library id, for the drawing; null for a custom exercise. */
  exerciseId: string | null;
  exerciseName: string;
  weight: number;
  reps: number;
  /** Local "YYYY-MM-DD" of the session that set it. */
  date: string;
  previous: { weight: number; reps: number; date: string } | null;
}

export interface WeeklyReviewData {
  /** Monday key of the REVIEWED (last completed) week. */
  weekKey: string;
  /** Week-scoped rows (the view-model re-filters defensively). */
  workouts: ReviewWorkout[];
  runs: ReviewRun[];
  mealDays: ReviewMealDay[];
  /** Full available weigh-in history up to the review moment (asc or desc). */
  weighIns: { date: string; weight: number }[];
  /**
   * New bests set inside the week, one per exercise and rep range (data
   * layer via prTracking); null = unknown.
   */
  prsHit: number | null;
  /** The week's biggest new best, for the recap's Best moment card. */
  bestMoment?: WeekBest | null;
  perf: ReviewPerfWeek | null;
  prevPi: number | null;
  /**
   * The reviewed week's counts (`trainingWeek`), done and planned, as Home
   * and the finish screens count them.
   */
  week: Pick<TrainingWeek, "lifts" | "runs">;
  /** The day the account began ("yyyy-MM-dd"): a week it began inside
   *  is reviewed from that day (startDay.ts). */
  startKey?: string | null;
  calorieTarget: number | null;
  adaptiveRetunedInWeek: boolean;
  hideWeightNumber: boolean;
  /** Any deliberate event exists BEFORE the reviewed week (quiet-week gate). */
  established: boolean;
  weekAhead: WeekAheadPlan;
  /** The goal the user set, for the projection (`userGoalWeightKg`). */
  goalProfile:
    | {
        goalWeightKg?: number | null;
        weeklyRateKg?: number | null;
        program?: { goal?: string } | null;
      }
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
  /** The week the account began in, reviewed from that day: its first
   *  day and how many days it had. Null for any later week. */
  firstDays: { start: string; count: number } | null;
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
    /** The week's biggest new best; null when none fired. */
    best: WeekBest | null;
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
 * the two completion screens, from the same week counts as the review and
 * Home (`trainingWeek`): runs that count, planned comparisons only when the
 * plan has runs this week (a free runner's week is done-only, Run9a),
 * Monday-start weeks. NO PI claims — the index recomputes async
 * server-side after a save, so an instant delta would be a guess.
 * Returns null when there is nothing to say (no lanes at all).
 */
export function buildWeekPulse(args: {
  week: Pick<TrainingWeek, "lifts" | "runs">;
  streak: number;
  /**
   * Sessions finished but NOT yet persisted, counted into `done`.
   *
   * The completion screens mount this card BEFORE dispatching their save —
   * and the lift screen unmounts as soon as the save resolves, so no
   * post-save refetch can ever be seen there. Without this the card told a
   * user who had just finished their first session of the week "0 of 6
   * lifts", which reads as though the session did not count.
   */
  pendingLifts?: number;
}): WeekPulse | null {
  const { week } = args;
  const liftsDone = week.lifts.done + Math.max(0, args.pendingLifts ?? 0);
  const lifts =
    liftsDone > 0 || week.lifts.planned !== null
      ? { done: liftsDone, planned: week.lifts.planned }
      : null;
  const runs =
    week.runs.done > 0 || week.runs.planned !== null
      ? {
          count: week.runs.done,
          km: week.runs.km,
          planned: week.runs.planned,
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
  /* These two flags mean DIFFERENT things. One sentence covered both —
     "A lighter week by design — recovery is part of the plan." — and it
     was wrong for each of them, in opposite directions.

     `deloadRecommended` is the engine's FORWARD-looking advice, and it
     fires on the opposite of a light week: its own insight bullet reads
     "Consider a deload week — sustained HIGH load with limited recovery
     signals", and its plan adjustment is "Reduce working sets by
     30-40%". Rendering it as a past-tense description told a user who
     had just trained hard that last week was light.

     `loadBand === "deload"` is `computeLoadBand(pi)` for pi < 25 — a
     week with almost no training. Calling that "by design" asserts an
     intention the app cannot know: the same band is produced by a
     planned deload and by a week the user missed.

     Seen together on one screen: a captured Weekly Review showed PI 92
     with a +2 delta and "2 of 6 lifts", under "A lighter week by
     design". 92 is the TOP band, 2 of 6 is a missed week, and the
     sentence claimed both were intended.

     Neither replacement claims intent. The delta suppression below is
     untouched — not framing a PI drop as a loss is a kindness the Rev1
     lock decided on, and it is a choice about emphasis rather than a
     claim about why. */
  if (deloadRecommended) {
    return "Load has run high — this is a good week to ease off.";
  }
  if (loadBand === "deload") {
    return "A light week — the plan picks up from here.";
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

export function buildWeeklyReview(data: WeeklyReviewData): WeeklyReview | null {
  const { weekKey } = data;
  const range = weekBounds(weekKey);
  const firstDays =
    data.startKey && data.startKey > range.start && data.startKey <= range.end
      ? {
          start: data.startKey,
          count:
            Math.round(
              (parseLocalDate(range.end).getTime() -
                parseLocalDate(data.startKey).getTime()) /
                86_400_000
            ) + 1,
        }
      : null;

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
      firstDays,
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
      // A first week has nothing before it to be steady against.
      verdict: firstDays
        ? "Your first score. It settles over the next few weeks."
        : verdictFor({
            delta: rawDelta,
            loadBand: data.perf.loadBand,
            deloadRecommended: data.perf.deloadRecommended,
          }),
    };
  }

  /* Training — lanes collapse independently. The counts are the week's
     (`trainingWeek`): runs that count, planned comparisons only when the
     plan had runs that week (freeform → done-only framing). The longest
     run is one of the runs that count. */
  const { week } = data;
  const eligibleRuns = runs.filter((r) => r.eligible);
  const longestKm = eligibleRuns.length
    ? Math.max(...eligibleRuns.map((r) => r.distanceMeters)) / 1000
    : null;
  const liftLane =
    week.lifts.done > 0
      ? {
          done: week.lifts.done,
          planned: week.lifts.planned,
          tonnageKg: Math.round(workouts.reduce((s, w) => s + w.tonnageKg, 0)),
        }
      : null;
  const runLane =
    week.runs.done > 0
      ? {
          count: week.runs.done,
          km: week.runs.km,
          longestKm:
            longestKm !== null ? Math.round(longestKm * 10) / 10 : null,
          planned: week.runs.planned,
        }
      : null;
  const training =
    liftLane || runLane
      ? {
          lifts: liftLane,
          runs: runLane,
          prsHit: data.prsHit,
          best: data.bestMoment ?? null,
        }
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
    const beforeWeek = [...series].reverse().find((p) => p.date < range.start);
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
      goalWeight: userGoalWeightKg(data.goalProfile),
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
    firstDays,
    headline,
    training,
    nutrition,
    body,
    weekAhead: data.weekAhead,
  };
}
