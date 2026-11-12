import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * DS3: Analytics is a short overview with Lifting, Running, Body and Food
 * pages behind it, chosen by `?view=`. The one long scroll it replaced
 * was about 4,700 px tall on a phone.
 *
 * There was a fifth page, Performance, behind the overview's Performance
 * card. Trim1 call 5 (11 November 2026) made that card the one place the
 * score is shown, and what the page held opens under it in place: five
 * views, not six.
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
    "<PerformanceSection",
    "<TrainingLoadCard",
    "<PeriodSummaryCard",
    "<AnalyticsTrends",
    "<AnalyticsMuscles",
    "<AnalyticsGoDeeper",
    'id="analytics-lifetime"',
  ])("%s stays on the overview", (marker) => {
    expect(pageOf(marker)).toBe("overview");
  });

  it.each(["<PerformanceSection", "<TrainingLoadCard"])(
    "%s is mounted once",
    (marker) => {
      expect(history.split(marker).length - 1).toBe(1);
    }
  );

  it("has no Performance page: four pages and the overview", () => {
    const views = history.slice(
      history.indexOf("const ANALYTICS_VIEWS"),
      history.indexOf("];", history.indexOf("const ANALYTICS_VIEWS"))
    );
    expect(views.match(/"\w+"/g)).toEqual([
      '"lifting"',
      '"running"',
      '"body"',
      '"food"',
    ]);
    expect(history).not.toMatch(/view === "performance"/);
    expect(history).not.toContain('setView("performance")');
  });

  it("draws the training load inside the score's details, read only while they are open", () => {
    const section = history.slice(
      history.indexOf("<PerformanceSection"),
      history.indexOf("</PerformanceSection>")
    );
    expect(section).toContain("<TrainingLoadCard");
    expect(section).toContain("detailsOpen={scoreOpen}");
    const hook = history.slice(
      history.indexOf("useTrainingLoadSeries(rangeDays"),
      history.indexOf("});", history.indexOf("useTrainingLoadSeries(rangeDays"))
    );
    expect(hook).toContain(
      'enabled: filter === "analytics" && view === "overview" && scoreOpen'
    );
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
    // Performance named a page once. It opens the score's details now.
    expect(map).not.toContain("performance");
  });

  it("opens the score's details from every link that named Performance", () => {
    /* Home's row linked to `/history#performance` until Trim1 call 1 took
       the score off Home, the overview's card to `?view=performance`
       until call 5, and older links to `?tab=performance`. Links already
       saved and sent still do. The render reads all three, so the details
       are open first time, and the mount effect moves that into
       `?score=details`. */
    const reads = history.slice(
      history.indexOf("const linkNamesPerformance"),
      history.indexOf("const setScoreOpen")
    );
    expect(reads).toContain("viewFromUrl === RETIRED_PERFORMANCE_VIEW");
    expect(reads).toContain("tabFromUrl === RETIRED_PERFORMANCE_VIEW");
    expect(reads).toContain("PERFORMANCE_ANCHORS.has(");
    expect(reads).toContain(
      "searchParams.get(SCORE_PARAM) === SCORE_DETAILS || linkNamesPerformance"
    );
    expect(history).toContain('const RETIRED_PERFORMANCE_VIEW = "performance"');
    const anchors = history.slice(
      history.indexOf("const PERFORMANCE_ANCHORS"),
      history.indexOf("]);", history.indexOf("const PERFORMANCE_ANCHORS"))
    );
    expect(anchors).toContain('"performance"');
    expect(anchors).toContain('"performance-expanded"');
    // The rewrite: the dead `view` goes, the fold's state takes its place.
    expect(history).toContain('if (retiredView) updated.delete("view")');
    expect(
      history.split("updated.set(SCORE_PARAM, SCORE_DETAILS)").length - 1
    ).toBeGreaterThanOrEqual(3);
  });

  it("opens the fold with a replace: it is not a place to go back to", () => {
    const setScoreOpen = history.slice(
      history.indexOf("const setScoreOpen = useCallback("),
      history.indexOf(
        "[setSearchParams]",
        history.indexOf("const setScoreOpen")
      )
    );
    expect(setScoreOpen).toContain("replace: true");
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

  it("draws one control row on a page: the way back, with the range beside it", () => {
    // The tab switch is the overview's (and the PRs and Badges tabs').
    expect(conditionBefore("<FilterPills")).toContain(
      '(filter !== "analytics" || view === "overview")'
    );
    // The range on a page shares the way back's row; on the overview it
    // keeps its place under the week's index.
    const row = history.slice(
      history.indexOf("<AnalyticsBackRow"),
      history.indexOf("</div>", history.indexOf("<AnalyticsBackRow"))
    );
    expect(row).toContain("<TimeRangePills");
    expect(conditionBefore("<TimeRangePills selected={timeRange}", 60)).toMatch(
      /view === "overview"/
    );
  });
});

describe("Analytics — one card radius (§14m rule 20)", () => {
  it("sets it once on the screen's root, and on an exercise's page", () => {
    expect(history).toMatch(/className=\{ONE_CARD_RADIUS\}/);
    const exercise = readFileSync(
      resolve(repoRoot, "src/pages/ExerciseHistory.tsx"),
      "utf8"
    );
    expect(exercise.match(/\$\{ONE_CARD_RADIUS\}/g)?.length).toBe(2);
    const primitive = readFileSync(
      resolve(repoRoot, "src/components/ui/cardClasses.ts"),
      "utf8"
    );
    // 16pt: rounded-xl is --radius + 6px on the 10px base.
    expect(primitive).toContain(
      'ONE_CARD_RADIUS = "[&_.rounded-2xl]:rounded-xl"'
    );
  });
});
