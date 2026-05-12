/**
 * PR E — set validator contract tests.
 *
 * Pins the rules the workout flow depends on: invalid input must
 * never reach PR detection, huge jumps must surface as `warn` so
 * the caller can require confirmation, bodyweight exercises must
 * accept zero weight.
 */
import { describe, it, expect } from "vitest";
import { validateSet } from "../setValidation";

describe("validateSet — reps", () => {
  it("blocks empty reps", () => {
    const r = validateSet({ reps: "", weight: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("rep count");
  });

  it("blocks negative reps", () => {
    const r = validateSet({ reps: -5, weight: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("negative");
  });

  it("blocks decimal reps", () => {
    const r = validateSet({ reps: 5.5, weight: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("whole number");
  });

  it("blocks zero reps", () => {
    const r = validateSet({ reps: 0, weight: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("at least one rep");
  });

  it("blocks reps > 100", () => {
    const r = validateSet({ reps: 200, weight: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("too high");
  });

  it("accepts integer reps in range", () => {
    const r = validateSet({ reps: 5, weight: 50 });
    expect(r.ok).toBe(true);
  });

  it("coerces string reps to integer", () => {
    const r = validateSet({ reps: "5", weight: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.reps).toBe(5);
  });
});

describe("validateSet — weight", () => {
  it("blocks empty weight (non-bodyweight)", () => {
    const r = validateSet({ reps: 5, weight: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Enter a weight");
  });

  it("blocks negative weight", () => {
    const r = validateSet({ reps: 5, weight: -10 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("negative");
  });

  it("blocks weight > 500kg", () => {
    const r = validateSet({ reps: 5, weight: 999 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("too high");
  });

  it("accepts decimal weight (no step enforcement here)", () => {
    const r = validateSet({ reps: 5, weight: 42.5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.weight).toBe(42.5);
  });
});

describe("validateSet — bodyweight exercises", () => {
  it("accepts zero weight on bodyweight exercises", () => {
    const r = validateSet({ reps: 12, weight: 0, isBodyweight: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.weight).toBe(0);
  });

  it("accepts missing weight on bodyweight exercises", () => {
    const r = validateSet({ reps: 12, weight: "", isBodyweight: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.weight).toBe(0);
  });

  it("still validates reps on bodyweight exercises", () => {
    const r = validateSet({ reps: -1, weight: 0, isBodyweight: true });
    expect(r.ok).toBe(false);
  });
});

describe("validateSet — huge-jump warn", () => {
  it("does NOT warn on the first lift in a bucket (no current best)", () => {
    const r = validateSet({ reps: 5, weight: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warn).toBeUndefined();
  });

  it("does NOT warn when within 25% of current best", () => {
    const r = validateSet({ reps: 5, weight: 110, currentBestForBucket: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warn).toBeUndefined();
  });

  it("warns when > 25% over current best", () => {
    const r = validateSet({ reps: 5, weight: 200, currentBestForBucket: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warn).toBeDefined();
      expect(r.warn?.kind).toBe("huge-jump");
      expect(r.warn?.fromKg).toBe(100);
      expect(r.warn?.toKg).toBe(200);
      expect(r.warn?.ratio).toBe(2);
      expect(r.warn?.confirmLabel).toContain("Log");
    }
  });

  it("respects a custom jumpWarnRatio override", () => {
    // Tighter than default: warn over 10% jump
    const r = validateSet({
      reps: 5,
      weight: 115,
      currentBestForBucket: 100,
      jumpWarnRatio: 1.1,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warn?.kind).toBe("huge-jump");
  });

  it("does not warn when current best is 0 (never set)", () => {
    const r = validateSet({ reps: 5, weight: 100, currentBestForBucket: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warn).toBeUndefined();
  });
});

describe("validateSet — false-PR regression", () => {
  it("a fat-fingered 200kg over 100kg PR surfaces as warn, not silent acceptance", () => {
    // This is the exact pre-PR-E regression: a 200kg fat-finger over
    // a 100kg PR became a permanent PR with confetti, no question
    // asked. Now the caller MUST handle the warn before any PR mutation.
    const r = validateSet({
      reps: 5,
      weight: 200,
      currentBestForBucket: 100,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warn?.kind).toBe("huge-jump");
  });
});
