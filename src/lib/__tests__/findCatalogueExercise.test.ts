/**
 * A logged lift resolves to its catalogue exercise by id, by name, or by a
 * second name for the same movement. The prs-rich capture showed "Back
 * Squat" on the generic tile while Squat had a drawing: the PRs tab looked
 * the lift up by exact catalogue name ("Barbell Squat") and the thumbnail
 * by exact id, and "Back Squat" / "back-squat" is neither.
 */
import { describe, it, expect } from "vitest";
import { EXERCISES, findCatalogueExercise } from "../exercises";
import { getFormArtCutout } from "../formArtCutouts";

const key = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");

describe("findCatalogueExercise", () => {
  it.each([
    "Back Squat",
    "back-squat",
    "back_squat",
    "BACK SQUAT",
    "Barbell Back Squat",
  ])("reads %s as the catalogue's barbell (back) squat", (logged) => {
    expect(findCatalogueExercise(logged)?.id).toBe("squat");
  });

  it("gives Back Squat the squat's drawing", () => {
    const squat = getFormArtCutout("squat");
    expect(squat, "the squat has released art").not.toBeNull();
    const backSquat = findCatalogueExercise("Back Squat");
    expect(getFormArtCutout(backSquat!.id)).toEqual(squat);
  });

  it("reads an exact id, and a catalogue name in any case", () => {
    expect(findCatalogueExercise("squat")?.name).toBe("Barbell Squat");
    expect(findCatalogueExercise("Barbell Squat")?.id).toBe("squat");
    expect(findCatalogueExercise("front squat")?.id).toBe("front-squat");
  });

  it("never folds a variant into the back squat", () => {
    for (const variant of [
      "Front Squat",
      "Goblet Squat",
      "Hack Squat",
      "Zercher Squat",
    ])
      expect(findCatalogueExercise(variant)?.id, variant).not.toBe("squat");
  });

  it("knows nothing of a custom lift", () => {
    expect(findCatalogueExercise("my-own-lift")).toBeUndefined();
    expect(findCatalogueExercise("")).toBeUndefined();
    expect(findCatalogueExercise("   ")).toBeUndefined();
    expect(findCatalogueExercise("constructor")).toBeUndefined();
  });

  it("has one catalogue exercise per name, so a name cannot pick the wrong one", () => {
    const names = EXERCISES.map((e) => key(e.name));
    const repeated = names.filter((n, i) => names.indexOf(n) !== i);
    expect(repeated).toEqual([]);
  });
});
