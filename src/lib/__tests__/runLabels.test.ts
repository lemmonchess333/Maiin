/**
 * Tests for the run-display label helpers extracted from Run.tsx
 * and ProgrammeRunSection.tsx.
 *
 * These were previously duplicated across consumers; pinning the
 * shared module's contract keeps Run / RunSummary / Programme /
 * History agreement on how pace, duration, distance, and race-
 * distance enums render.
 *
 * UNITS. Every formatter takes an explicit unit and every metric case below
 * has a miles twin, because the two directions are easy to get backwards and
 * a wrong one looks plausible: a mile is LONGER, so a mile takes longer, so
 * pace MULTIPLIES where distance divides. The miles expectations here are
 * written as literals rather than computed from `paceIn` — a test that
 * derives its expectation from the code under test pins consistency, not
 * behaviour, which is a shape this repo has been caught by before.
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
  distanceValue,
  distanceLabel2,
  nearDistanceLabel,
  elevationLabel,
} from "../runLabels";

describe("paceLabel", () => {
  it("formats sub-minute pace as M:SS/km", () => {
    expect(paceLabel(45, "km")).toBe("0:45/km");
  });

  it("formats whole-minute pace with zero seconds padded", () => {
    expect(paceLabel(300, "km")).toBe("5:00/km");
  });

  it("zero-pads single-digit seconds", () => {
    /* 5:05 not 5:5 — the zero-padding is the contract. */
    expect(paceLabel(305, "km")).toBe("5:05/km");
  });

  it("rounds the seconds component to the nearest second", () => {
    /* 304.6s should round to 5:05, not 5:04. */
    expect(paceLabel(304.6, "km")).toBe("5:05/km");
  });

  it("returns the em-dash placeholder for zero pace", () => {
    /* Stationary or zero-distance leg — don't display 0:00/km. */
    expect(paceLabel(0, "km")).toBe("—");
    expect(paceLabel(0, "mi")).toBe("—");
  });

  it("returns the em-dash placeholder for negative pace (defensive)", () => {
    expect(paceLabel(-30, "km")).toBe("—");
    expect(paceLabel(-30, "mi")).toBe("—");
  });

  it("returns the em-dash placeholder for NaN (multiplication by zero)", () => {
    /* divisions by zero distance up the call chain show up as
       NaN. The truthiness check at the top catches it. */
    expect(paceLabel(NaN, "km")).toBe("—");
    expect(paceLabel(NaN, "mi")).toBe("—");
  });

  it("converts to a SLOWER number per mile, with the /mi suffix", () => {
    /* The direction check. 5:00/km is 8:03/mi — if this ever reads 3:06
       the conversion has been inverted, which is the failure mode the
       whole module exists to prevent. */
    expect(paceLabel(300, "mi")).toBe("8:03/mi");
    expect(paceLabel(240, "mi")).toBe("6:26/mi");
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
    expect(distanceLabel(5000, "km")).toBe("5.0 km");
  });

  it("formats sub-km distances with one decimal", () => {
    expect(distanceLabel(750, "km")).toBe("0.8 km");
  });

  it("formats fractional km distances", () => {
    expect(distanceLabel(10500, "km")).toBe("10.5 km");
  });

  it("returns em-dash for zero distance", () => {
    expect(distanceLabel(0, "km")).toBe("—");
    expect(distanceLabel(0, "mi")).toBe("—");
  });

  it("returns em-dash for negative distance (defensive)", () => {
    expect(distanceLabel(-100, "km")).toBe("—");
    expect(distanceLabel(-100, "mi")).toBe("—");
  });

  it("converts to a SMALLER number of miles, with the mi suffix", () => {
    /* Opposite direction to pace, from the same metres. */
    expect(distanceLabel(5000, "mi")).toBe("3.1 mi");
    expect(distanceLabel(1609.344, "mi")).toBe("1.0 mi");
    expect(distanceLabel(42195, "mi")).toBe("26.2 mi");
  });
});

describe("distanceValue / distanceLabel2 / nearDistanceLabel", () => {
  it("distanceValue is the bare number, at the caller's precision", () => {
    expect(distanceValue(5000, "km")).toBe("5.0");
    expect(distanceValue(5000, "km", 2)).toBe("5.00");
    expect(distanceValue(5000, "mi", 2)).toBe("3.11");
  });

  it("distanceValue renders zero rather than a placeholder", () => {
    /* The opposite choice to distanceLabel, on purpose: a caller drawing
       the unit as a separate element wants "0.00" under its "KM" caption,
       not an em-dash that leaves the caption dangling. */
    expect(distanceValue(0, "km", 2)).toBe("0.00");
    expect(distanceValue(NaN, "mi", 2)).toBe("0.00");
  });

  it("distanceLabel2 keeps the em-dash guard the one-decimal form has", () => {
    expect(distanceLabel2(5000, "km")).toBe("5.00 km");
    expect(distanceLabel2(5000, "mi")).toBe("3.11 mi");
    expect(distanceLabel2(0, "mi")).toBe("—");
  });

  it("nearDistanceLabel drops to metres, and to FEET for miles", () => {
    /* Under the switch a fraction of a mile stops being readable, which is
       the same judgement the metric code already made by falling back to
       metres — this only gives the imperial reader the equivalent instead
       of handing them metres. 350 m is 1148 ft, rounded to 1150. */
    expect(nearDistanceLabel(350, "km", "to go")).toBe("350 m to go");
    expect(nearDistanceLabel(350, "mi", "to go")).toBe("1150 ft to go");
  });

  it("nearDistanceLabel switches at the reader's OWN unit boundary", () => {
    /* 1200 m is past a kilometre but short of a mile, so the two readers
       are legitimately on different sides of the switch at the same
       distance. A shared 1000 m threshold would print "3940 ft". */
    expect(nearDistanceLabel(1200, "km", "to go")).toBe("1.2 km to go");
    expect(nearDistanceLabel(1200, "mi", "to go")).toBe("3940 ft to go");
    expect(nearDistanceLabel(2000, "mi", "to go")).toBe("1.2 mi to go");
  });

  it("nearDistanceLabel omits the phrase when there isn't one", () => {
    expect(nearDistanceLabel(350, "km")).toBe("350 m");
  });
});

