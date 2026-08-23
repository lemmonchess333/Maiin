import { describe, it, expect } from "vitest";
import { rangeFillPct } from "../rangeFill";

/**
 * The stop position for the range track's gradient fill.
 *
 * Small enough to look not worth testing, which is exactly why it is: it
 * is the ONLY thing standing between the value the user dragged to and
 * what the track paints, and every way it can go wrong is silent. A
 * divide-by-zero yields `NaN%`, which CSS discards as an invalid custom
 * property value — so the gradient falls back to its `0%` default and the
 * slider paints all-groove. That reads as "a slider at minimum", not as a
 * bug, on a control whose whole job is to show where you are.
 */
describe("rangeFillPct", () => {
  it("maps the ends and the middle of a 1-7 range", () => {
    // The onboarding run-days slider's real domain.
    expect(rangeFillPct(1, 1, 7)).toBe("0%");
    expect(rangeFillPct(4, 1, 7)).toBe("50%");
    expect(rangeFillPct(7, 1, 7)).toBe("100%");
  });

  it("handles a fractional range with a non-zero floor", () => {
    // RunSetupModal's voice speed: 0.6 to 1.4, step 0.1.
    expect(rangeFillPct(0.6, 0.6, 1.4)).toBe("0%");
    expect(rangeFillPct(1, 0.6, 1.4)).toBe("50%");
    expect(rangeFillPct(1.4, 0.6, 1.4)).toBe("100%");
  });

  it("clamps rather than overflowing the track", () => {
    /* A value outside [min,max] is reachable — a stored preference from a
       build with a wider range, or a controlled value set before the
       clamp. Past 100% the gradient's second stop would precede its first,
       which CSS resolves by flattening the whole thing. */
    expect(rangeFillPct(9, 1, 7)).toBe("100%");
    expect(rangeFillPct(-3, 1, 7)).toBe("0%");
  });

  it("a zero-width range reads FULL, not empty", () => {
    /* min === max: nowhere to travel. Both answers are defensible in the
       abstract, and only one is defensible on screen — an empty groove on
       an immovable control reads as "you have selected nothing", and no
       drag will change it. */
    expect(rangeFillPct(5, 5, 5)).toBe("100%");
  });

  it("an inverted range reads FULL rather than producing a negative", () => {
    // max < min is a caller error; the useful behaviour is to not emit
    // "-200%", which CSS drops, silently taking the 0% fallback.
    expect(rangeFillPct(3, 7, 1)).toBe("100%");
  });

  it("never emits NaN — the failure CSS swallows", () => {
    /* The one that matters most. `NaN%` is an invalid custom-property
       value, so the gradient uses its `0%` fallback and the control paints
       all-groove with no error anywhere. Every non-finite input is
       covered because `value` arrives from `Number(e.target.value)`, which
       yields NaN for an empty input. */
    const cases: Array<[number, number, number]> = [
      [NaN, 1, 7],
      [1, NaN, 7],
      [1, 1, NaN],
      [Infinity, 1, 7],
      [1, -Infinity, Infinity],
    ];
    for (const [value, min, max] of cases) {
      const out = rangeFillPct(value, min, max);
      expect(
        out,
        `rangeFillPct(${value}, ${min}, ${max}) emitted ${out}`
      ).toMatch(/^\d+(\.\d)?%$/);
    }
  });

  it("rounds to one decimal so a drag does not churn the style attribute", () => {
    // 1/3 of the way along a 0-3 range.
    expect(rangeFillPct(1, 0, 3)).toBe("33.3%");
  });
});
