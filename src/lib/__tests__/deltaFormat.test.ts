/**
 * Tests for `buildDelta` — the History-page percentage-delta
 * formatter used by `<StatCard delta=…>` chips.
 *
 * Three suppression branches plus the formatting contract.
 */
import { describe, it, expect } from "vitest";
import { buildDelta } from "../deltaFormat";

describe("buildDelta — suppression", () => {
  it("returns null for non-finite current (NaN)", () => {
    expect(buildDelta(NaN, 100)).toBeNull();
  });

  it("returns null for non-finite previous (Infinity)", () => {
    expect(buildDelta(50, Infinity)).toBeNull();
  });

  it("returns null when previous is 0", () => {
    /* No meaningful denominator. */
    expect(buildDelta(50, 0)).toBeNull();
  });

  it("returns null when previous is negative", () => {
    expect(buildDelta(50, -10)).toBeNull();
  });

  it("returns null for sub-1% deltas (noise floor)", () => {
    /* 1000 → 1004 = 0.4% delta. Below the 1% noise floor. */
    expect(buildDelta(1004, 1000)).toBeNull();
  });

  it("returns null for sub-1% NEGATIVE deltas too", () => {
    /* 1000 → 996 = -0.4% delta. Magnitude is what matters. */
    expect(buildDelta(996, 1000)).toBeNull();
  });
});

describe("buildDelta — positive delta", () => {
  it("formats an increase as positive=true with rounded magnitude", () => {
    /* 100 → 150 = +50%. */
    const result = buildDelta(150, 100);
    expect(result).toEqual({ value: "50%", positive: true });
  });

  it("rounds magnitude to the nearest integer percent", () => {
    /* 100 → 174.5 = +74.5% → rounded to 75%. */
    const result = buildDelta(174.5, 100);
    expect(result?.value).toBe("75%");
  });

  it("treats exactly 0 as 'positive' (defensive — the inequality is >= 0)", () => {
    /* This branch only ever fires on Math.abs(pct) >= 1, so the
       exact-zero edge is unreachable in practice; pinning the
       documented sign convention regardless. */
    /* 100 → 101.5 = +1.5% — small positive. */
    expect(buildDelta(101.5, 100)?.positive).toBe(true);
  });
});

describe("buildDelta — negative delta", () => {
  it("formats a decrease as positive=false with absolute magnitude", () => {
    /* 200 → 100 = -50% → "50%" + positive=false. */
    const result = buildDelta(100, 200);
    expect(result).toEqual({ value: "50%", positive: false });
  });

  it("rounds negative magnitude to the nearest integer percent", () => {
    /* 100 → 26 = -74% (clean integer to avoid the JS Math.round
       half-up-toward-+Infinity edge: Math.round(-74.5) = -74
       before Math.abs, which would surface as 74% — documented
       below in the next case). */
    const result = buildDelta(26, 100);
    expect(result?.value).toBe("74%");
    expect(result?.positive).toBe(false);
  });

  it("Math.round runs before Math.abs (negative .5 rounds toward +Infinity)", () => {
    /* JS oddity: Math.round(-74.5) = -74 (not -75). The
       implementation applies Math.round THEN Math.abs, so this
       surfaces as 74% rather than 75%. Documenting the contract
       here so a future swap to Math.abs-then-round would visibly
       break this test. */
    const result = buildDelta(25.5, 100);
    expect(result?.value).toBe("74%");
  });
});

describe("buildDelta — boundary cases", () => {
  it("formats a 1% delta (exactly at the threshold)", () => {
    /* 100 → 101 = +1.0% → not suppressed (the guard is < 1, not <= 1). */
    const result = buildDelta(101, 100);
    expect(result?.value).toBe("1%");
    expect(result?.positive).toBe(true);
  });

  it("formats large percentage deltas (>100%)", () => {
    /* 10 → 50 = +400%. */
    const result = buildDelta(50, 10);
    expect(result?.value).toBe("400%");
  });
});
