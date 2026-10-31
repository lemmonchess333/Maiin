/**
 * Formatting utilities for display values across the app.
 */
import { liftUnitLabel, liftVolumeIn, type LiftUnit } from "@/lib/liftLoad";

/**
 * Format lifting volume (stored as kg) in the lifter's unit (500 → "500",
 * 1500 → "1.5k", 1,500,000 → "1.5M"). Millions are their own step because a lifetime
 * total reaches them in a year or two of regular lifting, and "1500.0k"
 * was wider than History's Lifetime tile on a 320 px phone.
 */
export function formatVolume(
  kg: number,
  liftUnit: LiftUnit
): { value: string; unit: string } {
  if (kg <= 0) return { value: "\u2014", unit: "" };
  const amount = liftVolumeIn(kg, liftUnit);
  const unit = liftUnitLabel(liftUnit);
  if (amount >= 1000) {
    const thousands = (amount / 1000).toFixed(1);
    if (Number(thousands) < 1000) return { value: thousands + "k", unit };
    return { value: (amount / 1_000_000).toFixed(1) + "M", unit };
  }
  return { value: String(Math.round(amount)), unit };
}

/**
 * Abbreviate a number with a "k" suffix past 1000 (e.g. 1500 -> "1.5k",
 * 500 -> "500"). The single home for the thousands-abbreviation that was
 * previously hand-rolled per chart with drifting decimal precision
 * (VolumeChart's axis used 0 decimals while its own tooltip used 1, so a
 * 1500 kg bar sat against a gridline labelled "2k").
 */
export function abbreviateK(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
}

/**
 * Round parts to integer percentages that sum to EXACTLY 100
 * (largest-remainder method). Independent Math.round per slice can total
 * 99 or 101 (33.3/33.3/33.4 -> 33+33+33), which reads as an arithmetic
 * error in any labelled breakdown. Zero/empty totals return all zeros.
 */
export function percentagesSummingTo100(values: number[]): number[] {
  const total = values.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => ((Number.isFinite(v) ? v : 0) / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((s, v) => s + v, 0);
  // Distribute the leftover points to the largest fractional parts.
  const order = exact
    .map((v, i) => ({ frac: v - floors[i], i }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] += 1;
    remainder -= 1;
  }
  return result;
}

/**
 * "20 Mar" — the one home for the day+month display label that was
 * hand-rolled as toLocaleDateString("en-GB", { day, month }) in four
 * analytics files (chart tooltips, PR dates, aria summaries).
 */
export function formatDayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "20 Mar 2026" — the year-carrying variant (tooltip detail lines). */
export function formatDayMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Sat 11 Oct" — the short weekday form (a session's day in a list). */
export function formatShortWeekdayDayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Saturday 22 August" — the long weekday form (sheet subtitles). The
 *  en-GB order, like the two helpers above: an absent locale follows the
 *  DEVICE, so it renders "Saturday, August 22" on a US phone — the bug
 *  class a 2026-08-22 sweep found six of. */
export function formatWeekdayDayMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "22 August" — the month in full, without a weekday (an aria-label's
 *  "Week of 22 August"). */
export function formatDayMonthLong(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

/** "Mon": the weekday alone, short ("Done Tue", a day column's head). */
export function formatShortWeekday(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

/** "Monday": the weekday alone, in full ("The next one starts Monday."). */
export function formatWeekday(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long" });
}

/** "November": the month alone, in full ("You're in for November."). */
export function formatMonth(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long" });
}

/** "22 August 2026" — the full month with its year (a race's date, said
 *  in full). */
export function formatDayMonthYearLong(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** "Saturday 22 August 2026" — the long weekday form with its year.
 *  Built on formatWeekdayDayMonth rather than asked of Intl with a year,
 *  which puts a comma after the weekday ("Saturday, 22 August 2026") that
 *  none of the forms above carries. */
export function formatWeekdayDayMonthYear(d: Date): string {
  return `${formatWeekdayDayMonth(d)} ${d.getFullYear()}`;
}

/**
 * "07:10", "13:13" — a clock time of day: 24-hour, the hour zero-padded,
 * in the device's time zone. The app's one time format, as day-first is
 * its one date order. Built from the hours and minutes, not by Intl,
 * whose time follows a locale's convention, so the same moment would
 * read two ways on two phones. Not for an elapsed time ("23:41"): that
 * is formatClock. timeTreatment.test.ts keeps this the only one.
 */
export function formatTimeOfDay(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** U+2212, the typographic minus. A screen reader says it as "minus",
 *  where it reads the hyphen a negative number prints with as "dash", and
 *  it is the width of the plus beside it. */
export const MINUS_SIGN = "\u2212";

/**
 * A figure with its sign, given its size already written the way it
 * should read: `withSign(-2400, formatCalories(2400))` is "−2,400",
 * `withSign(3, "3")` is "+3". Negative takes the true minus (MINUS_SIGN),
 * not the hyphen `toFixed` and `toLocaleString` print, and a size that
 * reads as zero ("0", "0.00") takes no sign at all, so a rate of −0.001
 * is not "−0.00". unitTreatment.test.ts refuses the hand-rolled
 * `x > 0 ? "+" : ""`, which leaves a negative to print its hyphen.
 */
export function withSign(value: number, magnitude: string): string {
  if (!/[1-9]/.test(magnitude)) return magnitude;
  return `${value < 0 ? MINUS_SIGN : "+"}${magnitude}`;
}

/** A signed figure to `decimals` places: "+0.25", "−0.27", "0.00". */
export function formatSigned(value: number, decimals = 0): string {
  return withSign(value, Math.abs(value).toFixed(decimals));
}

/**
 * A span of time in words, its units spaced like every other unit's:
 * "45 s", "12 min", "1 h", "1 h 5 min". Whole minutes by default, rounded,
 * which is what a planned or estimated span needs; `seconds` keeps the
 * part minute, which an interval's work time needs ("1 min 30 s"). Under
 * a minute is always seconds. Not for a stopwatch or a run's moving time,
 * which read as a clock: that is formatClock.
 */
export function formatDuration(
  totalSeconds: number,
  { seconds = false }: { seconds?: boolean } = {}
): string {
  const total = Math.max(0, Math.round(totalSeconds));
  if (total < 60) return `${total} s`;
  const wholeMinutes = seconds
    ? Math.floor(total / 60)
    : Math.round(total / 60);
  const h = Math.floor(wholeMinutes / 60);
  const m = wholeMinutes % 60;
  const s = seconds ? total % 60 : 0;
  return [h > 0 && `${h} h`, m > 0 && `${m} min`, s > 0 && `${s} s`]
    .filter(Boolean)
    .join(" ");
}

/**
 * The spaces in a short phrase made non-breaking, so a line that wraps
 * keeps "180 g", "30 Aug" or "target 2,350" whole. A lone "g" under
 * "target 180" reads as a second, unexplained figure.
 */
export function keepTogether(phrase: string): string {
  return phrase.replace(/ /g, "\u00A0");
}

/** Format distance, showing "—" when zero/null */
export function formatDistance(km: number | null | undefined): string {
  if (!km || km <= 0) return "\u2014";
  return km.toFixed(1);
}

/**
 * Elapsed or remaining time as a clock: "m:ss" below an hour, "h:mm:ss"
 * from an hour ("0:08", "1:12", "1:01:01"). Rounds to the nearest second
 * and clamps at zero; a caller that needs floor/ceil semantics (a
 * stopwatch, a countdown) rounds before passing. Replaced twelve local
 * copies across the run, workout and share surfaces.
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mmss = `${m}:${String(sec).padStart(2, "0")}`;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : mmss;
}
