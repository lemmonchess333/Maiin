import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * DS3: Analytics is a short overview with Lifting, Running, Body and Food
 * pages behind it, chosen by `?view=`. The one long scroll it replaced was
 * about 4,700 px tall on a phone.
 *
 * Pinned at the source, as the other History tests are: the page mounts
 * charts, maps and several Firestore hooks, and a render test would pin
 * fixtures rather than which block renders on which page.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const history = readFileSync(resolve(repoRoot, "src/pages/History.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

/** The render condition just before a marker. */
const conditionBefore = (marker: string, span = 160) => {
  const at = history.indexOf(marker);
  expect(at, `not found: ${marker}`).toBeGreaterThan(-1);
  return history.slice(Math.max(0, at - span), at);
};

describe("Analytics — each discipline on its own page", () => {
  it.each([
    ["analytics-running", "running"],
    ["analytics-lifting", "lifting"],
    ["analytics-body", "body"],
    ["analytics-nutrition", "food"],
  ])("<section id=%s> renders on the %s page only", (id, view) => {
    expect(conditionBefore(`id="${id}"`)).toContain(`view === "${view}"`);
  });

  it("keeps the saved-workout list with Lifting", () => {
    expect(conditionBefore("<WorkoutHistoryList")).toContain(
      'view === "lifting"'
    );
  });

  it.each([
    "<PerformanceSection",
    "<PeriodOverview",
    "<AnalyticsGoDeeper",
    'id="analytics-lifetime"',
  ])("%s stays on the overview", (marker) => {
    expect(conditionBefore(marker, 260)).toContain('view === "overview"');
  });

  it("gives every page but the overview a way back", () => {
    expect(conditionBefore("<AnalyticsBackRow")).toContain(
      'view !== "overview"'
    );
  });
});

describe("Analytics — links into the pages", () => {
  it("lands a pre-split ?tab= link on the page it named", () => {
    const map = history.slice(
      history.indexOf("const LEGACY_TAB_TO_VIEW"),
      history.indexOf("};", history.indexOf("const LEGACY_TAB_TO_VIEW"))
    );
    expect(map).toContain('running: "running"');
    expect(map).toContain('lifting: "lifting"');
    expect(map).toContain('nutrition: "food"');
  });

  it("pushes a page, so the back gesture returns to the overview", () => {
    const setView = history.slice(
      history.indexOf("const setView = useCallback("),
      history.indexOf("[setSearchParams]", history.indexOf("const setView"))
    );
    expect(setView).toContain('updated.set("view", next)');
    expect(setView).not.toContain("replace: true");
  });

  it("sends Train's workout-history link to the Lifting page", () => {
    const program = readFileSync(
      resolve(repoRoot, "src/pages/Program.tsx"),
      "utf8"
    );
    expect(program).toContain('"/history?view=lifting"');
  });
});
