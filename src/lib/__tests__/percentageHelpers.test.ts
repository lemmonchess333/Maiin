/**
 * Tests for `clampPct` — the macro/progress percentage helper.
 */
import { describe, it, expect } from "vitest";
import { clampPct } from "../percentageHelpers";

describe("clampPct", () => {
  it("returns 0 when target is 0", () => {
    expect(clampPct(150, 0)).toBe(0);
  });

  it("returns 0 when target is negative (defensive)", () => {
    expect(clampPct(150, -100)).toBe(0);
  });

  it("returns 0 when consumed is 0", () => {
    expect(clampPct(0, 200)).toBe(0);
  });

  it("computes the percentage and rounds to nearest integer", () => {
    expect(clampPct(50, 200)).toBe(25);
    expect(clampPct(100, 200)).toBe(50);
    expect(clampPct(150, 200)).toBe(75);
    expect(clampPct(200, 200)).toBe(100);
  });

  it("rounds half-up via Math.round", () => {
    expect(clampPct(75, 200)).toBe(38); // 37.5 → 38
  });

  it("clamps to 100 when consumed exceeds target", () => {
    expect(clampPct(300, 200)).toBe(100);
    expect(clampPct(1000, 100)).toBe(100);
  });

  it("clamps to 0 when consumed is negative (defensive)", () => {
    /* `Math.max(0, …)` ensures negative consumed (impossible in
       practice but defensive) doesn't surface as a negative
       progress ring. */
    expect(clampPct(-50, 200)).toBe(0);
  });
});
