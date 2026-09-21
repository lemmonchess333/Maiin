import { describe, it, expect } from "vitest";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import {
  AVERAGE_MAX_WEEKS,
  activeWeeksForAverage,
  averageCaption,
  averagePerformanceIndex,
  averageWeekCount,
  isActiveWeek,
  rollingAverageSeries,
} from "@/lib/performanceAverage";

/**
 * P2d's average, which shipped as a different number under its own name.
 *
 * The lock pins two properties by hand, and the card on the Performance
 * tab had neither: the window is "available weeks up to 12" so the label
 * must name what it actually covered, and only weeks at `confidence >=
 * medium` count, so a return-from-break user is not dragged down by the
 * weeks they were away.
 *
 * The fixtures carry no dates. Nothing here reads a clock — the window
 * is a count of documents, not a span of time — so there is nothing for
 * `unit-future` to age out.
 */
function week(
  pi: number,
  confidence?: "high" | "medium" | "low"
): PerformanceWeekDoc {
  return {
    weekKey: `w${pi}`,
    performanceIndex: pi,
    ...(confidence ? { confidence } : {}),
  } as unknown as PerformanceWeekDoc;
}

describe("which weeks count", () => {
  it("counts high and medium", () => {
    expect(isActiveWeek(week(50, "high"))).toBe(true);
    expect(isActiveWeek(week(50, "medium"))).toBe(true);
  });

  it("does not count low — that is the inactive read", () => {
    expect(isActiveWeek(week(50, "low"))).toBe(false);
  });

  it("counts a week with no confidence stored at all", () => {
    /* Absent is not low. The field post-dates the earliest documents,
       and treating missing as inactive would empty the average for
       every account whose history predates it. */
    expect(isActiveWeek(week(50))).toBe(true);
  });
});

describe("the figure, and the window it actually covers", () => {
  it("averages the active weeks and says how many there were", () => {
    const weeks = [week(40, "high"), week(60, "high"), week(80, "medium")];
    expect(averagePerformanceIndex(weeks)).toBe(60);
    expect(averageWeekCount(weeks)).toBe(3);
  });

  it("leaves the inactive weeks out of BOTH the value and the count", () => {
    /* The defect, in one assertion. Averaging all four gives 45 over
       "12 weeks"; averaging the two active ones gives 80 over 2. */
    const weeks = [
      week(80, "high"),
      week(0, "low"),
      week(0, "low"),
      week(80, "high"),
    ];
    expect(averagePerformanceIndex(weeks)).toBe(80);
    expect(averageWeekCount(weeks)).toBe(2);
  });

  it("is null, not zero, when nothing qualifies", () => {
    expect(averagePerformanceIndex([week(70, "low")])).toBeNull();
    expect(averagePerformanceIndex([])).toBeNull();
    expect(averageWeekCount([week(70, "low")])).toBe(0);
  });

  it("caps the window at twelve and takes the MOST RECENT twelve", () => {
    /* Fourteen weeks: four at 0, then ten at 100. A window anchored at
       the wrong end would average the old ones in. */
    const weeks = [
      ...Array.from({ length: 4 }, () => week(0, "high")),
      ...Array.from({ length: 10 }, () => week(100, "high")),
    ];
    expect(activeWeeksForAverage(weeks)).toHaveLength(AVERAGE_MAX_WEEKS);
    // 12 most recent = two 0s and ten 100s → 1000/12 ≈ 83.
    expect(averagePerformanceIndex(weeks)).toBe(83);
  });

  it("holds the window at the lock's twelve", () => {
    expect(AVERAGE_MAX_WEEKS).toBe(12);
  });
});

describe("the dashed line's series", () => {
  it("is a trailing mean, one value per week", () => {
    const series = rollingAverageSeries([
      week(60, "high"),
      week(80, "high"),
      week(40, "high"),
    ]);
    // 60 · (60+80)/2 · (60+80+40)/3
    expect(series).toEqual([60, 70, 60]);
  });

  it("carries the baseline through an inactive week rather than dipping", () => {
    /* A silent week is not a performance of zero, and a line that dived
       to the floor for it would say exactly that. */
    const series = rollingAverageSeries([
      week(80, "high"),
      week(0, "low"),
      week(80, "high"),
    ]);
    expect(series).toEqual([80, 80, 80]);
  });

  it("has no value before the first active week", () => {
    /* null, which Recharts leaves as a gap. A 0 here would draw the
       line along the axis floor and read as a real baseline. */
    const series = rollingAverageSeries([week(0, "low"), week(50, "high")]);
    expect(series[0]).toBeNull();
    expect(series[1]).toBe(50);
  });

  it("drops out of the trailing window past twelve weeks", () => {
    /* Thirteen weeks: one at 0, then twelve at 100. The final point's
       window must have pushed the 0 out — an expanding mean would keep
       it and land on 92. */
    const weeks = [
      week(0, "high"),
      ...Array.from({ length: 12 }, () => week(100, "high")),
    ];
    const series = rollingAverageSeries(weeks);
    expect(series[series.length - 1]).toBe(100);
  });

  it("returns one value per input week, whatever they are", () => {
    const weeks = [week(10, "high"), week(20, "low"), week(30)];
    expect(rollingAverageSeries(weeks)).toHaveLength(weeks.length);
  });
});

describe("the caption names the window it used", () => {
  it("says 'active weeks', which is what makes the number defensible", () => {
    expect(averageCaption(72, 9)).toBe(
      "Average 72 over your last 9 active weeks"
    );
  });

  it("does not say 'weeks' for one", () => {
    expect(averageCaption(72, 1)).toBe(
      "Average 72 over your last 1 active week"
    );
  });
});
