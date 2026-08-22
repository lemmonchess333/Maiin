/**
 * Every capture screenshot freezes animations.
 *
 * The capture channel is the app's design-review instrument, and a frame
 * that lies is worse than a missing one — it sends a reviewer after a
 * defect that is not there. One did. `weekly-review-dark.png` showed the
 * Momentum check-in's segmented options at 2.96:1 against their own track
 * while every other muted string on the same frame sat at 5.51:1. The
 * component was innocent: identical markup on Social measured correctly,
 * and a scan of every dark frame found the offending colour — the LIGHT
 * theme's `--muted-foreground`, exactly — in that one file and nowhere
 * else.
 *
 * The cause was the capture, not the app. The specs switch theme by
 * toggling the `dark` class and shooting immediately, and
 * `SegmentedControl` carries `motion-safe:transition-colors`, so the frame
 * caught its options at the start of the colour transition, still holding
 * the light value. Nothing else on the page transitions colour, which is
 * why only that control looked wrong.
 *
 * `animations: "disabled"` fast-forwards finite transitions to completion
 * (verified against the installed playwright-core types, not assumed), so
 * the colour lands on its end state. It also removes entry-animation and
 * count-up phase from every frame, which is the other reason to keep it:
 * the diff report is only readable if a frame changes when the UI changes,
 * not when the timing does.
 *
 * Pinned because it is one option in an options bag — the easiest thing in
 * the world to drop while editing a spec, and invisible when it goes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const e2eRoot = resolve(repoRoot, "e2e");

function specFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...specFiles(full));
      continue;
    }
    if (name.endsWith(".spec.ts")) out.push(full);
  }
  return out;
}

/** `page.screenshot({ … })` calls, with the option bag up to its close. */
function screenshotCalls(src: string): string[] {
  return [...src.matchAll(/\.screenshot\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
}

describe("capture specs — frozen animations", () => {
  const files = specFiles(e2eRoot);

  it("finds the capture specs — the fixture this rests on", () => {
    // Without a floor, a renamed directory would leave the assertion below
    // passing over an empty list.
    const withShots = files.filter(
      (f) => screenshotCalls(readFileSync(f, "utf8")).length > 0
    );
    expect(withShots.length).toBeGreaterThanOrEqual(20);
  });

  it("every screenshot call disables animations", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const bag of screenshotCalls(src)) {
        if (!/animations:\s*"disabled"/.test(bag)) {
          offenders.push(
            `${relative(repoRoot, f)} :: ${bag.replace(/\s+/g, " ").trim().slice(0, 70)}`
          );
        }
      }
    }
    expect(
      offenders,
      `A capture without \`animations: "disabled"\` can freeze mid-transition ` +
        `and report a defect the app does not have — which is exactly how ` +
        `weekly-review-dark came to show a 2.96:1 contrast failure in a ` +
        `component that measures 5.51:1 everywhere else.`
    ).toEqual([]);
  });
});
