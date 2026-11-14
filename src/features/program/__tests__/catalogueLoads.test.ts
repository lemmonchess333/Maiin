/**
 * Every loaded lift in the catalogue starts at a weight of its own
 * (training deep dive, D1). Before `catalogueLoads.ts`, a lift the variation
 * bank did not list took its category's main-lift seed whole when it was
 * added or swapped in: for an 80 kg intermediate man, a 32.5 kg dumbbell
 * lateral raise, an 85 kg leg extension, a 100 kg cable glute kickback and
 * a 35 kg treadmill. This walks the whole catalogue, so a lift added to it
 * later without a row fails here instead.
 */
import { describe, expect, it } from "vitest";
import { EXERCISES, getExerciseById } from "@/lib/exercises";
import { CATALOGUE_LOADS } from "../catalogueLoads";
import {
  addedExerciseWeight,
  startingWeightForCategory,
  type StartingLoadContext,
} from "../startingLoads";
import { movementCategoryForExerciseId } from "../variationBank";

const MAN: StartingLoadContext = {
  bodyweightKg: 80,
  experience: "intermediate",
  sex: "male",
};
const WOMAN: StartingLoadContext = {
  bodyweightKg: 60,
  experience: "beginner",
  sex: "female",
};

/** Isolation lifts that move more than half their category's main lift:
 *  a barbell shrug holds about the row's weight. */
const HEAVY_ISOLATION = new Set(["barbell-shrug"]);

describe("the catalogue's first weights", () => {
  it("lists every loaded lift the bank does not, and none it does", () => {
    const missing = EXERCISES.filter(
      (e) =>
        e.equipment !== "Bodyweight" &&
        movementCategoryForExerciseId(e.id) === undefined &&
        CATALOGUE_LOADS[e.id] === undefined
    ).map((e) => e.id);
    expect(missing).toEqual([]);
    const twice = Object.keys(CATALOGUE_LOADS).filter(
      (id) => movementCategoryForExerciseId(id) !== undefined
    );
    expect(twice).toEqual([]);
    const unknown = Object.keys(CATALOGUE_LOADS).filter(
      (id) => !getExerciseById(id)
    );
    expect(unknown).toEqual([]);
  });

  it("starts conditioning at no weight", () => {
    const loaded = EXERCISES.filter((e) => e.category === "Cardio")
      .filter((e) => addedExerciseWeight(e.id, MAN) !== 0)
      .map((e) => e.id);
    expect(loaded).toEqual([]);
  });

  it.each([
    ["an 80 kg intermediate man", MAN],
    ["a 60 kg beginner woman", WOMAN],
  ])("gives %s no isolation over half its main lift's weight", (_who, ctx) => {
    const over: string[] = [];
    for (const [id, row] of Object.entries(CATALOGUE_LOADS)) {
      if (getExerciseById(id)?.mechanic !== "isolation") continue;
      // The arms' main lifts, the barbell curl and the rope pushdown, are
      // isolations themselves: their variations sit close to them.
      if (row.category === "arms_biceps" || row.category === "arms_triceps")
        continue;
      if (HEAVY_ISOLATION.has(id)) continue;
      const main = startingWeightForCategory(row.category, ctx);
      const weight = addedExerciseWeight(id, ctx);
      // The barbell lifts start at the bar however light the factor.
      if (getExerciseById(id)?.equipment === "Barbell" && weight <= 20)
        continue;
      if (weight > main / 2)
        over.push(`${id} ${String(weight)} kg of ${String(main)} kg`);
    }
    expect(over).toEqual([]);
  });

  it("starts the lifts the deep dive measured at their own weights", () => {
    // Before: 32.5, 85, 100, 35 and 62.5 kg.
    expect(addedExerciseWeight("lateral-raise", MAN)).toBeLessThanOrEqual(10);
    expect(addedExerciseWeight("leg-extension", MAN)).toBeLessThanOrEqual(40);
    expect(
      addedExerciseWeight("cable-glute-kickback", MAN)
    ).toBeLessThanOrEqual(15);
    expect(addedExerciseWeight("treadmill", MAN)).toBe(0);
    expect(addedExerciseWeight("cable-fly", MAN)).toBeLessThanOrEqual(15);
  });
});
