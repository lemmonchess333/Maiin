/**
 * Where Food's colour sits, and where it does not (Food11 call 3).
 *
 * The meal was chosen from a row of pills whose selected one was a filled
 * orange button, in the composer and in EditServingsSheet. A cohesion
 * pass once moved both to the neutral track and the owner asked for the
 * orange back, because it left Food the only domain with no colour of
 * its own. Food11 answers that another way: the colour is on the person's
 * data (the wheel, the week and macro bars), and no control that chooses
 * a meal is filled. 60% of the first screen's colour was two filled
 * buttons; Together and Home had none.
 *
 * The composer asks for no meal at all since 11 November 2026: the
 * clock files a log, and the edit sheet moves it. These pin that the
 * field holds no meal control, that the edit sheet's four meals are on
 * the neutral track, and that the filled-pill look is gone from the
 * segmented control, so a sweep cannot bring it back at one call site.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "tinyglobby";

const SRC = join(process.cwd(), "src");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("the meal is chosen in neutral controls", () => {
  it("the composer's field holds no meal control: no chip, no segments, no menu", () => {
    const composer = read("components/food/FoodComposerCard.tsx");
    expect(composer).not.toContain("FoodMealChip");
    expect(composer).not.toContain("<SegmentedControl");
    expect(composer).not.toMatch(/MEAL_LABELS|MEAL_ORDER|menuitemradio/);
    expect(globSync("components/food/FoodMealChip.tsx", { cwd: SRC })).toEqual(
      []
    );
  });

  it("the edit sheet's four meals are on the neutral track, on the shared grid", () => {
    const sheet = read("components/food/EditServingsSheet.tsx");
    expect(sheet).toContain("<SegmentedControl");
    expect(sheet).toContain('ariaLabel="Meal slot"');
    expect(sheet).toContain("MEAL_PICKER_LAYOUT");
    expect(sheet).not.toMatch(/tone="nutrition"|emphasis="solid"/);
  });

  it("the segmented control has no filled-pill look to reach for", () => {
    const control = read("components/ui/SegmentedControl.tsx");
    expect(control).not.toContain("bg-nutrition-fill");
    expect(control).not.toMatch(/emphasis === "solid"/);
    const files = globSync("**/*.tsx", { cwd: SRC, absolute: true }).filter(
      (f) => !f.includes("__tests__")
    );
    const users = files.filter((f) =>
      /emphasis="solid"|tone="nutrition"/.test(readFileSync(f, "utf8"))
    );
    expect(users).toEqual([]);
  });
});

/* Owner call, 2026-09-22: the "Your usual" row's Log is the food orange.
   A purple Log sat directly above the orange meal pills, and every other
   food control on the page is orange. CLAUDE.md's Button mapping still says
   Food CTAs default to primary, and records this row as the exception — so
   a sweep that follows the default would revert it without this pin. */
describe("the usual row's Log is the food orange", () => {
  it("renders the nutrition variant, not primary", () => {
    const src = readFileSync(join(SRC, "pages/Food.tsx"), "utf8");
    const start = src.indexOf("aria-labelledby={usualHeadingId}");
    expect(
      start,
      "the usual row is still labelled by its heading"
    ).toBeGreaterThan(-1);
    const row = src.slice(start, src.indexOf("</Card>", start));
    const log = row.slice(row.lastIndexOf("<Button"));
    expect(log).toMatch(/>\s*Log\s*<\/Button>/);
    expect(log).toContain('variant="nutrition"');
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