describe("elevationLabel", () => {
  it("is metres for a metric reader and FEET for an imperial one", () => {
    /* 120 m is 393.7 ft. Elevation converts like a distance — divide — not
       like a pace; a hill is not taller because you measure it in feet. */
    expect(elevationLabel(120, "km")).toBe("120m");
    expect(elevationLabel(120, "mi")).toBe("394ft");
  });

  it("rounds AFTER converting, so metres stay the stored whole number", () => {
    expect(elevationLabel(120.4, "km")).toBe("120m");
    expect(elevationLabel(1, "mi")).toBe("3ft");
  });

  it("renders a flat run as zero, not a placeholder", () => {
    /* Zero climb is information — the run was flat. An em-dash would read
       as "we don't know", which is a different claim. */
    expect(elevationLabel(0, "km")).toBe("0m");
    expect(elevationLabel(0, "mi")).toBe("0ft");
  });

  it("can omit the suffix for callers that render it separately", () => {
    expect(elevationLabel(120, "mi", false)).toBe("394");
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
    expect(paceMinSec(300, "km")).toBe("5:00");
    expect(paceMinSec(330, "km")).toBe("5:30");
    expect(paceMinSec(65, "km")).toBe("1:05");
    expect(paceMinSec(359, "km")).toBe("5:59");
  });

  it("returns the em-dash placeholder for missing / non-positive pace", () => {
    expect(paceMinSec(0, "km")).toBe("--:--");
    expect(paceMinSec(-5, "km")).toBe("--:--");
    expect(paceMinSec(NaN, "km")).toBe("--:--");
    expect(paceMinSec(0, "mi")).toBe("--:--");
    expect(paceMinSec(NaN, "mi")).toBe("--:--");
  });

  it("never renders a :60 seconds component", () => {
    /* The minutes were floored while the seconds were rounded, so the two
       could disagree. Whole seconds per km never triggered it; converting
       to miles produces fractions and does — 298 s/km (4:58/km, entirely
       ordinary) is 479.58 s/mi and used to print "7:60". Five paces
       between 2:30/km and 15:00/km hit it. Rounding the TOTAL first is the
       fix; these are the exact offenders, plus a sweep so a regression
       can't hide at a pace nobody thought to list. */
    expect(paceMinSec(298, "mi")).toBe("8:00");
    expect(paceMinSec(410, "mi")).toBe("11:00");
    expect(paceMinSec(559, "mi")).toBe("15:00");

    const offenders: string[] = [];
    for (let secPerKm = 100; secPerKm <= 1200; secPerKm++) {
      for (const unit of ["km", "mi"] as const) {
        const out = paceMinSec(secPerKm, unit);
        if (/:(6\d|\d{3})$/.test(out)) offenders.push(`${secPerKm} ${unit} -> ${out}`);
      }
    }
    expect(offenders, "seconds component must stay 00–59").toEqual([]);
  });
});

// Band-first session pace display (Runna teardown #2) — one rule for every
// surface that shows a personalized pace: the range leads, singles are the
// race-pace fallback, null means "omit the pill".
describe("paceBandLabel / sessionPaceDisplay", () => {
  it("formats a band as fast–slow with one unit", () => {
    expect(paceBandLabel([325, 345], "km")).toBe("5:25–5:45 /km");
    expect(paceBandLabel([325, 345], "mi")).toBe("8:43–9:15 /mi");
  });

  it("band wins over singles; singles are the fallback; empty is null", () => {
    expect(
      sessionPaceDisplay({ targetPace: 335, band: [325, 345] }, "km")
    ).toBe("5:25–5:45 /km");
    expect(sessionPaceDisplay({ targetPace: 335 }, "km")).toBe("5:35 /km");
    expect(sessionPaceDisplay({ workPace: 300 }, "km")).toBe("5:00 /km");
    expect(sessionPaceDisplay({}, "km")).toBeNull();
    expect(sessionPaceDisplay({}, "mi")).toBeNull();
  });

  it("carries the unit through every branch, not just the band", () => {
    /* Each branch formats separately, so each needs its own proof — a
       converted band beside an unconverted single would be worse than
       either alone. */
    expect(
      sessionPaceDisplay({ targetPace: 335, band: [325, 345] }, "mi")
    ).toBe("8:43–9:15 /mi");
    expect(sessionPaceDisplay({ targetPace: 335 }, "mi")).toBe("8:59 /mi");
    expect(sessionPaceDisplay({ workPace: 300 }, "mi")).toBe("8:03 /mi");
  });
});

// finishTimeLabel — race-result clock style (m:ss / h:mm:ss), distinct from
// durationLabel's "1h 05m" prose. A finish TIME is unit-free: the same race
// takes the same time whichever unit its distance is read in.
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
