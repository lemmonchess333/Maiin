import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";

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

/**
 * Every chart that keeps Recharts' accessibility layer.
 *
 * The last two render on the run surfaces (RunSummary, RunDetail) rather
 * than the Analytics tab, and they are here for the reason the list
 * exists at all: they live in `src/components/analytics/`, so a reader
 * of this file would take an enumeration that skipped them as saying the
 * directory was covered. It was not — both were unnamed until the sweep
 * that added this comment.
 */
const CHARTS: [string, string][] = [
  ["src/components/analytics/VolumeChart.tsx", "<BarChart"],
  ["src/components/analytics/TrainingLoadCard.tsx", "<ComposedChart"],
  ["src/components/analytics/PerformanceIndexChart.tsx", "<AreaChart"],
  ["src/components/run/RunningHistorySection.tsx", "<BarChart"],
  ["src/components/progress/CalorieBalanceChart.tsx", "<BarChart"],
  ["src/components/analytics/SplitsBarChart.tsx", "<BarChart"],
  ["src/components/analytics/ElevationProfile.tsx", "<AreaChart"],
  ["src/components/progress/TrendWeight.tsx", "<ComposedChart"],
];

/**
 * Nothing in the analytics directory may render a Recharts root without
 * either naming it or opting out. This is the assertion that would have
 * caught the two above without anyone thinking to list them.
 */
const CHART_ROOT = /<(Bar|Area|Line|Composed|Pie|Radar|Scatter)Chart[\s>]/;

/** Every non-test .tsx under a root, recursively. */
function tsxUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = `${dir}/${name}`;
    if (statSync(full).isDirectory()) tsxUnder(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

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

  it("no chart anywhere in src is left unnamed and un-opted-out", () => {
    /* The enumeration above only covers what someone remembered to add.
       Two rounds of this sweep prove the point. The first version swept
       `src/components/analytics` alone and still missed `TrendWeight`,
       which lives under progress/, renders on the Analytics tab, and was
       unnamed — a sweep with a directory-shaped hole is the
       guard-that-looks-like-cover this repo keeps paying for. So it
       walks every .tsx under src/. */
    const offenders = tsxUnder("src").filter((f) => {
      const src = read(f);
      if (!CHART_ROOT.test(src)) return false;
      return (
        !/aria-label/.test(src) && !/accessibilityLayer=\{false\}/.test(src)
      );
    });
    expect(
      offenders,
      "a Recharts root with no aria-label and " +
        'no accessibilityLayer={false} is a focusable role="application" ' +
        "region that announces nothing"
    ).toEqual([]);
  });

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
