import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import MuscleHeatMap from "../MuscleHeatMap";

vi.mock("react-body-highlighter", () => ({
  default: () => <svg data-testid="body-model" />,
}));
vi.mock("@/components/BodyMapGlow", () => ({
  default: () => null,
}));

/**
 * The heat map's legend row is a group name and its set count. Two things
 * were wrong with the count.
 *
 * It was a plural noun with no singular, so a group trained once read
 * "1 sets" — reachable by anyone who does a single set of an accessory.
 * And the numeral face was painting the word alongside the figure, which
 * the house rule scopes to numerals: the count belongs in `font-mono`
 * and `tabular-nums`, the word does not.
 */

function renderLegend(data: Record<string, number>) {
  render(<MuscleHeatMap data={data} />);
}

/** The legend row for one group — the flex item holding its dot, name
 *  and count. `getByText` cannot match "1 set" directly because the
 *  figure sits in its own span, which is the point of the second fix. */
function rowFor(group: string): HTMLElement {
  return screen.getByText(group).closest("div.flex.items-center")!;
}

describe("muscle legend set counts", () => {
  it("says set, not sets, for a group trained once", () => {
    renderLegend({ Chest: 1 });
    expect(rowFor("Chest").textContent).toMatch(/1\s*set$/);
    expect(rowFor("Chest").textContent).not.toMatch(/sets/);
  });

  it("still says sets for every other count", () => {
    renderLegend({ Chest: 2, Back: 12 });
    expect(rowFor("Chest").textContent).toMatch(/2\s*sets$/);
    expect(rowFor("Back").textContent).toMatch(/12\s*sets$/);
  });

  it("puts the figure in the numeral face and the word outside it", () => {
    renderLegend({ Chest: 9 });
    const figure = screen.getByText("9");
    expect(figure).toHaveClass("font-mono");
    expect(figure).toHaveClass("tabular-nums");
    // The word rides the enclosing span, which must not carry either.
    const label = figure.parentElement!;
    expect(label.textContent).toMatch(/9\s*sets/);
    expect(label).not.toHaveClass("font-mono");
    expect(label).not.toHaveClass("tabular-nums");
  });
});

describe("the recovery table's second block is not described as legacy", () => {
  /* `muscleGroupTaxonomy.ts`'s header calls this misdescription a live
     deletion hazard: the CATEGORY_DISPLAY keys are what a saved workout
     stores TODAY and the only route a custom exercise takes, so pruning
     them as historical would silently drop those groups off the legend.
     Both files' headers were rewritten to say so. The comment sitting ON
     the table in `muscleRecovery.ts` was missed and still said "legacy
     alias rows ... of old workout docs" — which is the line a reader
     trimming dead code actually reads. */
  const SOURCES = [
    "src/lib/muscleRecovery.ts",
    "src/components/analytics/muscleGroupTaxonomy.ts",
  ];

  it.each(SOURCES)("%s", (path) => {
    const src = readFileSync(path, "utf8");
    const offenders = src
      .split("\n")
      .map((line, i) => [i + 1, line] as const)
      .filter(
        ([, line]) =>
          /^\s*(\/\/|\/\*|\*)/.test(line) &&
          // Quoted, the phrase is the CORRECTION idiom — both headers
          // name the old wording in order to reject it. Unquoted, it is
          // the claim itself.
          /legacy alias|old workout doc/i.test(line.replace(/"[^"]*"/g, ""))
      );
    expect(
      offenders.map(([n, l]) => `${n}: ${l.trim()}`),
      "a comment describing the CATEGORY_DISPLAY rows as legacy or as old " +
        "documents — they are what production writes now"
    ).toEqual([]);
  });
});
