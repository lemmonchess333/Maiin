/**
 * The meal slot is the Food surface's colour identity.
 *
 * Both pickers — the composer's "Add to" row and EditServingsSheet's
 * "Meal slot" — render the selected slot as a filled orange pill. That
 * orange is the food domain's identity and matches the meal-section add
 * button, so "which meal" reads as one colour across the page.
 *
 * A cohesion pass moved both onto the neutral SegmentedControl track for
 * uniformity, which left the food surface as the only domain in the app
 * with no colour of its own; the owner asked for the pills back. These
 * tests pin the restored treatment AND the narrow scope of the `solid`
 * emphasis that carries it: a second solid group on some neutral surface
 * is exactly the drift the primitive exists to prevent, so the sanctioned
 * call sites are enumerated here rather than left to convention.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";

const SRC = join(process.cwd(), "src");

/** The only components allowed to render `emphasis="solid"`. */
const SANCTIONED = [
  "src/components/food/FoodComposerCard.tsx",
  "src/components/food/EditServingsSheet.tsx",
];

describe("meal slot picker keeps the food surface's orange", () => {
  it("both meal pickers ask for the solid nutrition treatment", () => {
    for (const file of SANCTIONED) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src, `${file} renders a SegmentedControl`).toContain(
        "<SegmentedControl"
      );
      expect(src, `${file} keeps emphasis="solid"`).toContain(
        'emphasis="solid"'
      );
      expect(src, `${file} keeps tone="nutrition"`).toContain(
        'tone="nutrition"'
      );
    }
  });

  it("the selected solid pill is the AA nutrition fill, not the identity orange", () => {
    // #D9884E under white text is ~2.8:1. The fill step (--nutrition-fill,
    // amber-700 #B45309) is the AA-passing one, and it is what the pills
    // used before the cohesion pass — restoring the look must not restore
    // a contrast problem with it.
    const src = readFileSync(
      join(SRC, "components/ui/SegmentedControl.tsx"),
      "utf8"
    );
    expect(src).toContain("bg-nutrition-fill");
    expect(src).not.toContain("bg-nutrition-fill/");
  });

  it("no other component reaches for the solid emphasis", () => {
    // The primitive itself names the value in its own docstring; every
    // OTHER match is a call site.
    const files = globSync("**/*.tsx", { cwd: SRC, absolute: true }).filter(
      (f) => !f.includes("__tests__") && !f.endsWith("SegmentedControl.tsx")
    );
    const users = files
      .filter((f) => readFileSync(f, "utf8").includes('emphasis="solid"'))
      .map((f) => `src/${f.slice(SRC.length + 1)}`)
      .sort();
    expect(users).toEqual([...SANCTIONED].sort());
  });
});
