/**
 * The weight chart lived inside the Nutrition section, and a user who had
 * never logged a meal could not see it at all.
 *
 * Three branches of that section each rendered `TrendWeight` behind a
 * comment explaining that weight is independent of meal logging —
 * "returning users get their weight chart even when nutrition is dormant",
 * "a user logging weight without meals still gets a chart". The section's
 * own gate disagreed with all three: `showNutritionSection` is
 * `nutritionHasLifetime || nutritionHasWindow`, and both of those count
 * MEALS. Log your weight every morning and never open Food, and Analytics
 * showed you no weight chart, because the wrapper around it was asking a
 * question about food.
 *
 * So this is a placement fix that happens to close a defect. Weight is a
 * body measurement, not a food one — MacroFactor puts it beside
 * expenditure, Happy Scale gives it a screen of its own — and a `Body`
 * section gated on nothing but the tab satisfies the taxonomy and the
 * three comments at once.
 *
 * Written against the SOURCE, following `HistoryLifetimeTiles.test.tsx`
 * and `HistoryNutritionTargets.test.tsx`: History mounts charts, maps and
 * several Firestore hooks, and a render test of it would pin fixtures
 * rather than this property. What must hold is structural and local.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const historyRaw = readFileSync(
  resolve(repoRoot, "src/pages/History.tsx"),
  "utf8"
);
const history = stripComments(historyRaw);

/** The block from a section's id to the start of the next section.
 *  Anchored on the id alone: the opening tag is prettier-formatted and
 *  wraps across lines as attributes are added, so a combined literal
 *  would report a rename of nothing. */
function sectionFrom(id: string): string {
  const start = history.indexOf(`id="${id}"`);
  expect(start, `no <section id="${id}"> in History.tsx`).toBeGreaterThan(-1);
  const next = history.indexOf("<section\n", start + 1);
  return history.slice(start, next === -1 ? undefined : next);
}

describe("Body section — the weight chart stands on its own", () => {
  it("exists, and holds the weight chart", () => {
    const body = sectionFrom("analytics-body");
    expect(body).toContain("<TrendWeight />");
    expect(body).toContain("Body");
  });

  it("is not gated on meal logging", () => {
    /* The assertion that closes the defect. The 250 characters before the
       section's id carry its render condition; `showNutritionSection`
       appearing there would put the weight chart back behind a question
       about food. */
    const at = history.indexOf('id="analytics-body"');
    const condition = history.slice(Math.max(0, at - 250), at);
    expect(condition).not.toContain("showNutritionSection");
    expect(condition).not.toContain("nutritionHas");
    expect(condition).not.toContain("mealsLoading");
    /* And it IS gated on something — an unconditional section would
       render on the PRs and Badges tabs too. */
    expect(condition).toContain('filter === "analytics"');
  });

  it("no longer renders inside the Nutrition section", () => {
    /* Three copies with three workaround comments were the symptom. One
       copy, in the right place, is the fix — a stray fourth would put the
       page back to printing the same chart twice for a user who logs
       both. */
    expect(sectionFrom("analytics-nutrition")).not.toContain("<TrendWeight");
    const renders = history.match(/<TrendWeight\s*\/>/g) ?? [];
    expect(renders).toHaveLength(1);
  });

  it("sits between Lifting and Nutrition", () => {
    /* Reading order is the taxonomy: what you did, then what your body
       did, then what you ate. */
    const lifting = history.indexOf('id="analytics-lifting"');
    const body = history.indexOf('id="analytics-body"');
    const nutrition = history.indexOf('id="analytics-nutrition"');
    expect(lifting).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(lifting);
    expect(nutrition).toBeGreaterThan(body);
  });
});
