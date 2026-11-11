/**
 * The Food page's order, as the owner set it from the Food options page
 * (2026-09-20): the meal leads the composer's field (a chip inside it
 * since Food11 call 3, a row of pills above it before); the Pro gate
 * is one line under the field, not a card above the composer; and the
 * weekly-focus card follows the diary instead of interrupting it.
 *
 * Since Food11 (2026-11-11, call 1) the page draws no large title: the
 * date switcher, which shared the title's row, is the header row, and
 * the targets gear closes it.
 *
 * Source-level, because the page is a 2,000-line orchestrator no unit
 * render reaches whole, and every one of these is a question of WHERE
 * something renders rather than whether it works — the components'
 * own tests hold the behaviour. Same shape as mealDeleteCommit's
 * "Food.tsx routes its deletes through the commit".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const food = readFileSync(resolve(root, "src/pages/Food.tsx"), "utf8");
const composer = readFileSync(
  resolve(root, "src/components/food/FoodComposerCard.tsx"),
  "utf8"
);

describe("Food page order", () => {
  it("the date switcher is the header row, with no large title above the wheel", () => {
    // Both shells (cold read and loaded) hide the title, lead with the
    // bar and close the row with the targets gear; nothing renders the
    // bar as a child beneath the header.
    expect(food.match(/titleHidden\s+lead=\{dateBar\}/g)?.length).toBe(2);
    expect(food.match(/actions=\{<FoodTargetsLink \/>\}/g)?.length).toBe(2);
    expect(food).not.toMatch(/actions=\{dateBar\}/);
    expect(food).not.toMatch(/^\s*\{dateBar\}\s*$/m);
    const bar = readFileSync(
      resolve(root, "src/components/food/FoodDateBar.tsx"),
      "utf8"
    );
    // Position, not prose: the class is what would pin it.
    expect(bar, "the cluster is not pinned").not.toMatch(/["\s]sticky[\s"]/);
  });

  it("the wheel leads, then the week, then the macros (Food11 call 4)", () => {
    const hero = food.indexOf("<FoodHeroCard");
    const week = food.indexOf("<FoodWeekStrip");
    const macros = food.indexOf("<FoodMacroRow");
    const composerAt = food.indexOf("<FoodComposerCard");
    expect(hero).toBeGreaterThan(-1);
    expect(week).toBeGreaterThan(hero);
    expect(macros).toBeGreaterThan(week);
    expect(composerAt).toBeGreaterThan(macros);
    // The week strip is a sibling of the hero, not inside it: the hero is
    // remounted on every day change, which would drop the focus from the
    // day just tapped.
    const heroSource = readFileSync(
      resolve(root, "src/components/food/FoodHeroCard.tsx"),
      "utf8"
    );
    expect(heroSource).not.toContain("FoodWeekStrip");
    expect(heroSource).not.toContain("MacroColumn");
  });

  it("draws no macros on a day before the account began with nothing logged", () => {
    // Food10 (3). The hero leaves its own wheel out for such a day; the
    // macros are the page's to leave out since they became its sibling.
    const guard = food.slice(
      food.indexOf("<FoodWeekStrip"),
      food.indexOf("<FoodMacroRow")
    );
    expect(guard).toMatch(
      /beforeStart\(selectedDate, accountStartKey\) &&\s+dailyTotals\.calories === 0/
    );
  });

  it("the Pro gate is the composer's hint line, and the strip is gone", () => {
    expect(food).toContain("proHint={");
    expect(food).toContain("<FoodProHint");
    expect(food).not.toContain("FoodProStrip");
  });

  it("the field asks for no meal, and nothing says Adding to", () => {
    // The owner, 11 November 2026: the clock files a log under a meal
    // and the edit sheet moves it. A row of four meals headed the field
    // until Food11, and one chip stood in it for a day after.
    expect(composer).toContain("<textarea");
    expect(composer).not.toContain("FoodMealChip");
    expect(composer).not.toContain("<SegmentedControl");
    expect(composer).not.toContain("Adding to ${");
    expect(composer).not.toContain("Cancel adding to");
  });

  it("the weekly-focus card follows the diary", () => {
    const timeline = food.indexOf("<FoodTimeline");
    const focus = food.indexOf("<FoodConsistencyCard");
    expect(timeline).toBeGreaterThan(-1);
    expect(focus).toBeGreaterThan(timeline);
  });
});
