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

/**
 * The other half: a theme toggle immediately followed by a shot.
 *
 * `animations: "disabled"` lands CSS colours on their end state, which is
 * what fixed the frame that lied. It cannot fix the JavaScript half:
 * `useIsDarkMode` and `MuscleHeatMap` read
 * `document.documentElement.classList.contains("dark")` in JS, so a
 * `page.evaluate` toggle needs a React re-render before their colours
 * change. A screenshot in the same tick catches the previous theme — and
 * that would mis-colour a CHART, which is far harder to spot as an
 * artifact than mis-coloured text was.
 *
 * This was originally logged as untestable-from-here and ~75 sites wide.
 * It is not: 57 of the toggles already wait, and measuring found exactly
 * THREE that toggled and shot with nothing in between — two of them in the
 * one spec whose frame carried the artifact. That distribution is itself
 * the confirmation of the diagnosis, and it turned "don't fix blind" into
 * a three-line change matching a pattern the same files already use.
 *
 * Checked by looking BACKWARDS from each shot rather than forwards from
 * each toggle: a forward window spans loop boundaries and reports the next
 * iteration's shot as if it followed this iteration's reset.
 */
describe("capture specs — theme toggles settle before the shot", () => {
  const TOGGLE = /classList\.(?:add|remove)\(\s*"dark"\s*\)/;
  const SETTLE = /waitForTimeout|waitFor\(|toBeVisible|toHaveText/;
  const SHOT = /(?:\.screenshot\(|\bshoot[A-Za-z]*\()/;

  /** Statement-ish slices, so "the thing immediately before" is meaningful. */
  function statements(src: string): string[] {
    return src
      .split(/;\s*\n/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  it("no shot is taken in the same breath as a theme toggle", () => {
    const offenders: string[] = [];
    for (const f of specFiles(e2eRoot)) {
      const stmts = statements(readFileSync(f, "utf8"));
      for (let i = 0; i < stmts.length; i += 1) {
        if (!SHOT.test(stmts[i])) continue;
        const prev = stmts[i - 1] ?? "";
        /* Only the IMMEDIATELY preceding statement. Walking further back
           produces false positives: an intervening interaction (opening a
           tooltip, clicking a tab) takes real wall-clock time and settles
           the theme just as well as an explicit wait, but is unreadable as
           such from source. The three real sites were all toggle-then-shot
           with nothing between, so precision costs nothing here. */
        if (TOGGLE.test(prev) && !SETTLE.test(prev)) {
          offenders.push(
            `${relative(repoRoot, f)} :: ${stmts[i].replace(/\s+/g, " ").slice(0, 60)}`
          );
        }
      }
    }
    expect(
      offenders,
      `A screenshot taken in the same tick as a theme toggle can capture ` +
        `the PREVIOUS theme wherever the colour is read in JavaScript ` +
        `(useIsDarkMode, MuscleHeatMap) rather than in CSS. Add a settle ` +
        `between them — 57 toggles in these specs already do.`
    ).toEqual([]);
  });
});

/**
 * `fullPage` shots wait for the document to stop GROWING.
 *
 * Sibling defect to the one above, found the same way — by reading the
 * diff report rather than the app. `home-energy-default-after.png`
 * measured, across four consecutive captures with no relevant code change:
 *
 *     393x1191  ->  393x1190  ->  393x1458  ->  393x1191
 *
 * The one-pixel moves are rounding. The 267px jump is a genuinely
 * different page. Every anchor in these specs is a single element — "wait
 * until `Today's Energy` is visible" — and a `fullPage` shot is a claim
 * about the WHOLE document, so the shutter can fire while a card below the
 * fold is still mounting. A frame that swings 267px between runs cannot be
 * diffed, which means a real regression has somewhere to hide.
 *
 * This is a RATCHET, not a clean bill. Only `surfaces` is fixed — it is
 * the one where the flake was measured, and the other specs shoot pages
 * whose settling behaviour has not been reasoned about individually.
 * Adoption is one `await settleFullPageHeight(page)` before the shot. The
 * count below must not GROW; lower it as specs adopt the helper.
 */
const UNSETTLED_FULLPAGE_SPECS = 16;

describe("capture specs — fullPage shots settle the document height", () => {
  const files = specFiles(e2eRoot);

  /** Specs that take a fullPage shot without awaiting the settle helper. */
  function unsettled(): string[] {
    return files
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        /* The CALL, not the mention. Matching the bare identifier counts
           the import line, so a spec that imports the helper and never
           awaits it would read as settled — which is precisely the state
           a half-finished edit leaves behind. */
        return (
          /fullPage:\s*true/.test(src) &&
          !/await\s+settleFullPageHeight\s*\(/.test(src)
        );
      })
      .map((f) => relative(repoRoot, f))
      .sort();
  }

  it("surfaces.screens.capture.spec.ts settles — it is the measured case", () => {
    const src = readFileSync(
      resolve(e2eRoot, "screenshots/surfaces.screens.capture.spec.ts"),
      "utf8"
    );
    expect(src).toMatch(/fullPage:\s*true/);
    expect(
      src,
      "the spec whose frame swung 267px between runs must await the settle " +
        "helper before shooting"
    ).toContain("await settleFullPageHeight(page)");
  });

  it("the helper it depends on exists and polls document height", () => {
    /* Without this, the assertion above passes against a call to a helper
       nobody wrote — the spec would fail only in CI, minutes in. */
    const helper = readFileSync(
      resolve(e2eRoot, "helpers/settleHeight.ts"),
      "utf8"
    );
    expect(helper).toContain("export async function settleFullPageHeight");
    expect(helper).toContain("document.documentElement.scrollHeight");
  });

  it("the set of unsettled fullPage specs does not grow", () => {
    const offenders = unsettled();
    expect(
      offenders.length,
      offenders.length > UNSETTLED_FULLPAGE_SPECS
        ? `A new spec takes a fullPage shot without settling the document ` +
            `height first. Its frame can swing by a whole card between runs, ` +
            `which makes it undiffable. Add ` +
            `\`await settleFullPageHeight(page)\` before the shot.\n` +
            offenders.join("\n")
        : `Unsettled fullPage specs dropped to ${offenders.length} — lower ` +
            `UNSETTLED_FULLPAGE_SPECS to lock the gain in. At 0, delete this ` +
            `ratchet and assert the property outright.`
    ).toBe(UNSETTLED_FULLPAGE_SPECS);
  });
});
