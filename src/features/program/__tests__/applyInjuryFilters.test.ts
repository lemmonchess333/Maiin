import { describe, it, expect } from "vitest";
import { applyInjuryFilters } from "../matchTemplate";
import { PROGRAM_TEMPLATES } from "../templates";

/**
 * Regression tests for the knee-only duplicate-stacking bug.
 *
 * Pre-fix: the Upper/Lower hypertrophy Lower A day contained Barbell
 * Squat AND Leg Press, both contraindicated for knee. Both swapped to
 * Bulgarian Split Squat via the global table, producing two BSS entries
 * in a row. Lower B had a pre-existing Bulgarian Split Squat plus a
 * Leg Extension (also knee-contra) that swapped into a second BSS.
 *
 * Fix: swap pass now tracks per-day used ids and picks the next safe
 * candidate in the ordered list when the first is already present.
 */
describe("applyInjuryFilters — knee dedup", () => {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === "upper-lower-hypertrophy");
  if (!template) throw new Error("upper-lower-hypertrophy template missing");

  it("does not produce duplicate Bulgarian Split Squat on Lower A (squat + leg press both knee-contra)", () => {
    const filtered = applyInjuryFilters(template, ["knee"], PROGRAM_TEMPLATES);
    const lowerA = filtered.weeks[0].days.find((d) => d.name === "Lower A")!;
    const ids = lowerA.exercises.map((e) => e.exerciseId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("Lower A swap produces BSS + a distinct second substitute for Leg Press (e.g. Hip Thrust)", () => {
    const filtered = applyInjuryFilters(template, ["knee"], PROGRAM_TEMPLATES);
    const lowerA = filtered.weeks[0].days.find((d) => d.name === "Lower A")!;
    const ids = lowerA.exercises.map((e) => e.exerciseId);
    expect(ids).toContain("bulgarian-split");
    const secondSub = ids.find(
      (id) => id !== "bulgarian-split" && ["hip-thrust", "barbell-step-ups", "nordic-hamstring-curl"].includes(id),
    );
    expect(secondSub).toBeTruthy();
  });

  it("Lower B keeps the pre-existing BSS and picks a distinct swap for Leg Extension", () => {
    const filtered = applyInjuryFilters(template, ["knee"], PROGRAM_TEMPLATES);
    const lowerB = filtered.weeks[0].days.find((d) => d.name === "Lower B")!;
    const ids = lowerB.exercises.map((e) => e.exerciseId);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
    expect(ids).toContain("bulgarian-split");
  });

  it("non-contra days (Upper A, Upper B) untouched for knee-only user", () => {
    const filtered = applyInjuryFilters(template, ["knee"], PROGRAM_TEMPLATES);
    const upperA = filtered.weeks[0].days.find((d) => d.name === "Upper A")!;
    const upperB = filtered.weeks[0].days.find((d) => d.name === "Upper B")!;
    const before = template.weeks[0].days;
    const upperABefore = before.find((d) => d.name === "Upper A")!;
    const upperBBefore = before.find((d) => d.name === "Upper B")!;
    expect(upperA.exercises.map((e) => e.exerciseId)).toEqual(
      upperABefore.exercises.map((e) => e.exerciseId),
    );
    expect(upperB.exercises.map((e) => e.exerciseId)).toEqual(
      upperBBefore.exercises.map((e) => e.exerciseId),
    );
  });
});

describe("applyInjuryFilters — lower_back + shoulder (regression)", () => {
  const template = PROGRAM_TEMPLATES.find((t) => t.id === "upper-lower-hypertrophy");
  if (!template) throw new Error("upper-lower-hypertrophy template missing");

  it("swaps Deadlift for a lower_back user (Lower B)", () => {
    const filtered = applyInjuryFilters(template, ["lower_back"], PROGRAM_TEMPLATES);
    const lowerB = filtered.weeks[0].days.find((d) => d.name === "Lower B")!;
    const ids = lowerB.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("deadlift");
  });

  it("swaps Overhead Press for a shoulder user (Upper A)", () => {
    const filtered = applyInjuryFilters(template, ["shoulder"], PROGRAM_TEMPLATES);
    const upperA = filtered.weeks[0].days.find((d) => d.name === "Upper A")!;
    const ids = upperA.exercises.map((e) => e.exerciseId);
    expect(ids).not.toContain("overhead-press");
  });
});
