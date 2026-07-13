import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { EXERCISES } from "@/lib/exercises";

/**
 * Data-mirror pin (packet 18): functions/lib/bodyweightExerciseIds.js is a
 * hand-maintained copy of the catalog's `equipment: "Bodyweight"` rows (the CF
 * progression engine can't require the Vite/TS catalog). This derives the
 * canonical set from EXERCISES and asserts the server list matches exactly, so
 * adding/removing a bodyweight exercise in the catalog fails CI until the CF
 * list is updated in the same commit.
 */
const require = createRequire(import.meta.url);
const { BODYWEIGHT_EXERCISE_IDS, isBodyweightExerciseId } =
  require("../../../../functions/lib/bodyweightExerciseIds") as {
    BODYWEIGHT_EXERCISE_IDS: string[];
    isBodyweightExerciseId: (id: string | undefined) => boolean;
  };

describe("bodyweight id set ↔ catalog parity", () => {
  const canonical = EXERCISES.filter((e) => e.equipment === "Bodyweight")
    .map((e) => e.id)
    .sort();

  it("server list equals the catalog's Bodyweight ids", () => {
    expect([...BODYWEIGHT_EXERCISE_IDS].sort()).toEqual(canonical);
  });

  it("isBodyweightExerciseId agrees with the catalog per id", () => {
    for (const e of EXERCISES) {
      expect(isBodyweightExerciseId(e.id)).toBe(e.equipment === "Bodyweight");
    }
    expect(isBodyweightExerciseId(undefined)).toBe(false);
    expect(isBodyweightExerciseId("not-a-real-id")).toBe(false);
  });
});
