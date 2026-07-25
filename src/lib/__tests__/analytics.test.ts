/**
 * Epley 1RM contract tests.
 *
 * This suite used to cover 13 describe blocks over the old "shared
 * analytics utilities" module. Eleven of them tested helpers production
 * never called — the surfaces that consumed them were rewritten and the
 * helpers stayed behind. They went with the code they covered; a test over
 * an unreachable function proves nothing about production (ADR-0008).
 *
 * What's left is the part that IS load-bearing: the two guards that make
 * e1rm comparisons honest. `reps <= 0` stops a logged failed set scoring
 * weight×1.0 as a 1RM, and the `reps === 1` identity stops a true single
 * being inflated by 3.3%. History.tsx and ExerciseHistory.tsx both inlined
 * the raw formula without either correction before this existed.
 */
import { describe, it, expect } from "vitest";
import { epley1RM, epley1RMExact } from "../analytics";

describe("epley1RM", () => {
  it("returns 0 for zero or negative weight/reps", () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(-10, 5)).toBe(0);
  });

  it("returns weight for 1 rep", () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it("calculates correctly for multiple reps", () => {
    // 100 * (1 + 5/30) = 100 * 1.1667 ≈ 117
    expect(epley1RM(100, 5)).toBe(117);
  });

  it("calculates correctly for 10 reps", () => {
    // 100 * (1 + 10/30) = 100 * 1.333 ≈ 133
    expect(epley1RM(100, 10)).toBe(133);
  });
});

describe("epley1RMExact", () => {
  it("matches epley1RM unrounded for multi-rep sets", () => {
    expect(epley1RMExact(100, 5)).toBeCloseTo(100 * (1 + 5 / 30), 10);
    expect(epley1RM(100, 5)).toBe(Math.round(epley1RMExact(100, 5)));
  });

  it("a true single IS its 1RM — no 3.3% inflation, no rounding of plate weights", () => {
    // The inline copies this replaces scored 100kg x 1 as 103.3.
    expect(epley1RMExact(100, 1)).toBe(100);
    expect(epley1RMExact(102.5, 1)).toBe(102.5);
  });

  it("guards failed/empty sets — reps<=0 or weight<=0 never score", () => {
    expect(epley1RMExact(100, 0)).toBe(0);
    expect(epley1RMExact(100, -1)).toBe(0);
    expect(epley1RMExact(0, 8)).toBe(0);
  });
});
