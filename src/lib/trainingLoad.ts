/**
 * Training load curve — daily fitness / fatigue / form spanning BOTH
 * disciplines (competitive teardown #4: Strava's Fitness & Freshness is the
 * analytics feature serious athletes screenshot; a run+lift version is the
 * differentiator nobody else offers).
 *
 * Model: Banister-style impulse-response over a daily load series.
 *  - fitness = slow EWMA of daily load (42-day time constant — chronic load)
 *  - fatigue = fast EWMA of daily load (7-day time constant — acute load)
 *  - form    = fitness − fatigue (fresh when positive, buried when negative)
 *
 * Load unit is EFFORT-WEIGHTED TRAINING MINUTES — deliberately, so run and
 * lift compose on one axis without pretending we have HR-based TRIMP:
 *  - run  = moving minutes, ×1.3 for quality sessions (tempo/intervals/race)
 *  - lift = session minutes (fallback: 3 min per logged set when the session
 *    has no duration)
 * The curve is self-referential (your fitness vs YOUR history), so the unit
 * only needs internal consistency — the same reasoning the performance
 * engine's baseline-relative load bands use. Intensity beyond the quality
 * flag is out of scope for v1 (no HR stream yet).
 *
 * Dates are LOCAL day keys end-to-end (YYYY-MM-DD via localDateString) —
 * never mix UTC into day bucketing (recurring-mistake rule).
 *
 * Pure + mirror-ready: no React, no Firebase, no clock reads — callers pass
 * the end day explicitly.
 */

import { localDateString } from "./dateHelpers";

export interface TrainingSession {
  /** Local day key (YYYY-MM-DD). */
  dateKey: string;
  discipline: "run" | "lift";
  /** Session length in minutes (already resolved by the caller). */
  minutes: number;
  /** Run quality flag — tempo / intervals / race sessions weigh heavier. */
  quality?: boolean;
}

export interface LoadPoint {
  dateKey: string;
  /** Combined day load (effort-weighted minutes). */
  load: number;
  runLoad: number;
  liftLoad: number;
  fitness: number;
  fatigue: number;
  /** fitness − fatigue: positive = fresh, negative = carrying fatigue. */
  form: number;
}

export const FITNESS_TC_DAYS = 42;
export const FATIGUE_TC_DAYS = 7;
export const QUALITY_RUN_FACTOR = 1.3;
/** Fallback lift minutes per logged set when a session has no duration. */
export const MINUTES_PER_SET = 3;

/** One session's contribution to its day's load. */
export function sessionLoad(s: TrainingSession): number {
  const base = Math.max(0, s.minutes);
  return s.discipline === "run" && s.quality ? base * QUALITY_RUN_FACTOR : base;
}

/** EWMA step factor for a time constant: k = 1 − e^(−1/tc). */
function ewmaK(tcDays: number): number {
  return 1 - Math.exp(-1 / tcDays);
}

/**
 * The daily curve for the `days` local days ending at `endDateKey`
 * (inclusive). Sessions BEFORE the window still shape the state — pass
 * warmup history (≥ ~60 days) so fitness doesn't ramp from a cold zero at
 * the window edge; the EWMAs integrate everything from the earliest
 * session forward.
 */
export function loadCurve(
  sessions: TrainingSession[],
  opts: { endDateKey: string; days: number }
): LoadPoint[] {
  const kFit = ewmaK(FITNESS_TC_DAYS);
  const kFat = ewmaK(FATIGUE_TC_DAYS);

  // Per-day discipline loads.
  const byDay = new Map<string, { run: number; lift: number }>();
  let earliest: string | null = null;
  for (const s of sessions) {
    if (!s.dateKey || s.dateKey > opts.endDateKey) continue;
    const entry = byDay.get(s.dateKey) ?? { run: 0, lift: 0 };
    entry[s.discipline] += sessionLoad(s);
    byDay.set(s.dateKey, entry);
    if (!earliest || s.dateKey < earliest) earliest = s.dateKey;
  }

  // Walk local days from the earliest session (or the window start when
  // there's no earlier history) through the window end, integrating the
  // EWMAs; emit only the requested window. Noon-anchored Date stepping
  // dodges DST edges.
  const end = parseLocal(opts.endDateKey);
  const windowStart = new Date(end);
  windowStart.setDate(windowStart.getDate() - (opts.days - 1));
  const start =
    earliest && parseLocal(earliest) < windowStart
      ? parseLocal(earliest)
      : windowStart;

  const points: LoadPoint[] = [];
  let fitness = 0;
  let fatigue = 0;
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateKey = localDateString(d);
    const day = byDay.get(dateKey) ?? { run: 0, lift: 0 };
    const load = day.run + day.lift;
    fitness += kFit * (load - fitness);
    fatigue += kFat * (load - fatigue);
    if (d >= windowStart) {
      points.push({
        dateKey,
        load: round1(load),
        runLoad: round1(day.run),
        liftLoad: round1(day.lift),
        fitness: round1(fitness),
        fatigue: round1(fatigue),
        form: round1(fitness - fatigue),
      });
    }
  }
  return points;
}

