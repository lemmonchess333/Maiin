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
      // One layout for both: left to wrap, the sheet's pills put
      // "Dinner" on a line of its own.
      expect(src, `${file} lays the slots out with the shared grid`).toContain(
        "MEAL_PICKER_LAYOUT"
      );
    }
  });

  it("the selected solid pill is the orange tint with its AA text step, not a fill", () => {
    // DS4 (DESIGN_GUIDE §14m rule 21): the page's one filled control is
    // Scan, and a filled orange chip beside it read as a second. The pill
    // keeps the food orange as its edge and a tint, and its label takes
    // the AA text step (--nutrition-strong): #D9884E text is under 3:1.
    const src = readFileSync(
      join(SRC, "components/ui/SegmentedControl.tsx"),
      "utf8"
    );
    expect(src).toContain(
      "border-nutrition bg-nutrition/10 text-nutrition-strong"
    );
    expect(src).not.toContain("bg-nutrition-fill");
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

/* Owner call, 2026-09-22: the "Your usual" row's Log is the food orange.
   A purple Log sat directly above the orange meal pills, and every other
   food control on the page is orange. CLAUDE.md's Button mapping still says
   Food CTAs default to primary, and records this row as the exception — so
   a sweep that follows the default would revert it without this pin. */
describe("the usual row's Log is the food orange", () => {
  it("renders the tinted nutrition variant: orange, and not a second filled button", () => {
    const src = readFileSync(join(SRC, "pages/Food.tsx"), "utf8");
    const start = src.indexOf("aria-labelledby={usualHeadingId}");
    expect(
      start,
      "the usual row is still labelled by its heading"
    ).toBeGreaterThan(-1);
    const row = src.slice(start, src.indexOf("</Card>", start));
    const log = row.slice(row.lastIndexOf("<Button"));
    expect(log).toMatch(/>\s*Log\s*<\/Button>/);
    // DS4: Scan is the page's one filled control; every Log stays orange
    // (Food10), here in its tinted form.
    expect(log).toContain('variant="nutrition-tinted"');
  });

  it("comes after the composer, so the text box and Scan are on screen when the page opens", () => {
    /* Owner call. Above the composer, the usual row put the text box
       under the tab bar for a habitual user on a 390x844 phone and on
       an SE; companion-food.capture.spec.ts checks, at 375px wide, that
       the Scan button clears the tab bar and that the row's Log comes
       after it. */
    const src = readFileSync(join(SRC, "pages/Food.tsx"), "utf8");
    const composer = src.indexOf("<FoodComposerCard");
    const usual = src.indexOf("aria-labelledby={usualHeadingId}");
    expect(composer).toBeGreaterThan(-1);
    expect(usual).toBeGreaterThan(-1);
    expect(composer).toBeLessThan(usual);
  });
});
