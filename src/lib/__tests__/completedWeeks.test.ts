/**
 * The distance sparkline on the Running tile fell off a cliff at its
 * right edge, and nothing had gone wrong with the running.
 *
 * Both weekly axes on Analytics walk to `startOfLocalWeek(today)`, so
 * their final bucket is the week currently being lived. On a Monday it
 * holds one day. Mapped onto the tile, a 52 km month drew as a collapse.
 *
 * The pair that matters here is order-and-end: a helper that dropped the
 * FIRST bucket, or dropped nothing, would satisfy a length check alone.
 * So the shape assertions name which element went.
 */
import { describe, it, expect, vi } from "vitest";
import { completedWeeklySeries } from "@/lib/completedWeeks";

const KEYS = [
  "2026-08-24",
  "2026-08-31",
  "2026-09-07",
  "2026-09-14",
  "2026-09-21",
];
const VALUES: Record<string, number> = {
  "2026-08-24": 11,
  "2026-08-31": 14,
  "2026-09-07": 9,
  "2026-09-14": 18,
  "2026-09-21": 3, // the week in progress — one Monday run
};
const lookup = (k: string) => VALUES[k] ?? 0;

describe("completedWeeklySeries", () => {
  it("drops the current week and keeps the rest in order", () => {
    expect(completedWeeklySeries(KEYS, lookup)).toEqual([11, 14, 9, 18]);
  });

  it("drops the LAST bucket, not the first", () => {
    /* The assertion a length check cannot make. Dropping the oldest week
       leaves the cliff exactly where it was and quietly loses the
       earliest data as well. */
    const out = completedWeeklySeries(KEYS, lookup);
    expect(out[0]).toBe(11);
    expect(out).not.toContain(3);
  });

  it("never reads the dropped week's value", () => {
    /* The drop happens BEFORE the lookup, so a caller cannot compute a
       figure for the partial week and discard it somewhere else — the
       shape this helper takes its arguments in is the point. */
    const spy = vi.fn(lookup);
    completedWeeklySeries(KEYS, spy);
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy.mock.calls.map(([k]) => k)).not.toContain("2026-09-21");
  });

  it("returns nothing when the window holds only the current week", () => {
    /* A one-week range, or an account opened this week. The tile renders
       no sparkline below three points, so this is a drawn-nothing rather
       than a flat line at zero — which would assert a week of rest that
       has not happened yet. */
    expect(completedWeeklySeries(["2026-09-21"], lookup)).toEqual([]);
  });

  it("survives an empty window", () => {
    expect(completedWeeklySeries([], lookup)).toEqual([]);
  });

  it("keeps a genuine zero week", () => {
    /* Distance is a count metric: a completed week with no runs really
       is 0 km, and the valley is the consistency story the sparkline
       exists to tell. Only the UNFINISHED week goes. */
    const keys = ["2026-08-24", "2026-08-31", "2026-09-21"];
    expect(
      completedWeeklySeries(keys, (k) => (k === "2026-08-31" ? 0 : 11))
    ).toEqual([11, 0]);
  });
});
