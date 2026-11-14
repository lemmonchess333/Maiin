/**
 * A week of steps against the activity level the calorie target assumes
 * (whole-app grill Q31, 13 November 2026: "A 7-day step average offers a
 * change to activity level").
 *
 * Pure: `healthKit.ts` reads the daily totals on the phone, and this turns
 * them into one decision. The calorie target is Mifflin-St Jeor times the
 * stored `activityLevel`'s multiplier (`tdee.ts`), so a level that does
 * not match how much the person moves sets the target wrong by a few
 * hundred kcal for as long as nobody notices.
 *
 * The rules, each pinned in `__tests__/stepActivity.test.ts`:
 *
 *   - The week is the last FULL Monday to Sunday week (`WEEK_STARTS_ON`),
 *     never today's partial one, so the answer is the same all week and
 *     changes once a week, on Monday.
 *   - Only days with a reading count (a day with no steps recorded is a
 *     phone left on the side, not a day without walking). Under
 *     `MIN_STEP_DAYS` of the seven, it says nothing.
 *   - The average agrees with the stored level unless it sits more than
 *     `BAND_MARGIN_STEPS` outside that level's band, so a person living on
 *     a band's edge is not offered one level one week and the other back
 *     the next.
 *   - A move DOWN waits for a week with no lift logged. Steps count
 *     walking and running, never lifting, so a week of lifting with few
 *     steps says nothing about whether the stored level is too high.
 *     A move up is always offered: steps only ever undercount.
 *   - "Keep" hides the offer for `STEP_OFFER_DISMISS_DAYS`.
 *
 * Steps never become a kcal figure here (ADR-0007): they choose a level,
 * the level's multiplier sets the target, and nothing changes without
 * the person's tap.
 */
import type { ActivityLevel } from "./tdee";
import type { DailyValue } from "./bodySignals";
import {
  addLocalDays,
  localDateString,
  parseLocalDate,
  startOfLocalWeek,
} from "./dateHelpers";

/** The levels in order, least active first, as `tdee.ts` multiplies them
 *  (1.2, 1.375, 1.55, 1.725, 1.9). */
export const ACTIVITY_LEVEL_ORDER: readonly ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
];

/**
 * The daily steps at which each level starts.
 *
 * Source: Tudor-Locke C, Bassett DR Jr. "How many steps/day are enough?
 * Preliminary pedometer indices for public health." Sports Medicine
 * 2004;34(1):1-8. Its five categories for healthy adults: under 5,000 a
 * day "sedentary", 5,000-7,499 "low active", 7,500-9,999 "somewhat
 * active", 10,000-12,499 "active", 12,500 or more "highly active"
 * (restated in Tudor-Locke et al., "How many steps/day are enough? For
 * adults", IJBNPA 2011;8:79). They are matched in order to the five
 * levels the calorie maths multiplies by, the same sedentary-to-very-
 * active scale.
 */
export const STEP_BAND_FLOOR: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 0,
  light: 5000,
  moderate: 7500,
  active: 10000,
  very_active: 12500,
};

/** Days with a reading, of the week's seven, before the average speaks. */
export const MIN_STEP_DAYS = 5;

/** How far outside its band an average must sit to disagree with a level:
 *  about five minutes of walking a day. */
export const BAND_MARGIN_STEPS = 500;

/** "Keep" hides the offer for this long. */
export const STEP_OFFER_DISMISS_DAYS = 30;

const DAY_MS = 86_400_000;

/** The words the offer uses for each level. Settings' longer labels
 *  (`ACTIVITY_LABELS`) describe training days, not steps. */
export const ACTIVITY_SHORT_NAMES: Readonly<Record<ActivityLevel, string>> = {
  sedentary: "Sedentary",
  light: "Light",
  moderate: "Moderate",
  active: "Active",
  very_active: "Very active",
};

/** The level a daily step average falls in. */
export function activityLevelForSteps(average: number): ActivityLevel {
  let level: ActivityLevel = "sedentary";
  for (const candidate of ACTIVITY_LEVEL_ORDER) {
    if (average >= STEP_BAND_FLOOR[candidate]) level = candidate;
  }
  return level;
}

/** The last full week before the one holding `todayKey`: its Monday's
 *  key, its seven day keys, and the instants a Health read spans (local
 *  midnight on that Monday up to local midnight on this one). */
export function lastFullStepWeek(todayKey: string): {
  weekKey: string;
  dayKeys: string[];
  start: Date;
  end: Date;
} {
  const end = startOfLocalWeek(parseLocalDate(todayKey));
  const start = addLocalDays(end, -7);
  const dayKeys = Array.from({ length: 7 }, (_, i) =>
    localDateString(addLocalDays(start, i))
  );
  return { weekKey: dayKeys[0], dayKeys, start, end };
}

/** The week's average of daily steps, over the days with a reading only.
 *  Null with fewer than `MIN_STEP_DAYS` of them. */
export function weekStepAverage(
  daily: readonly DailyValue[],
  dayKeys: readonly string[]
): { average: number; days: number } | null {
  const inWeek = new Set(dayKeys);
  const totals = new Map<string, number>();
  for (const { dateKey, value } of daily) {
    if (!inWeek.has(dateKey) || !Number.isFinite(value)) continue;
    totals.set(dateKey, (totals.get(dateKey) ?? 0) + value);
  }
  const readings = [...totals.values()].filter((v) => v > 0);
  if (readings.length < MIN_STEP_DAYS) return null;
  const sum = readings.reduce((a, b) => a + b, 0);
  return { average: Math.round(sum / readings.length), days: readings.length };
}

