import { describe, it, expect } from "vitest";
import {
  documentsForWeeks,
  weeklyPerformanceSeries,
} from "../performanceSeries";
import { addLocalDays, localDateString, parseLocalDate } from "../dateHelpers";

/**
 * Performance documents are named for the day they were computed and
 * score the seven days ending on it, so an active user has one a DAY.
 * These tests hold the series to weeks: one document per seven-day step
 * back from the newest, and "the week before" never meaning yesterday.
 */

const NEWEST = "2026-09-27";
const key = (daysBack: number) =>
  localDateString(addLocalDays(parseLocalDate(NEWEST), -daysBack));
const doc = (daysBack: number, pi = 60) => ({
  weekKey: key(daysBack),
  performanceIndex: pi,
});
/** Daily documents from `from` days back to today, oldest first. */
const daily = (from: number, skip: number[] = []) =>
  Array.from({ length: from + 1 }, (_, i) => from - i)
    .filter((d) => !skip.includes(d))
    .map((d) => doc(d, 50 + d));

describe("weeklyPerformanceSeries", () => {
  it("takes one daily document per week, stepping back seven days", () => {
    const { weeks } = weeklyPerformanceSeries(daily(20), 3);
    expect(weeks.map((w) => w.weekKey)).toEqual([key(14), key(7), key(0)]);
  });

  it("compares with the week before, not with yesterday", () => {
    // The defect: every surface read the document before the newest,
    // which for a daily user is yesterday's overlapping week.
    const { previous } = weeklyPerformanceSeries(daily(20), 2);
    expect(previous?.weekKey).toBe(key(7));
    expect(previous?.weekKey).not.toBe(key(1));
  });

  it("uses the newest document inside a week that is missing its day", () => {
    // No document seven days back (the refresh skipped it); the newest one
    // still inside that week stands for it.
    const { weeks, previous } = weeklyPerformanceSeries(daily(20, [7, 8]), 3);
    expect(previous?.weekKey).toBe(key(9));
    expect(weeks.map((w) => w.weekKey)).toEqual([key(14), key(9), key(0)]);
  });

  it("leaves an empty week out, and never lets an older week pose as last week", () => {
    // A fortnight away: nothing in the week before the newest.
    const docs = [doc(21), doc(15), doc(14), doc(0)];
    const { weeks, previous } = weeklyPerformanceSeries(docs, 4);
    expect(previous).toBeNull();
    expect(weeks.map((w) => w.weekKey)).toEqual([key(21), key(14), key(0)]);
  });

  it("reads weekly documents as they are: one per week", () => {
    // Pre-PI1a documents, and users only the Sunday rollup still writes.
    const docs = [doc(28), doc(21), doc(14), doc(7), doc(0)];
    const { weeks, previous } = weeklyPerformanceSeries(docs, 12);
    expect(weeks).toHaveLength(5);
    expect(previous?.weekKey).toBe(key(7));
  });

  it("anchors on the newest document, however old it is", () => {
    // Someone back after a break keeps the last score they earned.
    const docs = [doc(107), doc(100)];
    const { weeks, previous } = weeklyPerformanceSeries(docs, 6);
    expect(weeks.map((w) => w.weekKey)).toEqual([key(107), key(100)]);
    expect(previous?.weekKey).toBe(key(107));
  });

  it("stops at the number of weeks asked for", () => {
    const { weeks } = weeklyPerformanceSeries(daily(90), 6);
    expect(weeks).toHaveLength(6);
    expect(weeks[0].weekKey).toBe(key(35));
  });

  it("returns nothing for no documents, or for a week count of none", () => {
    expect(weeklyPerformanceSeries([], 6)).toEqual({
      weeks: [],
      previous: null,
    });
    expect(weeklyPerformanceSeries(daily(10), 0).weeks).toEqual([]);
  });

  it("ignores a document whose key is not a day", () => {
    const docs = [doc(7), { weekKey: "garbage", performanceIndex: 1 }, doc(0)];
    const { weeks } = weeklyPerformanceSeries(docs, 3);
    expect(weeks.map((w) => w.weekKey)).toEqual([key(7), key(0)]);
  });

  it("keeps the documents themselves, not copies", () => {
    const docs = daily(7);
    const { weeks } = weeklyPerformanceSeries(docs, 2);
    expect(weeks[1]).toBe(docs[docs.length - 1]);
  });
});

describe("documentsForWeeks", () => {
  it("reads a full week of daily documents for every week before the newest", () => {
    expect(documentsForWeeks(1)).toBe(1);
    expect(documentsForWeeks(2)).toBe(8);
    expect(documentsForWeeks(6)).toBe(36);
    expect(documentsForWeeks(12)).toBe(78);
  });

  it("reaches the oldest slot of a daily user's series", () => {
    // Exactly enough: the oldest week's slot ends 7 × (weeks − 1) days back.
    const weeksAsked = 6;
    const docs = daily(200).slice(-documentsForWeeks(weeksAsked));
    expect(weeklyPerformanceSeries(docs, weeksAsked).weeks).toHaveLength(
      weeksAsked
    );
  });

  it("never asks for fewer than one document", () => {
    expect(documentsForWeeks(0)).toBe(1);
    expect(documentsForWeeks(-3)).toBe(1);
  });
});
