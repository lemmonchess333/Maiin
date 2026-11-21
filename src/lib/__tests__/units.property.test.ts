import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assertProperty } from "@/test/property";
import {
  LB_PER_KG,
  kgToLb,
  kgToStonePounds,
  lbToKg,
  stonePoundsToKg,
} from "../weightUnits";
import {
  KM_PER_MILE,
  distanceIn,
  distanceToMetres,
  paceIn,
  type DistanceUnit,
} from "../distanceUnits";
import {
  GLASS_ML,
  clampMl,
  resolveConsumedMl,
  waterProgress,
} from "../waterUnits";
import { getDistanceTargetMeters } from "../runConfigUnits";
import { loadIn, loadToKg, wholeLoadIn, type LiftUnit } from "../liftLoad";

/**
 * Unit conversions as properties: a value converted and converted back is
 * the value, and a figure rounded for the screen rounds to itself again.
 * Float arithmetic is not exact, so a round trip of the raw conversion is
 * held to a relative tolerance, and the display rounding to exact
 * equality, which is what a person sees.
 */

const close = (a: number, b: number, rel = 1e-12) =>
  Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));

/** A body weight or a load in kg, from nothing to a heavy deadlift. */
const kg = fc.double({
  min: 0,
  max: 500,
  noNaN: true,
  noDefaultInfinity: true,
});
/** A count of tenths, for a figure typed to one decimal. */
const tenths = (max: number) => fc.integer({ min: 0, max: max * 10 });
const metres = fc.double({
  min: 0,
  max: 300_000,
  noNaN: true,
  noDefaultInfinity: true,
});
const unit = fc.constantFrom<DistanceUnit>("km", "mi");
const liftUnit = fc.constantFrom<LiftUnit>("kg", "lbs");

describe("body weight", () => {
  it("kg to lb and back is the same kg", () => {
    assertProperty(
      fc.property(kg, (w) => {
        expect(close(lbToKg(kgToLb(w)), w)).toBe(true);
        expect(close(kgToLb(lbToKg(w)), w)).toBe(true);
      })
    );
  });

  it("converting keeps the order, at LB_PER_KG to the kilogram", () => {
    assertProperty(
      fc.property(kg, kg, (a, b) => {
        // Not strictly: two kilo figures a float apart can land on one lb.
        if (a <= b) expect(kgToLb(a)).toBeLessThanOrEqual(kgToLb(b));
        expect(close(kgToLb(a), a * LB_PER_KG)).toBe(true);
      })
    );
  });

  it("stone and pounds: pounds stay under a stone and add up to the tenth of a pound", () => {
    assertProperty(
      fc.property(kg, (w) => {
        const { stone, pounds } = kgToStonePounds(w);
        expect(Number.isInteger(stone)).toBe(true);
        expect(stone).toBeGreaterThanOrEqual(0);
        expect(pounds).toBeGreaterThanOrEqual(0);
        expect(pounds).toBeLessThan(14);
        // The two parts are the weight in lb to the tenth.
        expect(
          Math.round((stone * 14 + pounds) * 10) - Math.round(kgToLb(w) * 10)
        ).toBe(0);
      })
    );
  });

  it("a weight typed in stone and pounds reads back as typed", () => {
    assertProperty(
      fc.property(
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 139 }),
        (stone, poundTenths) => {
          const pounds = poundTenths / 10;
          expect(kgToStonePounds(stonePoundsToKg(stone, pounds))).toEqual({
            stone,
            pounds,
          });
        }
      )
    );
  });
});

