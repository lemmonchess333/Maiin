/**
 * Tests for the run-display label helpers extracted from Run.tsx
 * and ProgrammeRunSection.tsx.
 *
 * These were previously duplicated across consumers; pinning the
 * shared module's contract keeps Run / RunSummary / Programme /
 * History agreement on how pace, duration, distance, and race-
 * distance enums render.
 */
import { describe, it, expect } from "vitest";
import {
  paceLabel,
  durationLabel,
  distanceLabel,
  formatRaceDistance,
  paceMinSec,
  paceBandLabel,
  sessionPaceDisplay,
  finishTimeLabel,
} from "../runLabels";

describe("paceLabel", () => {
  it("formats sub-minute pace as M:SS/km", () => {
    expect(paceLabel(45)).toBe("0:45/km");
  });

  it("formats whole-minute pace with zero seconds padded", () => {
    expect(paceLabel(300)).toBe("5:00/km");
  });

  it("zero-pads single-digit seconds", () => {
    /* 5:05 not 5:5 — the zero-padding is the contract. */
    expect(paceLabel(305)).toBe("5:05/km");
  });

  it("rounds the seconds component to the nearest second", () => {
    /* 304.6s should round to 5:05, not 5:04. */
    expect(paceLabel(304.6)).toBe("5:05/km");
  });

  it("returns the em-dash placeholder for zero pace", () => {
    /* Stationary or zero-distance leg — don't display 0:00/km. */
    expect(paceLabel(0)).toBe("—");
  });

  it("returns the em-dash placeholder for negative pace (defensive)", () => {
    expect(paceLabel(-30)).toBe("—");
  });

  it("returns the em-dash placeholder for NaN (multiplication by zero)", () => {
    /* divisions by zero distance up the call chain show up as
       NaN. The truthiness check at the top catches it. */
    expect(paceLabel(NaN)).toBe("—");
  });
});

describe("durationLabel", () => {
  it("formats sub-hour durations as M:SS", () => {
    expect(durationLabel(125)).toBe("2:05");
    expect(durationLabel(59)).toBe("0:59");
  });

  it("formats 59:59 still as M:SS", () => {
    /* Exact one-hour boundary — 3599s is still under 60 minutes,
       so M:SS. */
    expect(durationLabel(3599)).toBe("59:59");
  });

  it("flips to 'Hh MMm' at exactly 60 minutes", () => {
    expect(durationLabel(3600)).toBe("1h 00m");
  });

  it("formats multi-hour durations correctly", () => {
    /* 2h 30m 0s = 9000s; the seconds component is dropped in
       the hour branch (match the existing implementation). */
    expect(durationLabel(9000)).toBe("2h 30m");
  });

  it("zero-pads the minute component over 1h", () => {
    /* 1h 05m not 1h 5m. */
    expect(durationLabel(3905)).toBe("1h 05m");
  });

  it("formats zero as 0:00", () => {
    expect(durationLabel(0)).toBe("0:00");
  });
});

describe("distanceLabel", () => {
  it("formats whole-km distances", () => {
    expect(distanceLabel(5000)).toBe("5.0 km");
  });

  it("formats sub-km distances with one decimal", () => {
    expect(distanceLabel(750)).toBe("0.8 km");
  });

  it("formats fractional km distances", () => {
    expect(distanceLabel(10500)).toBe("10.5 km");
  });

  it("returns em-dash for zero distance", () => {
    expect(distanceLabel(0)).toBe("—");
  });

  it("returns em-dash for negative distance (defensive)", () => {
    expect(distanceLabel(-100)).toBe("—");
  });
});

describe("formatRaceDistance", () => {
  it("maps known enum values to canonical labels", () => {
    expect(formatRaceDistance("5k")).toBe("5K");
    expect(formatRaceDistance("10k")).toBe("10K");
    expect(formatRaceDistance("half")).toBe("Half Marathon");
    expect(formatRaceDistance("marathon")).toBe("Marathon");
  });

  it("returns empty string for undefined", () => {
    expect(formatRaceDistance(undefined)).toBe("");
  });

  it("falls back to UPPERCASE for unknown values", () => {
    /* A future distance added to the enum but not yet mapped
       still displays legibly. */
    expect(formatRaceDistance("ultra")).toBe("ULTRA");
    expect(formatRaceDistance("50k")).toBe("50K");
  });

  it("returns empty string for empty string", () => {
    expect(formatRaceDistance("")).toBe("");
  });
});

// paceMinSec — bare M:SS pace formatter (no "/km" suffix). Run paces are integer
// seconds; the em-dash guard covers stationary / zero-distance legs.
describe("paceMinSec", () => {
  it("formats whole-minute and sub-minute paces with zero-padded seconds", () => {
    expect(paceMinSec(300)).toBe("5:00");
    expect(paceMinSec(330)).toBe("5:30");
    expect(paceMinSec(65)).toBe("1:05");
    expect(paceMinSec(359)).toBe("5:59");
  });

  it("returns the em-dash placeholder for missing / non-positive pace", () => {
    expect(paceMinSec(0)).toBe("--:--");
    expect(paceMinSec(-5)).toBe("--:--");
    expect(paceMinSec(NaN)).toBe("--:--");
  });
});

// Band-first session pace display (Runna teardown #2) — one rule for every
// surface that shows a personalized pace: the range leads, singles are the
// race-pace fallback, null means "omit the pill".
describe("paceBandLabel / sessionPaceDisplay", () => {
  it("formats a band as fast\u2013slow with one unit", () => {
    expect(paceBandLabel([325, 345])).toBe("5:25\u20135:45 /km");
  });

  it("band wins over singles; singles are the fallback; empty is null", () => {
    expect(sessionPaceDisplay({ targetPace: 335, band: [325, 345] })).toBe(
      "5:25\u20135:45 /km"
    );
    expect(sessionPaceDisplay({ targetPace: 335 })).toBe("5:35 /km");
    expect(sessionPaceDisplay({ workPace: 300 })).toBe("5:00 /km");
    expect(sessionPaceDisplay({})).toBeNull();
  });
});

// finishTimeLabel — race-result clock style (m:ss / h:mm:ss), distinct from
// durationLabel's "1h 05m" prose.
describe("finishTimeLabel", () => {
  it("formats sub-hour and over-hour times", () => {
    expect(finishTimeLabel(1500)).toBe("25:00");
    expect(finishTimeLabel(3661)).toBe("1:01:01");
  });
  it("guards non-positive input", () => {
    expect(finishTimeLabel(0)).toBe("--:--");
    expect(finishTimeLabel(NaN)).toBe("--:--");
  });
});
