import { describe, it, expect } from "vitest";
import { loggedFill } from "../calorieRingFill";

/**
 * The one rule for how full the calorie wheel and the macro bars are
 * drawn: what is logged, whichever way the number beside them counts
 * (Food11 call 5).
 *
 * It replaced a rule with the mode in it. In "left" the wheel and the
 * bars started full and emptied, so a day with nothing logged was a
 * fully orange wheel and 410 kcal left of 2,200 was a wheel 19% full
 * beside a week mark 81% full. The function takes no mode, so no caller
 * can bring that back by passing one.
 */
describe("loggedFill", () => {
  it("is empty with nothing logged", () => {
    expect(loggedFill(0, 2200)).toBe(0);
  });

  it("grows with what is logged", () => {
    expect(loggedFill(550, 2200)).toBe(0.25);
    expect(loggedFill(1790, 2200)).toBeCloseTo(0.8136, 4);
  });

  it("is full at the target and stays full past it", () => {
    // Past the target is the second lap, which the wheel and the bars
    // draw for themselves.
    expect(loggedFill(2200, 2200)).toBe(1);
    expect(loggedFill(2900, 2200)).toBe(1);
  });

  it("is empty when there is no target to fill against", () => {
    expect(loggedFill(500, 0)).toBe(0);
    expect(loggedFill(500, -1)).toBe(0);
    expect(loggedFill(500, Number.NaN)).toBe(0);
  });

  it("never draws a negative or a missing amount", () => {
    expect(loggedFill(-40, 2200)).toBe(0);
    expect(loggedFill(Number.NaN, 2200)).toBe(0);
  });

  it("takes no display mode", () => {
    expect(loggedFill).toHaveLength(2);
  });
});
