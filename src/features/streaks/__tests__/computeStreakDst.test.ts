// DST regression tests for the streak anchor (Streak1 review C1/C2). These must
// run under a DST-observing timezone, so TZ is pinned to America/New_York at
// module load — before the SUT is imported or any Date is created. Node honours
// a runtime TZ change via tzset, so subsequent Date math uses Eastern time.
process.env.TZ = "America/New_York";

import { describe, it, expect } from "vitest";
import { computeCurrentStreak } from "../useStreaks";

// Guard: if the runtime didn't actually apply America/New_York, the assertions
// below would vacuously pass under UTC and hide a regression. Fail loudly
// instead of skipping so CI surfaces a misconfigured timezone.
describe("DST test environment", () => {
  it("is running under America/New_York (EST=300 / EDT=240)", () => {
    expect(new Date("2026-01-15").getTimezoneOffset()).toBe(300); // EST
    expect(new Date("2026-07-15").getTimezoneOffset()).toBe(240); // EDT
  });
});

describe("computeCurrentStreak — DST anchor safety", () => {
  it("fall-back day (25h): does not collapse a live streak to 0 (C1)", () => {
    // 2026-11-01 is the US fall-back day. Evaluated late in the 25h day, a
    // `now - 86400000` anchor lands back on today's own date and returns 0.
    const now = new Date("2026-11-01T23:30:00");
    const active = new Set([
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
    ]);
    expect(computeCurrentStreak(active, now)).toBe(4);
  });

  it("day after spring-forward (23h): does not skip the anchor day (C2)", () => {
    // 2026-03-08 is the US spring-forward day. Just after midnight on the 9th,
    // a `now - 86400000` anchor jumps two calendar dates back to Mar 7,
    // skipping the genuine most-recent active day (Mar 8) and under-counting.
    const now = new Date("2026-03-09T00:30:00");
    const active = new Set([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
    ]);
    expect(computeCurrentStreak(active, now)).toBe(5);
  });
});
