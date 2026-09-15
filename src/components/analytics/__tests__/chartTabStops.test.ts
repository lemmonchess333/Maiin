import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Decorative charts must opt out of Recharts' accessibility layer.
 *
 * Recharts 3 defaults `accessibilityLayer` to TRUE, which puts
 * `tabIndex="0"` on the chart's own <svg>. That is a feature on a chart
 * a reader is meant to explore, and a defect on one that is decoration.
 *
 * Two on the Analytics tab were the latter, and the components had each
 * already said so in their own words:
 *
 *   MacroDistribution wraps its donut in `aria-hidden="true"` because the
 *   legend beside it announces the same numbers as text — and its comment
 *   names the exact rule this breaks: "a tab-stop inside an aria-hidden
 *   subtree — that's the axe-core aria-hidden-focus violation". It guards
 *   with `rootTabIndex={-1}`, a <Pie> prop, which cannot reach the
 *   surface. Measured in the browser, the guard was defeated:
 *     svg[tabindex=0] < div.recharts-wrapper < … < div.size-24[aria-hidden]
 *
 *   StatCard calls its sparkline decorative and sets `pointerEvents:
 *   none` to "remove the misleading hover affordance" — the MOUSE one.
 *   The keyboard one stayed: four unnamed tab stops on the Analytics tab,
 *   each announcing nothing, above a figure that is already text.
 *
 * Browser-measured after the opt-outs: aria-hidden-focus 1 -> 0, focusable
 * elements 34 -> 29, unnamed focusables 10 -> 5 (the five left are the
 * bottom-nav's inner divs, app-shell rather than Analytics).
 *
 * This is a source scan because the property is a source-level contract —
 * a prop that must be passed — and because jsdom gives ResponsiveContainer
 * no dimensions, so the rendered tree it would assert against is empty.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("Recharts' accessibility layer", () => {
  it("still defaults to true, which is why the opt-outs exist", () => {
    /* Read from the installed types rather than asserted from memory: if
       Recharts ever flips this, these opt-outs become redundant and the
       reasoning above stops applying. */
    const types = read("node_modules/recharts/types/chart/PieChart.d.ts");
    expect(types).toMatch(/readonly accessibilityLayer:\s*true/);
  });
});

describe("decorative charts do not take a tab stop", () => {
  it("MacroDistribution's donut opts out — it is inside aria-hidden", () => {
    const src = read("src/components/analytics/MacroDistribution.tsx");
    // The container really is aria-hidden; without this the rule below is
    // about a hazard that no longer exists.
    expect(src).toMatch(/aria-hidden="true"/);
    expect(src).toMatch(/<PieChart accessibilityLayer=\{false\}>/);
  });

  it("StatCard's sparkline opts out — the component calls it decorative", () => {
    const src = read("src/components/analytics/StatCard.tsx");
    expect(src).toMatch(/Sparkline is decorative/);
    expect(src).toMatch(/accessibilityLayer=\{false\}/);
  });

  it("does not switch it off on the charts a reader explores", () => {
    /* The opposite mistake, and the more costly one: turning the layer off
       on an informative chart REMOVES keyboard access rather than tidying
       it. These four are the page's real charts. */
    for (const f of [
      "src/components/analytics/VolumeChart.tsx",
      "src/components/analytics/TrainingLoadCard.tsx",
      "src/components/analytics/PerformanceIndexChart.tsx",
      "src/components/run/RunningHistorySection.tsx",
    ]) {
      expect(read(f), f).not.toMatch(/accessibilityLayer=\{false\}/);
    }
  });
});
