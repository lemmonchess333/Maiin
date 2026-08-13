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
