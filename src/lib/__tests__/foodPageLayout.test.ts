/**
 * The Food page's order, as the owner set it from the Food options page
 * (2026-09-20): the date switcher shares the title row; the composer's
 * meal pills head its field; the Pro gate is one line under the field,
 * not a card above the composer; and the weekly-focus card follows the
 * diary instead of interrupting it.
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
  it("the date switcher is the header's action, not a row of its own", () => {
    // Both shells (cold read and loaded) hand the bar to PageShell's
    // action slot; nothing renders it as a child beneath the title.
    expect(food.match(/actions=\{dateBar\}/g)?.length).toBe(2);
    expect(food).not.toMatch(/^\s*\{dateBar\}\s*$/m);
    const bar = readFileSync(
      resolve(root, "src/components/food/FoodDateBar.tsx"),
      "utf8"
    );
    // Position, not prose: the class is what would pin it.
    expect(bar, "the cluster is not pinned").not.toMatch(/["\s]sticky[\s"]/);
  });

  it("the Pro gate is the composer's hint line, and the strip is gone", () => {
    expect(food).toContain("proHint={");
    expect(food).toContain("<FoodProHint");
    expect(food).not.toContain("FoodProStrip");
  });

  it("the meal pills come before the field, and nothing says Adding to", () => {
    const pills = composer.indexOf("<SegmentedControl");
    const field = composer.indexOf("<textarea");
    expect(pills).toBeGreaterThan(-1);
    expect(pills).toBeLessThan(field);
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
