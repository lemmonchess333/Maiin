/**
 * Body signals from Apple Health, summarised for readiness (whole-app
 * grill, 13 November 2026: Q39, Q40, Q43, Q44).
 *
 * Pure: the native reads live in `healthKit.ts`, and this turns what they
 * return into the few numbers readiness reads:
 *
 *   - last night's sleep, in minutes asleep, and the person's usual night;
 *   - today's resting heart rate and its usual;
 *   - today's heart rate variability and its usual.
 *
 * Nothing here is stored. Q44 allows daily summaries on the server; these
 * are worked out on the phone each time from Health's own record, so no
 * health reading leaves the device.
 *
 * Dates are LOCAL day keys (YYYY-MM-DD, `localDateString`): a night belongs
 * to the local day it ends on, never to a UTC day.
 */
import { localDateString } from "./dateHelpers";

/** One sleep sample as the Health plugin returns it. */
export interface SleepSampleLike {
  startDate: string;
  endDate: string;
  /** "inBed" | "asleep" | "awake" | "rem" | "deep" | "light"; absent on
   *  some sources, which then mean asleep (HealthKit's legacy value). */
  sleepState?: string;
}

/** One day's value of a daily reading (resting heart rate, HRV). */
export interface DailyValue {
  /** Local day key. */
  dateKey: string;
  value: number;
}

/** The states that count as asleep. "inBed" and "awake" do not. */
const ASLEEP = new Set(["asleep", "rem", "deep", "light"]);

/** A night is the sleep that ends between this hour on the evening before
 *  and this hour on the day itself: a nap at 15:00 is not last night. */
export const NIGHT_WINDOW_START_HOUR = 18;
export const NIGHT_WINDOW_END_HOUR = 14;

/** A usual needs at least this many earlier nights or days; under it there
 *  is no usual, and only the fixed sleep floor applies. */
export const MIN_BASELINE_DAYS = 7;
/** A usual reads at most this many earlier nights or days. */
export const BASELINE_DAYS = 28;

function nightWindow(wakeDayKey: string): { start: number; end: number } {
  const [y, m, d] = wakeDayKey.split("-").map(Number);
  const end = new Date(y, m - 1, d, NIGHT_WINDOW_END_HOUR, 0, 0, 0);
  const start = new Date(y, m - 1, d - 1, NIGHT_WINDOW_START_HOUR, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Minutes asleep in the night that ends on `wakeDayKey`. Overlapping
 * samples (a Watch and a phone, or two apps, recording the same night)
 * are merged first, so a night recorded twice is not counted twice.
 * Null when nothing asleep was recorded in the window: no record is not
 * a night without sleep.
 */
export function nightAsleepMinutes(
  samples: readonly SleepSampleLike[],
  wakeDayKey: string
): number | null {
  const { start, end } = nightWindow(wakeDayKey);
  const spans: Array<[number, number]> = [];
  for (const s of samples) {
    const state = s.sleepState ?? "asleep";
    if (!ASLEEP.has(state)) continue;
    const a = Math.max(Date.parse(s.startDate), start);
    const b = Math.min(Date.parse(s.endDate), end);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) spans.push([a, b]);
  }
  if (spans.length === 0) return null;
  spans.sort((p, q) => p[0] - q[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0];
  for (const [a, b] of spans.slice(1)) {
    if (a <= curEnd) {
      curEnd = Math.max(curEnd, b);
    } else {
      total += curEnd - curStart;
      [curStart, curEnd] = [a, b];
    }
  }
  total += curEnd - curStart;
  return Math.round(total / 60000);
}

/** The local day key `days` before `dayKey`. */
function dayKeyBefore(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return localDateString(new Date(y, m - 1, d - days));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The person's usual night: the median of up to {@link BASELINE_DAYS}
 * earlier nights that have a record. Null under {@link MIN_BASELINE_DAYS}.
 * A median, so one all-nighter or one long lie-in does not move it.
 */
export function usualSleepMinutes(
  samples: readonly SleepSampleLike[],
  todayKey: string
): number | null {
  const nights: number[] = [];
  for (let back = 1; back <= BASELINE_DAYS; back++) {
    const minutes = nightAsleepMinutes(samples, dayKeyBefore(todayKey, back));
    if (minutes != null && minutes > 0) nights.push(minutes);
  }
  return nights.length >= MIN_BASELINE_DAYS ? Math.round(median(nights)) : null;
}

/**
 * Today's value of a daily reading and its usual: the median of up to
 * {@link BASELINE_DAYS} earlier days that have one. The usual is null under
 * {@link MIN_BASELINE_DAYS}; today's value is null when today has none.
 */
export function todayAgainstUsual(
  days: readonly DailyValue[],
  todayKey: string
): { today: number | null; usual: number | null } {
  const earliest = dayKeyBefore(todayKey, BASELINE_DAYS);
  const today = days.find((d) => d.dateKey === todayKey)?.value ?? null;
  const earlier = days
    .filter((d) => d.dateKey < todayKey && d.dateKey >= earliest)
    .map((d) => d.value)
    .filter((v) => Number.isFinite(v) && v > 0);
  return {
    today: today != null && Number.isFinite(today) && today > 0 ? today : null,
    usual: earlier.length >= MIN_BASELINE_DAYS ? median(earlier) : null,
  };
}
