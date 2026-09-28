/**
 * A WEEKLY Performance series, from documents that are written DAILY.
 *
 * Since PI1a a performance document is named for the day it was computed
 * and scores the seven days that end on it (`functions/performanceEngine.js`
 * `getComputeKey`: "No Sunday alignment"). Two crons and every saved
 * session write one, so an active user gains a document a day. Read the
 * newest N of them and you have N DAYS of a rolling week, each overlapping
 * the next by six days.
 *
 * Every surface still read them as weeks. Home's chip and the overview's
 * card compared today's score with the document before it — yesterday's —
 * and called the difference "on last week"; the index chart said "last
 * 12w" over twelve days; the average said "your last 6 active weeks" over
 * six days. `isEstablishingBaseline` was corrected for this earlier
 * (see `performanceDocFields.ts`); the series never was.
 *
 * This picks one document per week, stepping back seven days at a time
 * from the newest: the newest document in each week-long slot. Because
 * each document scores the seven days ending on it, one per seven-day
 * step gives weeks that do not overlap, which is what a week-on-week
 * comparison needs.
 *
 * A slot with no document (a quiet stretch: the daily refresh runs only
 * for recently active users, the Sunday rollup for the last month) is
 * left out of the line rather than filled, and it is never stood in for
 * by an older week when the question is "last week": `previous` is the
 * slot directly before the newest, or nothing.
 */
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";

/** Days in one slot; also how many daily documents a week can hold. */
export const DAYS_PER_WEEK = 7;

/**
 * How many documents to read for `weeks` weekly points: the newest, and
 * then a full week of daily documents for every slot before it. Fewer
 * would leave the oldest slots empty for a daily user; users written to
 * weekly just reach further back, which costs nothing wrong.
 */
export function documentsForWeeks(weeks: number): number {
  return Math.max(1, DAYS_PER_WEEK * (Math.max(1, weeks) - 1) + 1);
}

function shiftKey(key: string, days: number): string {
  return localDateString(addLocalDays(parseLocalDate(key), days));
}

export interface WeeklySeries<T> {
  /** One document per week, oldest first, the newest last. */
  weeks: T[];
  /** The document for the week directly before the newest one, if any. */
  previous: T | null;
}

/**
 * One document per week from documents ordered OLDEST FIRST, the newest
 * one anchoring the grid. `maxWeeks` caps how far back it steps.
 */
export function weeklyPerformanceSeries<T extends { weekKey: string }>(
  docsOldestFirst: readonly T[],
  maxWeeks: number
): WeeklySeries<T> {
  const docs = docsOldestFirst.filter((d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d.weekKey)
  );
  if (docs.length === 0 || maxWeeks < 1) return { weeks: [], previous: null };

  const newest = docs[docs.length - 1];
  const picked: T[] = [newest];
  let previous: T | null = null;

  // The slot k weeks back holds the days (end − 7, end], end = newest − 7k.
  let cursor = docs.length - 2;
  for (let k = 1; k < maxWeeks && cursor >= 0; k++) {
    const end = shiftKey(newest.weekKey, -DAYS_PER_WEEK * k);
    const start = shiftKey(end, -DAYS_PER_WEEK);
    while (cursor >= 0 && docs[cursor].weekKey > end) cursor--;
    if (cursor < 0) break;
    const candidate = docs[cursor];
    if (candidate.weekKey > start) {
      picked.push(candidate);
      if (k === 1) previous = candidate;
      cursor--;
    }
  }

  return { weeks: picked.reverse(), previous };
}
