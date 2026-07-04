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
