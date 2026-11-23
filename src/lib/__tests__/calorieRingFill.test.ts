import { describe, it, expect } from "vitest";
import { overshootFill, ringFill } from "../calorieRingFill";

/**
 * The one rule for how full the calorie wheel's first lap and the macro
 * bars are drawn: it follows the left and logged switch, as MacroFactor's
 * does (owner, 23 November 2026, reversing Food11 call 5). Logged fills
 * with what is logged; left is what is left, full with nothing logged.
 * What is past the target is the second lap, the same in both views.
 *
 * Under Food11 call 5 the drawing took no mode and only a number and a
 * word changed on a tap. The owner wants the tap to visibly change the
 * wheel.
 */
describe("ringFill — the logged view", () => {
  it("is empty with nothing logged", () => {
    expect(ringFill(0, 2200, "eaten")).toBe(0);
  });

  it("grows with what is logged", () => {
    expect(ringFill(550, 2200, "eaten")).toBe(0.25);
    expect(ringFill(1790, 2200, "eaten")).toBeCloseTo(0.8136, 4);
  });

  it("is full at the target and stays full past it", () => {
    expect(ringFill(2200, 2200, "eaten")).toBe(1);
    expect(ringFill(2900, 2200, "eaten")).toBe(1);
  });
});

describe("ringFill — the left view", () => {
  it("is full with nothing logged", () => {
    expect(ringFill(0, 2200, "left")).toBe(1);
  });

  it("empties as food is logged", () => {
    expect(ringFill(550, 2200, "left")).toBe(0.75);
    expect(ringFill(1790, 2200, "left")).toBeCloseTo(0.1864, 4);
  });

  it("is empty at the target and stays empty past it", () => {
    expect(ringFill(2200, 2200, "left")).toBe(0);
    expect(ringFill(2900, 2200, "left")).toBe(0);
  });

  it("is the logged view's other part, under the target", () => {
    for (const consumed of [0, 1, 550, 1100, 2199]) {
      expect(
        ringFill(consumed, 2200, "left") + ringFill(consumed, 2200, "eaten")
      ).toBeCloseTo(1, 10);
    }
  });
});

describe("ringFill — amounts it cannot fill against", () => {
  it("is empty in both views when there is no target", () => {
    for (const target of [0, -1, Number.NaN]) {
      expect(ringFill(500, target, "eaten")).toBe(0);
      expect(ringFill(500, target, "left")).toBe(0);
    }
  });

  it("reads a negative or a missing amount as nothing logged", () => {
    for (const consumed of [-40, Number.NaN]) {
      expect(ringFill(consumed, 2200, "eaten")).toBe(0);
      expect(ringFill(consumed, 2200, "left")).toBe(1);
    }
  });
});

describe("overshootFill — the second lap, in both views", () => {
  it("is nothing at or under the target", () => {
    expect(overshootFill(0, 2200)).toBe(0);
    expect(overshootFill(2200, 2200)).toBe(0);
  });

  it("is what is over, as a share of the target", () => {
    expect(overshootFill(2750, 2200)).toBe(0.25);
  });

  it("is one lap at most", () => {
    expect(overshootFill(9000, 2200)).toBe(1);
  });

  it("is nothing when there is no target", () => {
    expect(overshootFill(500, 0)).toBe(0);
    expect(overshootFill(500, Number.NaN)).toBe(0);
  });
});
