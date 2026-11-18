"use strict";

/**
 * The weekly review by email (App1 Q55): Monday morning, last week's
 * sessions and food, and a button that opens the review in the app.
 *
 * The week is the person's own, Monday to Sunday of their saved day keys
 * (App1 Q13), the one before the week holding today where they are; the
 * review page reads the same week (`reviewedWeekKey`). Every figure is one
 * the app already counts, counted as the app counts it, so the email never
 * says a number the review contradicts:
 *
 *   lifts, runs, distance  weekTally.tallyWeek, the league's count of saved
 *                          sessions, pinned to the app's `weekDone` by
 *                          weekTally.cross.test.ts. The words say "saved",
 *                          because a planned run marked done by hand counts
 *                          on the review and not here.
 *   food days              a day whose active meals reach 800 kcal
 *                          (FULL_FOOD_DAY_KCAL, the score's copy of
 *                          foodDay.ts), as the review counts its days
 *                          logged.
 *
 * The food days and the week's dates mirror src/lib/foodDay.ts and
 * formatWeekRange in src/lib/weeklyReviewViewModel.ts;
 * weeklyReviewEmail.cross.test.ts runs the app's rule and this one on the
 * same meals and weeks.
 *
 * No planned count: a past week's plan is not stored, and the plan as it
 * is today can say a number the week never had. The review has it.
 *
 * A week with nothing to say gets no email (`hasFigures`): a quiet week is
 * the win-back ladder's to answer, never a Monday "0 sessions" (Q61: no
 * notification uses guilt).
 */

const { tallyWeek, weekKeyOf } = require("./weekTally");
const { localDateKeyInTz } = require("./streakNudge");
const { FULL_FOOD_DAY_KCAL } = require("./perfScoring");
const { appUrl, renderEmail } = require("./updateEmailLayout");

const DAY_MS = 86400000;
const METRES_PER_MILE = 1609.344;

function dayMs(dayKey) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDays(dayKey, n) {
  return new Date(dayMs(dayKey) + n * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The week the review covers, as of `nowMs` in `timezone`: its Monday
 * (`start`), its Sunday (`end`) and the Monday after (`next`, the first day
 * not in it). Null without a zone the person's day can be read in.
 */
function reviewedWeek(nowMs, timezone) {
  const today = localDateKeyInTz(new Date(nowMs), timezone);
  if (!today) return null;
  const next = weekKeyOf(today);
  return { start: addDays(next, -7), end: addDays(next, -1), next };
}

/** Days in the week whose active meals reach a food day's calories. */
function foodDaysIn(meals, week) {
  const byDay = new Map();
  for (const meal of meals) {
    if (!meal || meal.deletedAt) continue;
    if (typeof meal.date !== "string") continue;
    if (meal.date < week.start || meal.date > week.end) continue;
    const calories =
      typeof meal.totalCalories === "number" ? meal.totalCalories : 0;
    byDay.set(meal.date, (byDay.get(meal.date) || 0) + calories);
  }
  let days = 0;
  for (const calories of byDay.values()) {
    if (calories >= FULL_FOOD_DAY_KCAL) days += 1;
  }
  return days;
}

/** The week's figures from its saved sessions and meals. */
function weekFigures({ workouts, runs, meals, week }) {
  const inWeek = (doc) =>
    doc && typeof doc.date === "string" &&
    doc.date >= week.start &&
    doc.date <= week.end;
  const tally = tallyWeek(workouts.filter(inWeek), runs.filter(inWeek));
  return {
    lifts: tally.lifts,
    runs: tally.runs,
    distanceM: tally.distanceM,
    foodDays: foodDaysIn(meals, week),
  };
}

/** Whether the week has anything to say. */
function hasFigures(figures) {
  return figures.lifts + figures.runs > 0 || figures.foodDays > 0;
}

/** Month names as the review page shows them (en-GB, short). */
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  timeZone: "UTC",
});

/** "10–16 Nov", or "28 Nov – 4 Dec": the review page's formatWeekRange. */
function weekRangeLabel(week) {
  const s = new Date(dayMs(week.start));
  const e = new Date(dayMs(week.end));
  if (s.getUTCMonth() === e.getUTCMonth()) {
    return `${s.getUTCDate()}–${e.getUTCDate()} ${MONTH.format(e)}`;
  }
  return `${s.getUTCDate()} ${MONTH.format(s)} – ${e.getUTCDate()} ${MONTH.format(e)}`;
}

/** "14.2 km", or "8.8 mi" for someone who runs in miles. */
function distanceLabel(metres, unit) {
  const miles = unit === "mi";
  const value = miles ? metres / METRES_PER_MILE : metres / 1000;
  return `${value.toFixed(1)} ${miles ? "mi" : "km"}`;
}

function count(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** What the person did, in their words: you, the number, its comparison. */
function weekLines(figures, unit) {
  const lines = [];
  const sessions = [];
  if (figures.lifts > 0) sessions.push(count(figures.lifts, "lift", "lifts"));
  if (figures.runs > 0) sessions.push(count(figures.runs, "run", "runs"));
  if (sessions.length > 0) {
    let line = `You saved ${sessions.join(" and ")}.`;
    if (figures.runs > 0 && figures.distanceM > 0) {
      line += ` You ran ${distanceLabel(figures.distanceM, unit)}.`;
    }
    lines.push(line);
  }
  if (figures.foodDays > 0) {
    lines.push(`You logged food on ${figures.foodDays} of 7 days.`);
  }
  return lines;
}

/**
 * The email for one person's week.
 *
 * @param {object} args
 * @param {{ lifts: number, runs: number, distanceM: number, foodDays: number }} args.figures
 * @param {{ start: string, end: string }} args.week
 * @param {"km" | "mi"} [args.unit]
 * @param {string} args.unsubscribe - the person's unsubscribe link
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildWeeklyReviewEmail({ figures, week, unit, unsubscribe }) {
  const range = weekRangeLabel(week);
  const { text, html } = renderEmail({
    heading: "Your week, reviewed",
    kicker: range,
    paragraphs: [
      ...weekLines(figures, unit),
      "Your review in Tropos has the whole week, and the week ahead to agree.",
    ],
    button: { label: "Open your review", url: appUrl("/review") },
    reason:
      "You’re getting this because you chose the weekly review email in Tropos. It comes on a Monday after a week you logged something.",
    unsubscribe,
  });
  return { subject: `Your week, reviewed: ${range}`, text, html };
}

module.exports = {
  reviewedWeek,
  foodDaysIn,
  weekFigures,
  hasFigures,
  weekRangeLabel,
  distanceLabel,
  weekLines,
  buildWeeklyReviewEmail,
};
