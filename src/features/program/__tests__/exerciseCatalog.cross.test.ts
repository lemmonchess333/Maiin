import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { EXERCISES } from "@/lib/exercises";

/**
 * Catalog name-mirror pin (packet 18): functions/lib/exerciseCatalog.js is a
 * hand-maintained id -> name copy of the exercise catalog (the CF reducer
 * derives add/replace exercise names from it). This asserts the server map
 * equals the catalog exactly, so any catalog add/rename/remove fails CI until
 * the mirror is updated in the same commit.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/exerciseCatalog") as {
  EXERCISE_NAME_BY_ID: Record<string, string>;
  getExerciseName: (id: string | undefined) => string | undefined;
  isCatalogExerciseId: (id: string | undefined) => boolean;
};

describe("exercise catalog id→name mirror ↔ catalog parity", () => {
  const canonical: Record<string, string> = {};
  for (const e of EXERCISES) canonical[e.id] = e.name;

  it("server map equals the catalog id→name map exactly", () => {
    expect(cf.EXERCISE_NAME_BY_ID).toEqual(canonical);
  });

  it("getExerciseName / isCatalogExerciseId agree with the catalog", () => {
    for (const e of EXERCISES) {
      expect(cf.getExerciseName(e.id)).toBe(e.name);
      expect(cf.isCatalogExerciseId(e.id)).toBe(true);
    }
    expect(cf.getExerciseName("not-a-real-id")).toBeUndefined();
    expect(cf.isCatalogExerciseId("not-a-real-id")).toBe(false);
    expect(cf.isCatalogExerciseId(undefined)).toBe(false);
  });
});