/** The average sits inside `level`'s band, or within `BAND_MARGIN_STEPS`
 *  of it. */
export function stepsAgreeWith(level: ActivityLevel, average: number): boolean {
  const index = ACTIVITY_LEVEL_ORDER.indexOf(level);
  const next = ACTIVITY_LEVEL_ORDER[index + 1];
  const low = STEP_BAND_FLOOR[level] - BAND_MARGIN_STEPS;
  const high =
    next === undefined
      ? Number.POSITIVE_INFINITY
      : STEP_BAND_FLOOR[next] + BAND_MARGIN_STEPS;
  return average >= low && average < high;
}

/** "Keep" was tapped within the last `STEP_OFFER_DISMISS_DAYS`. A
 *  timestamp in the future (a phone's clock set wrong) counts as none. */
export function isStepOfferDismissed(
  dismissedAtMs: number | null | undefined,
  nowMs: number
): boolean {
  if (typeof dismissedAtMs !== "number" || !Number.isFinite(dismissedAtMs))
    return false;
  if (dismissedAtMs <= 0 || dismissedAtMs > nowMs) return false;
  return nowMs - dismissedAtMs < STEP_OFFER_DISMISS_DAYS * DAY_MS;
}

/**
 * Whether steps can change anything for this account: it is Pro (the
 * whole-app grill's Q45: Pro is the app using your body's data to adjust
 * things for you), its target is the formula's, and it has not set a
 * number of its own. A learned target already follows what the person
 * burns, and a manual one ignores the level, so for either the offer
 * would name a target that never arrives. Home asks to connect Health for
 * steps only when this holds.
 */
export function stepsFeedTheTarget(p: {
  isPro: boolean;
  adaptiveSource: "formula" | "learned" | undefined;
  manualTarget: boolean;
}): boolean {
  return p.isPro && p.adaptiveSource !== "learned" && !p.manualTarget;
}

export interface StepActivityOffer {
  /** The Monday of the week the average is from. */
  weekKey: string;
  averageSteps: number;
  /** Days of the seven with a reading. */
  daysCounted: number;
  /** The level the target assumes now. */
  from: ActivityLevel;
  /** The level the steps fall in. */
  to: ActivityLevel;
  direction: "up" | "down";
}

/**
 * The offer for this week, or null.
 *
 * `storedLevel` is the profile's; absent, the target assumes "moderate",
 * as the calorie maths does (`buildGoalWeightPersistPayload`).
 * `liftDays` are the local day keys of logged lifts, any span: only those
 * inside the week are read.
 */
export function stepActivityOffer(input: {
  storedLevel: ActivityLevel | null | undefined;
  dailySteps: readonly DailyValue[];
  todayKey: string;
  liftDays: readonly string[];
  dismissedAtMs: number | null | undefined;
  nowMs: number;
}): StepActivityOffer | null {
  if (isStepOfferDismissed(input.dismissedAtMs, input.nowMs)) return null;
  const week = lastFullStepWeek(input.todayKey);
  const avg = weekStepAverage(input.dailySteps, week.dayKeys);
  if (!avg) return null;
  const from = input.storedLevel ?? "moderate";
  if (stepsAgreeWith(from, avg.average)) return null;
  const to = activityLevelForSteps(avg.average);
  const direction =
    ACTIVITY_LEVEL_ORDER.indexOf(to) > ACTIVITY_LEVEL_ORDER.indexOf(from)
      ? "up"
      : "down";
  if (direction === "down") {
    const inWeek = new Set(week.dayKeys);
    if (input.liftDays.some((d) => inWeek.has(d))) return null;
  }
  return {
    weekKey: week.weekKey,
    averageSteps: avg.average,
    daysCounted: avg.days,
    from,
    to,
    direction,
  };
}

/** The card's words, apart from its drawing so each case is tested. */
export function stepActivityOfferWords(
  offer: StepActivityOffer,
  targets: { now: number; next: number },
  format: { steps: (n: number) => string; kcal: (n: number) => string }
): {
  heading: string;
  line: string;
  target: string;
  caveat: string | null;
  accept: string;
  keep: string;
} {
  const from = ACTIVITY_SHORT_NAMES[offer.from];
  const to = ACTIVITY_SHORT_NAMES[offer.to];
  const diff = Math.round(targets.next - targets.now);
  const change =
    diff === 0
      ? ""
      : `, ${diff > 0 ? "up" : "down"} from ${format.kcal(targets.now)}`;
  return {
    heading: `Your steps say ${to}`,
    line: `You averaged ${format.steps(offer.averageSteps)} steps a day last week. Your target assumes ${from}.`,
    target: `${to} sets your target to ${format.kcal(targets.next)}${change}.`,
    caveat:
      offer.direction === "down"
        ? `Steps miss cycling and swimming, so keep ${from} if you do those.`
        : null,
    accept: `Use ${to}`,
    keep: `Keep ${from}`,
  };
}
