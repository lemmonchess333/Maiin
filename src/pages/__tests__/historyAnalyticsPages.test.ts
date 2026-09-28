import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * DS3: Analytics is a short overview with Lifting, Running, Body and Food
 * pages behind it, chosen by `?view=`, and a Performance page behind its
 * Performance card. The one long scroll it replaced was about 4,700 px
 * tall on a phone.
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

/** The page named by the nearest `view === "…"` above a marker: the
 *  block it renders in, however long the blocks before it in that group
 *  have grown. */
const pageOf = (marker: string) => {
  const at = history.indexOf(marker);
  expect(at, `not found: ${marker}`).toBeGreaterThan(-1);
  const views = [...history.slice(0, at).matchAll(/view === "(\w+)"/g)];
  return views.length ? views[views.length - 1][1] : null;
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
    "<PerformanceOverviewCard",
    "<PeriodSummaryCard",
    "<AnalyticsTrends",
    "<AnalyticsMuscles",
    "<AnalyticsGoDeeper",
    'id="analytics-lifetime"',
  ])("%s stays on the overview", (marker) => {
    expect(pageOf(marker)).toBe("overview");
  });

  it.each(["<PerformanceSection", "<TrainingLoadCard"])(
    "%s moved to the Performance page",
    (marker) => {
      expect(pageOf(marker)).toBe("performance");
      // Once only: not also left behind on the overview.
      expect(history.split(marker).length - 1).toBe(1);
    }
  );

  it("the overview's Performance card opens the Performance page", () => {
    const card = history.slice(
      history.indexOf("<PerformanceOverviewCard"),
      history.indexOf("/>", history.indexOf("<PerformanceOverviewCard"))
    );
    expect(card).toContain('setView("performance")');
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
    expect(map).toContain('performance: "performance"');
  });

  it("opens the Performance page from Home's #performance link", () => {
    /* Home's row links to `/history#performance`. The render reads the
       anchor so the page opens first time, and the mount effect moves it
       into `?view=`. */
    expect(history).toContain('hashOpensPerformance ? "performance"');
    const anchors = history.slice(
      history.indexOf("const PERFORMANCE_ANCHORS"),
      history.indexOf("]);", history.indexOf("const PERFORMANCE_ANCHORS"))
    );
    expect(anchors).toContain('"performance"');
    expect(anchors).toContain('"performance-expanded"');
    const home = readFileSync(
      resolve(repoRoot, "src/components/home/PerformanceHeroCard.tsx"),
      "utf8"
    );
    expect(home).toContain('"/history#performance"');
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
