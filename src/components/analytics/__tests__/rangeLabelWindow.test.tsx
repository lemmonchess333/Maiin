import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PeriodOverview from "../PeriodOverview";

vi.mock("@/hooks/useDistanceUnit", () => ({
  useDistanceUnit: () => "km",
}));

/**
 * The heading over the three summary rings names the window the numbers
 * beneath it cover. History derives that window as `since = today -
 * rangeDays`, so every one of the five ranges is a rolling span ending
 * today — never a calendar week, month or year.
 *
 * Three of the five headings claimed a calendar period anyway. The worst
 * was "1Y": a 365-day trailing window headed "THIS YEAR", which in
 * January would have put eleven months of the previous year under that
 * word. "1W" had the quieter version of the same gap — the app anchors
 * its weeks to Monday, so on any day but Monday the trailing seven days
 * reach into the week before.
 *
 * These tests pin the register rather than the exact strings: a heading
 * over a rolling window may not use a calendar demonstrative, and it has
 * to say how far back the window reaches.
 */

const RANGES = ["1W", "1M", "3M", "6M", "1Y"] as const;

const DAYS: Record<(typeof RANGES)[number], number> = {
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
};

function headingFor(range?: string): string {
  const { unmount } = render(
    <PeriodOverview
      runCount={4}
      runDistance={21.1}
      liftCount={3}
      liftVolume={12400}
      avgCalories={2143}
      nutritionAdherence={87}
      timeRange={range}
      rangeDays={range ? DAYS[range as (typeof RANGES)[number]] : 7}
    />
  );
  const text = screen.getByText(/last/i).textContent ?? "";
  unmount();
  return text;
}

describe("PeriodOverview range heading", () => {
  it.each(RANGES)(
    "%s heads a rolling window, so it makes no calendar claim",
    (range) => {
      const heading = headingFor(range);
      // "This week" / "This Month" / "This Year" all name a calendar
      // period the data does not cover. Any demonstrative is the defect.
      expect(heading).not.toMatch(/\bthis\b/i);
      expect(heading).toMatch(/^Last /);
    }
  );

  it.each(RANGES)("%s says how far back the window reaches", (range) => {
    const heading = headingFor(range);
    // A bare "Last period" would pass the demonstrative check above while
    // telling the reader nothing, so the heading must carry a span.
    expect(heading).toMatch(/\d+ (days|months)/);
  });

  it("gives each range its own heading", () => {
    const headings = RANGES.map(headingFor);
    expect(new Set(headings).size).toBe(RANGES.length);
  });

  it("falls back to the shortest window when the range is absent", () => {
    // `timeRange` is optional on the props. The fallback has to be a real
    // window label, not a calendar claim inherited from the old default.
    expect(headingFor(undefined)).toBe("Last 7 days");
  });

  it("keeps the two headings that already named their window", () => {
    // These needed no change; the fix was the other three matching them.
    expect(headingFor("3M")).toBe("Last 3 months");
    expect(headingFor("6M")).toBe("Last 6 months");
  });
});
