import { describe, it, expect } from "vitest";

import { exerciseBank } from "../variationBank";
import { EXERCISES } from "@/lib/exercises";

/**
 * Backlog #13 (P6/D5/B7/N14) — form-content backfill. `commonMistakes` is
 * rendered by ExerciseFormContent and was authored on 3 of 151 exercises, so
 * the "watch out" section was blank for almost every lift the generator
 * actually prescribes.
 *
 * The bar is set at the bank's PRIMARY lifts — the movement the engine picks
 * by default for each category, and the one a novice meets first. Coverage
 * beyond that is good but not pinned; these are the ones that must never
 * regress to blank.
 */
describe("form content coverage", () => {
  const byId = new Map(EXERCISES.map((e) => [e.id, e]));

  it("every bank PRIMARY has common mistakes authored", () => {
    const missing: string[] = [];
    for (const [category, options] of Object.entries(exerciseBank)) {
      const primary = options.find((o) => o.primary);
      if (!primary) continue;
      const ex = byId.get(primary.id);
      if (!ex?.commonMistakes?.length) {
        missing.push(`${category}/${primary.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("authored mistakes are non-empty sentences, not placeholders", () => {
    for (const ex of EXERCISES) {
      for (const m of ex.commonMistakes ?? []) {
        expect(m.trim().length, `${ex.id}`).toBeGreaterThan(15);
        expect(m.trim().endsWith("."), `${ex.id}: "${m}"`).toBe(true);
      }
    }
  });

  it("covers the barbell compounds a beginner is most likely to meet", () => {
    // The lifts the review supplied material for, and where a form error
    // carries real injury risk rather than just lost stimulus.
    const mustHave = [
      "squat",
      "front-squat",
      "deadlift",
      "sumo-deadlift",
      "romanian-deadlift",
      "bench-press",
      "incline-bench",
      "close-grip-bench",
      "overhead-press",
      "barbell-row",
      "pull-ups",
      "barbell-upright-row", // N14: cited impingement risk + the mitigation
    ];
    const missing = mustHave.filter(
      (id) => !byId.get(id)?.commonMistakes?.length
    );
    expect(missing).toEqual([]);
  });
});
