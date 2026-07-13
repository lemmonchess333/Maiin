import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { EXERCISES } from "@/lib/exercises";
import { inferMovementCategory as clientInfer } from "@/lib/exerciseMovementCategory";

/**
 * Movement-category parity pin (packet 18): functions/lib/
 * exerciseMovementCategory.js mirrors the client inferMovementCategory (the CF
 * reducer categorises added/replaced exercises with it). This runs both over
 * every catalog exercise (name + id) plus synthetic names exercising each rule
 * and asserts identical output.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/exerciseMovementCategory") as {
  inferMovementCategory: (name: string, exerciseId?: string) => string;
};

describe("inferMovementCategory CF ↔ client parity", () => {
  it("agrees on every catalog exercise (name + id)", () => {
    for (const e of EXERCISES) {
      expect(cf.inferMovementCategory(e.name, e.id)).toBe(
        clientInfer(e.name, e.id)
      );
      // and name-only (no id), as normalizeExercise sometimes has
      expect(cf.inferMovementCategory(e.name)).toBe(clientInfer(e.name));
    }
  });

  it("agrees on synthetic names across the rule table + fallback", () => {
    const names = [
      "Romanian Deadlift",
      "Barbell Back Squat",
      "Weighted Pull-Up",
      "Seated Cable Row",
      "Overhead Press",
      "Incline Bench Press",
      "Tricep Pushdown",
      "Dumbbell Curl",
      "Hanging Leg Raise",
      "Totally Unknown Movement",
      "",
    ];
    for (const n of names) {
      expect(cf.inferMovementCategory(n, "some-id")).toBe(
        clientInfer(n, "some-id")
      );
    }
  });
});
