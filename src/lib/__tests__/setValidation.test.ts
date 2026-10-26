/**
 * PR E — set validator contract tests.
 *
 * Pins the rules the workout flow depends on: invalid input must
 * never reach PR detection, huge jumps must surface as `warn` so
 * the caller can require confirmation, bodyweight exercises must
 * accept zero weight.
 */
import { describe, it, expect } from "vitest";
import { needsLoad, validateSet } from "../setValidation";

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

  it("checks added load on a bodyweight lift like any weight", () => {
    // The caller passes the catalog's answer, so pull-ups are bodyweight
    // at 10 kg added too: the cap and the sign still hold there.
    expect(validateSet({ reps: 5, weight: 10, isBodyweight: true }).ok).toBe(
      true
    );
    expect(validateSet({ reps: 5, weight: -5, isBodyweight: true })).toEqual({
      ok: false,
      severity: "block",
      message: "Weight can't be negative.",
    });
    expect(validateSet({ reps: 5, weight: 600, isBodyweight: true }).ok).toBe(
      false
    );
  });
});

describe("validateSet — a loaded lift needs a weight", () => {
  const LOADED = [
    "Barbell",
    "Dumbbells",
    "Machine",
    "Cable Machine",
    "Kettlebell",
  ];

  it("refuses 0 kg on a barbell, dumbbell, machine, cable or kettlebell lift", () => {
    for (const equipment of LOADED) {
      expect(validateSet({ reps: 8, weight: 0, equipment })).toEqual({
        ok: false,
        severity: "block",
        message: "Enter a weight.",
      });
      expect(validateSet({ reps: 8, weight: 20, equipment }).ok).toBe(true);
    }
  });

  it("keeps 0 for a bodyweight lift, a timed hold, and other equipment", () => {
    expect(
      validateSet({
        reps: 8,
        weight: 0,
        equipment: "Bodyweight",
        isBodyweight: true,
      }).ok
    ).toBe(true);
    expect(
      validateSet({ reps: 30, weight: 0, equipment: "Barbell", timed: true }).ok
    ).toBe(true);
    // A band, an ab wheel and a box carry no load to enter.
    for (const equipment of ["Resistance Band", "Ab Wheel", "Box", undefined])
      expect(validateSet({ reps: 8, weight: 0, equipment }).ok).toBe(true);
  });

  it("names the lifts that need a load", () => {
    for (const equipment of LOADED) expect(needsLoad(equipment)).toBe(true);
    for (const equipment of ["Bodyweight", "Ab Wheel", "Box", undefined])
      expect(needsLoad(equipment)).toBe(false);
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

describe("validateSet — past today's plan (Lift16)", () => {
  it("asks about more than twice the planned weight, first session included", () => {
    const r = validateSet({ reps: 12, weight: 125, plannedWeight: 12.5 });
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.warn).toMatchObject({
        kind: "past-plan",
        title: "125 kg?",
        message: "Today's plan is 12.5 kg.",
        confirmLabel: "Log 125 kg",
        fromKg: 12.5,
        toKg: 125,
      });
  });

  it("logs twice the plan, or anything under it, without asking", () => {
    for (const weight of [25, 15, 5]) {
      const r = validateSet({ reps: 12, weight, plannedWeight: 12.5 });
      if (r.ok) expect(r.warn).toBeUndefined();
    }
  });

  it("names the plan before the best when both are passed", () => {
    const r = validateSet({
      reps: 5,
      weight: 205,
      plannedWeight: 92.5,
      currentBestForBucket: 95,
    });
    if (r.ok) expect(r.warn?.kind).toBe("past-plan");
  });

  it("asks against the best for these reps", () => {
    const r = validateSet({ reps: 5, weight: 130, currentBestForBucket: 100 });
    if (r.ok)
      expect(r.warn).toMatchObject({
        title: "130 kg?",
        message: "Your best at these reps is 100 kg.",
        confirmLabel: "Log 130 kg",
      });
  });

  it("has no plan to compare with at 0 kg planned", () => {
    const r = validateSet({ reps: 8, weight: 20, plannedWeight: 0 });
    if (r.ok) expect(r.warn).toBeUndefined();
  });
});

describe("validateSet — the lifter's unit (Lift18)", () => {
  it("checks kg and asks in lb", () => {
    const r = validateSet({
      reps: 5,
      weight: 136.08,
      plannedWeight: 61.235,
      unit: "lbs",
    });
    if (r.ok)
      expect(r.warn).toMatchObject({
        title: "300 lb?",
        message: "Today's plan is 135 lb.",
        confirmLabel: "Log 300 lb",
        fromKg: 61.235,
        toKg: 136.08,
      });
  });

  it("asks against the best in lb", () => {
    const r = validateSet({
      reps: 5,
      weight: 130,
      currentBestForBucket: 100,
      unit: "lbs",
    });
    if (r.ok)
      expect(r.warn?.message).toBe("Your best at these reps is 220.5 lb.");
  });

  it("says the cap in lb", () => {
    const r = validateSet({ reps: 5, weight: 501, unit: "lbs" });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.message).toBe(
        `Weight looks too high (max ${(1102).toLocaleString("en-GB")} lb). Check the value.`
      );
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

describe("validateSet — timed holds (Lift4 (14))", () => {
  it("completes a hold past 100 seconds", () => {
    const r = validateSet({
      reps: 120,
      weight: 0,
      isBodyweight: true,
      timed: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.normalized.reps).toBe(120);
  });

  it("still refuses more than 100 reps", () => {
    const r = validateSet({ reps: 120, weight: 0, isBodyweight: true });
    expect(r.ok).toBe(false);
  });

  it("refuses an hour-plus hold, in seconds", () => {
    const r = validateSet({ reps: 3601, weight: 20, timed: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/hold looks too long/);
  });

  it("speaks in seconds for an empty hold", () => {
    const r = validateSet({
      reps: 0,
      weight: 0,
      isBodyweight: true,
      timed: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.message).toBe("Log at least one second to complete the set.");
  });
});
