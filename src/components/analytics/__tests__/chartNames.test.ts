import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A chart a reader can tab to has to say what it is.
 *
 * Recharts 3's accessibility layer gives each chart `tabIndex="0"` AND
 * `role="application"`. That role is not a decoration: it tells a screen
 * reader to hand keystrokes to the widget instead of using its own
 * navigation. Landing in an unnamed application region is worse than
 * landing on an unnamed button — the reader is inside something, with no
 * idea what, and its usual keys no longer work.
 *
 * Measured in the browser on the Analytics tab, signed in:
 *
 *   role=application  label=null   x5
 *
 * This was missed by the sweep that removed the DECORATIVE tab stops,
 * because that probe fell back to `textContent` to decide whether an
 * element was named — and a chart surface has plenty of text in it (axis
 * ticks). Under `role="application"` the accessible name does not come
 * from contents, so five charts read as named and were not.
 *
 * `RootSurface` spreads unknown props onto the <svg>, so `aria-label` on
 * the chart component reaches it; confirmed in the browser rather than
 * assumed, all five labels now present.
 */
const read = (p: string) => readFileSync(p, "utf8");

/** The five charts that keep Recharts' accessibility layer. */
const CHARTS: [string, string][] = [
  ["src/components/analytics/VolumeChart.tsx", "<BarChart"],
  ["src/components/analytics/TrainingLoadCard.tsx", "<ComposedChart"],
  ["src/components/analytics/PerformanceIndexChart.tsx", "<AreaChart"],
  ["src/components/run/RunningHistorySection.tsx", "<BarChart"],
  ["src/components/progress/CalorieBalanceChart.tsx", "<BarChart"],
];

describe("every keyboard-reachable chart is named", () => {
  for (const [file, tag] of CHARTS) {
    it(`${file.split("/").pop()} labels its ${tag}`, () => {
      const src = read(file);
      // Anchor: the chart is really there, so a rename cannot make this
      // assertion pass by matching nothing.
      expect(src, `${file} no longer renders ${tag}`).toContain(tag);
      const opening = src.slice(src.indexOf(tag));
      const props = opening.slice(0, opening.indexOf(">"));
      expect(props, `${tag} in ${file} has no aria-label`).toMatch(
        /aria-label/
      );
    });
  }

  it("the running chart's label is its visible caption, not a second name", () => {
    /* A chart called one thing on screen and another to a reader is two
       charts. This one has a caption that already varies with the bin and
       the reader's unit, so the label is that same expression. */
    const src = read("src/components/run/RunningHistorySection.tsx");
    const caption = "{BIN_CAPTION[granularity]} ({distanceUnitLabel(unit)})";
    expect(src).toContain(caption);
    expect(src).toMatch(
      /aria-label=\{`\$\{BIN_CAPTION\[granularity\]\} \(\$\{distanceUnitLabel\(unit\)\}\)`\}/
    );
  });
});
