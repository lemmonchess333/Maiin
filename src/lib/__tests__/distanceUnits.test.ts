/**
 * Distance + pace unit conversion.
 *
 * The one that earns the most attention is PACE, because it converts the
 * opposite way to distance and a mistake there is plausible-looking rather
 * than obviously broken. A mile is longer than a kilometre, so covering one
 * takes LONGER: 5:00/km is 8:03/mi. Dividing instead of multiplying gives
 * 3:06/mi — a number that reads like a pace, sits in the right column, and
 * is wrong by a factor of 2.6. Every pace assertion below therefore states
 * the DIRECTION, not just the arithmetic.
 *
 */
import { describe, it, expect } from "vitest";
import {
  KM_PER_MILE,
  METRES_PER_MILE,
  resolveDistanceUnit,
  distanceIn,
  distanceToMetres,
  distancePresetsM,
  DISTANCE_TARGET_MIN_M,
  DISTANCE_TARGET_MAX_M,
  paceIn,
  distanceUnitLabel,
  paceUnitLabel,
} from "../distanceUnits";

describe("resolveDistanceUnit", () => {
  it("defaults to km for absent, null and unrecognised values", () => {
    // A display helper is the wrong place to throw, and km is the app's
    // default — so anything unexpected reads metric rather than failing.
    expect(resolveDistanceUnit(undefined)).toBe("km");
    expect(resolveDistanceUnit(null)).toBe("km");
    expect(resolveDistanceUnit("")).toBe("km");
    expect(resolveDistanceUnit("miles")).toBe("km");
    expect(resolveDistanceUnit("MI")).toBe("km");
  });

  it("resolves the one stored value that means imperial", () => {
    expect(resolveDistanceUnit("mi")).toBe("mi");
    expect(resolveDistanceUnit("km")).toBe("km");
  });
});

describe("distance", () => {
  it("converts metres to the display unit", () => {
    expect(distanceIn(5000, "km")).toBe(5);
    expect(distanceIn(METRES_PER_MILE, "mi")).toBe(1);
  });

  it("a marathon is 42.195 km and 26.2 miles", () => {
    // The number every runner already knows — a conversion that gets this
    // wrong is wrong in a way the audience notices immediately.
    expect(distanceIn(42195, "km")).toBeCloseTo(42.195, 3);
    expect(distanceIn(42195, "mi")).toBeCloseTo(26.2187, 3);
  });


  it("treats non-finite input as zero rather than propagating NaN", () => {
    expect(distanceIn(NaN, "mi")).toBe(0);
  });
});

describe("distanceToMetres — the direction that reaches storage", () => {
  it("round-trips with distanceIn in both units", () => {
    /* The pair has to be exact, because one is a read and the other is a
       write: a mismatch does not show up as a wrong label, it shows up as
       a wrong stored value that then renders correctly forever. */
    for (const unit of ["km", "mi"] as const) {
      for (const metres of [500, 1000, 5000, 42195]) {
        expect(distanceToMetres(distanceIn(metres, unit), unit)).toBeCloseTo(
          metres,
          6
        );
      }
    }
  });

  it("a typed 3.1 miles is 4989 m, not 3100", () => {
    // The concrete failure it prevents: treating the typed number as km.
    expect(distanceToMetres(3.1, "mi")).toBeCloseTo(4989, 0);
    expect(distanceToMetres(3.1, "km")).toBe(3100);
  });

  it("treats unusable input as zero rather than storing NaN", () => {
    expect(distanceToMetres(NaN, "mi")).toBe(0);
    expect(distanceToMetres(Infinity, "km")).toBe(0);
  });
});

describe("distancePresetsM — round numbers in the READER's unit", () => {
  it("metric presets are the round kilometres they always were", () => {
    expect(distancePresetsM("km")).toEqual([1000, 3000, 5000, 10000]);
  });

  it("imperial presets are round MILES, not converted kilometres", () => {
    /* The point of the whole helper. Converting the metric set would give
       0.62 / 1.86 / 3.11 / 6.21 miles — correct arithmetic, useless as
       one-tap presets. */
    const mi = distancePresetsM("mi");
    expect(mi.map((m) => distanceIn(m, "mi"))).toEqual([1, 3, 5, 10]);
    expect(mi[0]).toBeCloseTo(1609.344, 3);
  });

  it("both sets are in METRES, because that is what the target stores", () => {
    for (const unit of ["km", "mi"] as const) {
      for (const m of distancePresetsM(unit)) expect(m).toBeGreaterThan(900);
    }
  });
});

describe("the target bounds are absolute, not per-unit", () => {
  it("clamps the same real distance whichever unit was typed", () => {
    /* An imperial reader must not get a 160 km ceiling because "100" is
       round in their box — the bound is a fact about how far someone can
       plausibly set out to run. */
    expect(distanceToMetres(100, "mi")).toBeGreaterThan(DISTANCE_TARGET_MAX_M);
    expect(distanceToMetres(62, "mi")).toBeLessThan(DISTANCE_TARGET_MAX_M);
    expect(DISTANCE_TARGET_MIN_M).toBe(500);
  });
});

describe("pace — the direction that is easy to get backwards", () => {
  it("a mile pace is SLOWER than the same effort per km", () => {
    /* The core assertion. 5:00/km = 300 s; per mile it must be LARGER,
       because a mile is longer. A divide would give 186 s (3:06/mi) — a
       plausible-looking number that is badly wrong. */
    const perKm = 300;
    const perMile = paceIn(perKm, "mi");
    expect(perMile).toBeGreaterThan(perKm);
    expect(perMile).toBeCloseTo(300 * KM_PER_MILE, 6); // 482.8 s = 8:03/mi
  });

  it("5:00/km is 8:03/mi to the second", () => {
    // Pinned against the figure a pace chart would give, so the constant
    // can't drift into an approximation.
    expect(Math.round(paceIn(300, "mi"))).toBe(483);
  });

  it("is the identity for km", () => {
    expect(paceIn(300, "km")).toBe(300);
  });


  it("passes the no-pace sentinels through untouched", () => {
    /* Every formatter downstream tests `<= 0` to render "--:--" / "—".
       Converting 0 to some other non-positive number, or NaN to a number,
       would turn "no pace yet" into a displayed pace. */
    expect(paceIn(0, "mi")).toBe(0);
    expect(paceIn(-1, "mi")).toBe(-1);
    expect(Number.isNaN(paceIn(NaN, "mi"))).toBe(true);
  });
});


describe("labels", () => {
  it("distance and pace suffixes track the unit", () => {
    expect(distanceUnitLabel("km")).toBe("km");
    expect(distanceUnitLabel("mi")).toBe("mi");
    expect(paceUnitLabel("km")).toBe("/km");
    expect(paceUnitLabel("mi")).toBe("/mi");

  });

});
