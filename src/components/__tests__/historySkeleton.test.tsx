/**
 * Analytics' placeholder follows the page it stands in for (Pol1).
 *
 * The route-level placeholder had drifted to a title, two rows of pills,
 * three tiles and a card while the page had become a title, the Analytics
 * / PRs / Badges switch, Performance, the range and the range card, so the
 * whole page reshuffled as it arrived; and Performance's own placeholder
 * was shorter than its card and had no Details, so the score landing
 * dropped everything under it about 70 px.
 *
 * The page's order is read from History.tsx's SOURCE, as the History
 * tests beside this one do: History mounts charts and several Firestore
 * hooks, and what has to hold here is only which section comes first.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { HistorySkeleton } from "../LoadingSkeleton";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const history = stripComments(
  readFileSync(resolve(repoRoot, "src/pages/History.tsx"), "utf8")
);

/** What renders each of the overview's blocks, as History writes it. */
const PAGE_BLOCKS: Record<string, string> = {
  title: 'title="Analytics"',
  tabs: "<FilterPills",
  performance: "<PerformanceOverviewCard",
  range: "<TimeRangePills",
  "period-summary": "<PeriodSummaryCard",
};

describe("HistorySkeleton", () => {
  it("draws the overview's blocks in the page's own order", () => {
    const pageOrder = Object.entries(PAGE_BLOCKS)
      .map(([block, marker]) => {
        const at = history.indexOf(marker);
        expect(at, `History no longer renders ${marker}`).toBeGreaterThan(-1);
        expect(
          history.indexOf(marker, at + 1),
          `${marker} renders twice; say which one this block is`
        ).toBe(-1);
        return { block, at };
      })
      .sort((a, b) => a.at - b.at)
      .map(({ block }) => block);

    const { container } = render(<HistorySkeleton />);
    const skeletonOrder = [
      ...container.querySelectorAll("[data-skeleton-for]"),
    ].map((el) => el.getAttribute("data-skeleton-for"));

    expect(skeletonOrder).toEqual(pageOrder);
  });

  it("uses the cards' own placeholders, so the page and its loading states share them", () => {
    const { container } = render(<HistorySkeleton />);
    expect(
      container.querySelector(
        '[data-skeleton-for="performance"] [data-skeleton="performance-card"]'
      )
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-skeleton-for="period-summary"] [data-skeleton="period-summary"]'
      )
    ).not.toBeNull();
  });

  it("holds the range card's place with its placeholder while the range loads", () => {
    const loading = history.indexOf('view === "overview" && dataLoading && (');
    expect(loading, "History's overview loading branch moved").toBeGreaterThan(
      -1
    );
    const branch = history.slice(loading, history.indexOf(")}", loading));
    expect(branch).toContain("<PeriodSummarySkeleton />");
  });
});
