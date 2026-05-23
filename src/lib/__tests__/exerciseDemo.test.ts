/**
 * Tests for the pure muscle-name helpers in `exerciseDemo.ts`.
 *
 * The fetch/cache machinery (loadDemoCache, getDemo etc) requires
 * network mocking and isn't tested here — these are the three
 * standalone helpers used by the body-highlighter wire-up:
 *
 *   mapMuscles      — free-exercise-db muscle names → react-body-
 *                     highlighter ids, with VALID_MUSCLES whitelist.
 *   needsPosterior  — body diagram needs a back view?
 *   needsAnterior   — body diagram needs a front view?
 */
import { describe, it, expect } from "vitest";
import {
  mapMuscles,
  needsPosterior,
  needsAnterior,
} from "../exerciseDemo";

describe("mapMuscles", () => {
  it("translates free-exercise-db names to react-body-highlighter ids", () => {
    expect(mapMuscles(["chest"])).toEqual(["chest"]);
    expect(mapMuscles(["biceps", "triceps"])).toEqual(["biceps", "triceps"]);
  });

  it("normalises case (input is lowercased before lookup)", () => {
    expect(mapMuscles(["Chest", "BICEPS"])).toEqual(["chest", "biceps"]);
  });

  it("collapses synonyms to canonical ids (lats → upper-back)", () => {
    /* free-exercise-db has both 'lats' and 'middle back' which the
       body-highlighter component renders as the same region. */
    expect(mapMuscles(["lats"])).toEqual(["upper-back"]);
    expect(mapMuscles(["middle back"])).toEqual(["upper-back"]);
  });

  it("drops unknown muscle names entirely (no nulls in the result)", () => {
    /* MUSCLE_MAP returns null for unknowns; the .filter strips them
       so callers don't have to handle nulls. */
    expect(mapMuscles(["chest", "not-a-real-muscle", "biceps"])).toEqual([
      "chest",
      "biceps",
    ]);
    expect(mapMuscles(["only-unknown"])).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(mapMuscles([])).toEqual([]);
  });
});

describe("needsPosterior", () => {
  it("returns true when any muscle is on the posterior set", () => {
    expect(needsPosterior(["upper-back"])).toBe(true);
    expect(needsPosterior(["hamstring"])).toBe(true);
    expect(needsPosterior(["chest", "lower-back"])).toBe(true);
  });

  it("returns false when no muscle is posterior", () => {
    expect(needsPosterior(["chest", "biceps"])).toBe(false);
  });

  it("returns false for an empty input", () => {
    expect(needsPosterior([])).toBe(false);
  });
});

describe("needsAnterior", () => {
  it("returns true when any muscle is on the anterior set", () => {
    expect(needsAnterior(["chest"])).toBe(true);
    expect(needsAnterior(["abs", "obliques"])).toBe(true);
    expect(needsAnterior(["hamstring", "biceps"])).toBe(true);
  });

  it("returns false when no muscle is anterior", () => {
    expect(needsAnterior(["upper-back", "hamstring"])).toBe(false);
  });

  it("returns false for an empty input", () => {
    expect(needsAnterior([])).toBe(false);
  });
});