describe("distance and pace", () => {
  it("metres to the unit and back are the same metres", () => {
    assertProperty(
      fc.property(metres, unit, (m, u) => {
        expect(close(distanceToMetres(distanceIn(m, u), u), m)).toBe(true);
      })
    );
  });

  it("a mile is longer than a kilometre for every distance", () => {
    assertProperty(
      fc.property(metres, (m) => {
        expect(distanceIn(m, "mi")).toBeLessThanOrEqual(distanceIn(m, "km"));
      })
    );
  });

  it("distance times pace is the same duration in either unit", () => {
    assertProperty(
      fc.property(
        metres,
        fc.double({ min: 120, max: 1200, noNaN: true }),
        (m, secPerKm) => {
          const km = distanceIn(m, "km") * paceIn(secPerKm, "km");
          const mi = distanceIn(m, "mi") * paceIn(secPerKm, "mi");
          expect(close(km, mi, 1e-9)).toBe(true);
          expect(close(paceIn(secPerKm, "mi") / secPerKm, KM_PER_MILE)).toBe(
            true
          );
        }
      )
    );
  });

  it("a distance target set in either unit reads back as the distance set; a pace or time target is no distance", () => {
    assertProperty(
      fc.property(
        fc.constantFrom("time", "pace", "open"),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom<DistanceUnit>("km", "mi"),
        (other, picked, u) => {
          // The setup picker stores what was picked, in the reader's
          // unit, as metres; the audio cues read it back.
          const metres = distanceToMetres(picked, u);
          const read = getDistanceTargetMeters({
            type: "distance",
            value: metres,
          });
          expect(close(distanceIn(read, u), picked)).toBe(true);
          expect(getDistanceTargetMeters({ type: other, value: metres })).toBe(
            0
          );
        }
      )
    );
  });
});

describe("water", () => {
  it("a logged amount is a whole, non-negative number of ml, and clamping it again changes nothing", () => {
    assertProperty(
      fc.property(fc.double({ noNaN: false }), (ml) => {
        const v = clampMl(ml);
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(clampMl(v)).toBe(v);
      })
    );
  });

  it("an older glasses count reads as the ml it was", () => {
    assertProperty(
      fc.property(fc.integer({ min: 0, max: 40 }), (glasses) => {
        expect(resolveConsumedMl({ glasses })).toBe(glasses * GLASS_ML);
        expect(resolveConsumedMl({ ml: glasses * GLASS_ML, glasses: 99 })).toBe(
          glasses * GLASS_ML
        );
      })
    );
  });

  it("progress is between 0 and 1, and more water is never less progress", () => {
    assertProperty(
      fc.property(
        fc.integer({ min: -500, max: 6000 }),
        fc.integer({ min: 0, max: 6000 }),
        fc.integer({ min: 1, max: 6000 }),
        (ml, more, target) => {
          const p = waterProgress(ml, target);
          expect(p).toBeGreaterThanOrEqual(0);
          expect(p).toBeLessThanOrEqual(1);
          expect(waterProgress(ml + more, target)).toBeGreaterThanOrEqual(p);
        }
      )
    );
  });
});

describe("lifting loads", () => {
  it("a load typed to the tenth of a pound reads back as typed", () => {
    assertProperty(
      fc.property(tenths(1500), (t) => {
        const typed = t / 10;
        expect(loadIn(loadToKg(typed, "lbs"), "lbs")).toBe(typed);
      })
    );
  });

  it("a load typed to the hundredth of a kilo reads back as typed", () => {
    assertProperty(
      fc.property(fc.integer({ min: 0, max: 50_000 }), (hundredths) => {
        const typed = hundredths / 100;
        expect(loadIn(loadToKg(typed, "kg"), "kg")).toBe(typed);
      })
    );
  });

  it("the figure on screen, typed back in, shows the same figure", () => {
    assertProperty(
      fc.property(kg, liftUnit, (w, u) => {
        const shown = loadIn(w, u);
        expect(loadIn(loadToKg(shown, u), u)).toBe(shown);
      })
    );
  });

  it("the shown load is within half its last digit of the exact conversion", () => {
    assertProperty(
      fc.property(kg, liftUnit, (w, u) => {
        const exact = u === "lbs" ? kgToLb(w) : w;
        const step = u === "lbs" ? 0.1 : 0.01;
        expect(Math.abs(loadIn(w, u) - exact)).toBeLessThanOrEqual(
          step / 2 + 1e-9
        );
        expect(Math.abs(wholeLoadIn(w, u) - exact)).toBeLessThanOrEqual(
          0.5 + 1e-9
        );
      })
    );
  });
});