function parseLocal(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/* ================================
   B1 — LOAD GUARDRAILS (advisory)
   ================================

   Elite-practice monitoring translated honestly (roadmap B1): ramp-rate
   via the classic rolling-mean acute:chronic ratio, Foster monotony /
   strain, and ONE advisory line at most — in the banner register, with
   the thresholds labelled as Tropos heuristics. Never a red
   "injury-risk" score (the non-features list bars readiness theater).

   Design decisions, so they don't get re-derived:
   - ACWR uses ROLLING MEANS (7-day acute / 28-day chronic over the
     daily loads), not the curve's EWMAs. A single planned long run
     barely moves a 7-day mean when the 28-day base also contains long
     runs, so steady training reads ~1.0–1.2; the EWMA point-ratio
     spikes past 1.3 on every big Saturday, which would make the
     advisory nag on exactly the sessions the plan prescribes.
   - Only the HIGH side fires. A low ratio (<0.8) is what a taper or a
     recovery week deliberately produces — flagging it as "detraining"
     would contradict the plan's own instruction to ease off. The ratio
     itself is exposed for any surface that wants to display it.
   - The spike threshold sits at 1.4, deliberately above the ~1.3
     rule-of-thumb band edge, so normal week-to-week structure clears it
     and only a genuine ramp fires.
   - Cold-start guard (design-for-the-user-base): under 28 days of
     history or a near-zero chronic base, every ratio is meaningless —
     everything reads null and no advisory fires. */

export const ACWR_ACUTE_DAYS = 7;
export const ACWR_CHRONIC_DAYS = 28;
export const ACWR_SPIKE_THRESHOLD = 1.4;
/** Foster: monotony = mean/SD of the trailing week's daily loads;
 *  ≥ 2.0 is the classic "too same-y" line. */
export const MONOTONY_THRESHOLD = 2.0;
/** Monotony only matters on a real training week — a quiet week of
 *  near-identical small loads is not a pattern worth flagging. */
export const MONOTONY_MIN_WEEK_LOAD = 150;
/** Chronic base floor (effort-minutes/day) below which ratios are
 *  cold-start noise. */
export const MIN_CHRONIC_DAILY_LOAD = 5;

export interface LoadGuardrails {
  /** 7-day / 28-day rolling-mean load ratio; null on cold start. */
  acwr: number | null;
  /** Foster monotony over the trailing 7 days; null on a quiet week. */
  monotony: number | null;
  /** Foster strain = weekly load × monotony; null when monotony is. */
  strain: number | null;
  /** At most ONE advisory (spike outranks monotony); null = quiet. */
  advisory: { kind: "ramp_spike" | "high_monotony"; line: string } | null;
}

export function evaluateLoadGuardrails(points: LoadPoint[]): LoadGuardrails {
  const week = points.slice(-ACWR_ACUTE_DAYS);
  const weekLoads = week.map((p) => p.load);
  const weekLoad = weekLoads.reduce((a, b) => a + b, 0);

  // ── ACWR ──────────────────────────────────────────────────────────
  let acwr: number | null = null;
  if (points.length >= ACWR_CHRONIC_DAYS) {
    const chronic = points.slice(-ACWR_CHRONIC_DAYS);
    const chronicMean =
      chronic.reduce((a, p) => a + p.load, 0) / chronic.length;
    const acuteMean = weekLoad / week.length;
    if (chronicMean >= MIN_CHRONIC_DAILY_LOAD) {
      acwr = Math.round((acuteMean / chronicMean) * 100) / 100;
    }
  }

  // ── Foster monotony / strain ──────────────────────────────────────
  let monotony: number | null = null;
  let strain: number | null = null;
  if (week.length === ACWR_ACUTE_DAYS && weekLoad >= MONOTONY_MIN_WEEK_LOAD) {
    const mean = weekLoad / week.length;
    const sd = Math.sqrt(
      weekLoads.reduce((a, l) => a + (l - mean) ** 2, 0) / week.length
    );
    // Seven identical days → SD 0 → the ratio is "maximal", not NaN.
    monotony = sd < 1e-6 ? 9.9 : Math.min(9.9, round1(mean / sd));
    strain = Math.round(weekLoad * monotony);
  }

  // ── The one advisory line ─────────────────────────────────────────
  let advisory: LoadGuardrails["advisory"] = null;
  if (acwr != null && acwr > ACWR_SPIKE_THRESHOLD) {
    advisory = {
      kind: "ramp_spike",
      line: `The last 7 days carry ~${Math.round((acwr - 1) * 100)}% more load than your 4-week base — a sharper ramp than most training structures intend (a Tropos heuristic).`,
    };
  } else if (monotony != null && monotony >= MONOTONY_THRESHOLD) {
    advisory = {
      kind: "high_monotony",
      line: "Most days this week landed near-identical load — hard days hard and easy days easy usually carries better (a Tropos heuristic).",
    };
  }

  return { acwr, monotony, strain, advisory };
}
