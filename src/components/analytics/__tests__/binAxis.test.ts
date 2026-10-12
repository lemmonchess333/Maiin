import { describe, it, expect } from "vitest";
import { axisLabelSpans, binAxis, LONGEST_LABEL_WORD_EM } from "../binAxis";
import {
  addLocalDays,
  localDateString,
  rollingWindowStart,
} from "@/lib/dateHelpers";
import {
  summaryBins,
  summaryGranularity,
  type SummaryGranularity,
} from "@/lib/periodSummary";

/**
 * Which bars History's charts name underneath, and the card it takes to
 * name every one. A unit test cannot measure a layout: the words' widths
 * are measured in a browser by largeText.capture.spec.ts. This holds what
 * those widths feed for every chart History can draw on any day, because
 * the number of bars changes with the day: one width for every chart,
 * 11em, held five weeks and not the six a Monday draws.
 */

/** History's ranges, 1W to 1Y, in days. */
const RANGE_DAYS = [7, 30, 90, 180, 365] as const;

/** A 320 px phone's card at the designed text size, in its own em. */
const DESIGNED_CARD_EM = 16;

interface Chart {
  /** "YYYY-MM-DD", the day it is drawn on. */
  day: string;
  weekday: number;
  rangeDays: number;
  granularity: SummaryGranularity;
  bars: number;
}

/** Every chart History draws, on each day of 2027 and 2028 (a leap year). */
function everyChart(): Chart[] {
  const charts: Chart[] = [];
  for (let d = 0; d < 731; d++) {
    const today = addLocalDays(new Date(2027, 0, 1, 12), d);
    today.setHours(12);
    for (const rangeDays of RANGE_DAYS) {
      const granularity = summaryGranularity(rangeDays);
      const bars = summaryBins({
        since: rollingWindowStart(rangeDays, today),
        today,
        lifts: [],
        runs: [],
        granularity,
      }).length;
      charts.push({
        day: localDateString(today),
        weekday: today.getDay(),
        rangeDays,
        granularity,
        bars,
      });
    }
  }
  return charts;
}

describe("the bars a chart names", () => {
  it("names every bar up to seven", () => {
    for (const bars of [1, 4, 5, 6, 7]) {
      expect(binAxis(bars, "weekly").every).toBe(1);
    }
  });

  it("names every few past seven, counted back from the current bar", () => {
    expect(binAxis(13, "weekly").every).toBe(4);
    expect(binAxis(14, "weekly").every).toBe(4);
    expect(binAxis(12, "monthly").every).toBe(3);
  });
});

describe("when the labels give way to the two ends", () => {
  it("takes more card for a Monday's six weeks than for five", () => {
    // At 135% on a 320 px phone the card is 11.3em: a sixth of it is
    // 2 px narrower than "week", where 11em would keep every label.
    expect(binAxis(6, "weekly")).toMatchObject({
      below: 12,
      labels: "@max-[12em]:hidden",
      ends: "@max-[12em]:flex",
    });
    expect(binAxis(5, "weekly")).toMatchObject({
      below: 11,
      labels: "@max-[11em]:hidden",
      ends: "@max-[11em]:flex",
    });
  });

  it("takes its own width for a week's days and for six and seven months", () => {
    expect(binAxis(7, "daily").below).toBe(15.5);
    expect(binAxis(6, "monthly").below).toBe(14.5);
    expect(binAxis(7, "monthly").below).toBe(16);
  });

  it("asks the card the narrowest label's columns need where only every few bars are named", () => {
    // 3M: two columns for the first label of 13 weeks, three of 14.
    expect(binAxis(13, "weekly").below).toBe(14.5);
    expect(binAxis(14, "weekly").below).toBe(11);
    // 1Y: two columns for the first label of 13 months, the last of 12.
    expect(binAxis(13, "monthly").below).toBe(15.5);
    expect(binAxis(12, "monthly").below).toBe(14.5);
  });

  it("takes the narrowest width, 11em, however few the bars", () => {
    expect(binAxis(3, "monthly").below).toBe(11);
    expect(binAxis(4, "weekly").below).toBe(11);
  });
});

describe("each label's columns", () => {
  it("are its own bar's while every bar is named", () => {
    expect(axisLabelSpans(3, 1).map((s) => [s.start, s.end, s.align])).toEqual([
      [0, 0, "center"],
      [1, 1, "center"],
      [2, 2, "center"],
    ]);
  });

  it("split each gap between its two labels, the ends running to the chart's edges", () => {
    expect(
      axisLabelSpans(13, 4).map((s) => [s.index, s.start, s.end, s.align])
    ).toEqual([
      [0, 0, 1, "left"],
      [4, 2, 5, "center"],
      [8, 6, 9, "center"],
      [12, 10, 12, "right"],
    ]);
  });
});

describe("every chart History draws, on every day of two years", () => {
  const charts = everyChart();

  it("draws six weeks for the 30 days up to a Monday, and five otherwise", () => {
    const wrong = charts
      .filter((c) => c.rangeDays === 30)
      .filter((c) => c.bars !== (c.weekday === 1 ? 6 : 5))
      .map((c) => `${c.day}: ${c.bars} weeks`);
    expect(wrong).toEqual([]);
  });

  it("names bars only while each label's columns hold the longest word", () => {
    const wrong = charts
      .map((c) => ({ ...c, axis: binAxis(c.bars, c.granularity) }))
      .filter(({ axis, bars, granularity }) =>
        axis.spans.some(
          (s) =>
            axis.below <
            Math.min(
              DESIGNED_CARD_EM,
              (bars / (s.end - s.start + 1)) *
                LONGEST_LABEL_WORD_EM[granularity]
            )
        )
      )
      .map(
        (c) =>
          `${c.day}, ${c.rangeDays} days: ${c.bars} bars below ${c.axis.below}em`
      );
    expect(wrong).toEqual([]);
  });

  it("gives the labels columns that tile the chart, each holding its bar", () => {
    const wrong = charts
      .map((c) => ({ ...c, axis: binAxis(c.bars, c.granularity) }))
      .filter(({ axis, bars }) => {
        const cols = axis.spans.flatMap((s) =>
          Array.from({ length: s.end - s.start + 1 }, (_, k) => s.start + k)
        );
        return (
          axis.spans.some((s) => s.index < s.start || s.index > s.end) ||
          axis.spans.at(-1)?.index !== bars - 1 ||
          cols.length !== bars ||
          cols.some((col, k) => col !== k)
        );
      })
      .map((c) => `${c.day}, ${c.rangeDays} days: ${c.bars} bars`);
    expect(wrong).toEqual([]);
  });

  it("names every bar at the designed size on the narrowest phone", () => {
    const wrong = charts
      .filter((c) => binAxis(c.bars, c.granularity).below > DESIGNED_CARD_EM)
      .map((c) => `${c.day}, ${c.rangeDays} days`);
    expect(wrong).toEqual([]);
  });

  it("gives every chart a width spelled out for Tailwind", () => {
    const wrong = charts
      .map((c) => binAxis(c.bars, c.granularity))
      .filter(
        ({ below, labels, ends }) =>
          labels !== `@max-[${below}em]:hidden` ||
          ends !== `@max-[${below}em]:flex`
      )
      .map(({ below }) => `${below}em`);
    expect(wrong).toEqual([]);
  });
});
