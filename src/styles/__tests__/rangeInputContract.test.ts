import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The app's only drag control, and it had two defects at once.
 *
 * `input[type="range"]` appears in exactly two places — the run-days
 * slider on the onboarding race step, and `RunSetupModal`. The onboarding
 * one is the only drag control in the first-run flow and it sets weekly
 * run volume, so both defects reached every race-prep user:
 *
 * 1. **A 6px control.** The height was on the INPUT, so the tap-to-jump
 *    track was 6px and the thumb 14px, against a documented 44px floor.
 *    The design-system touch-target ratchet cannot see this — it scans
 *    `role="switch"` elements only.
 *
 * 2. **Inverted in dark mode.** `accent-color` paints only the FILLED
 *    portion and the thumb; the groove was UA-painted and measured
 *    byte-identical #EFEFEF in BOTH themes — 16.5:1 on the dark page,
 *    about 4x the luminance of the purple fill beside it, so the
 *    brightest mass on the step was the part the user had NOT selected.
 *    On light it is 1.03:1: invisible. One colour, wrong at both ends.
 *
 * Pinned in CSS rather than by rendering, because jsdom has no layout and
 * no UA stylesheet — the thing that went wrong here is precisely what a
 * jsdom render cannot see. The visual half is verified from capture frames
 * instead, and that verification earned its keep immediately: the FIRST
 * fix painted the runnable track with a token, which reads as the more
 * principled change and is wrong, because in Chromium the accent fill IS
 * the track background. The frame showed the bar go uniform with only a
 * 10px thumb left — the fix had deleted the filled-progress indication.
 * `color-scheme` themes the groove WITHOUT touching the fill, which is why
 * the assertions below pin that and explicitly bar the other.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(resolve(repoRoot, "src/index.css"), "utf8");

/** The declaration block for a selector, or null. */
function block(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? null;
}

describe("range input — the app's only drag control", () => {
  it("the input itself clears the 44px touch floor", () => {
    const rule = block('input[type="range"]');
    expect(rule, "no input[type=range] rule in index.css").not.toBeNull();
    const height = /height:\s*(\d+)px/.exec(rule!)?.[1];
    expect(
      Number(height),
      `The range input is ${height}px tall. DESIGN_GUIDE puts the touch ` +
        `floor at 44px, and this is the only drag control in the first-run ` +
        `flow. Put the visual thickness on the TRACK pseudo-elements, not ` +
        `on the input box.`
    ).toBeGreaterThanOrEqual(44);
  });

  it("does NOT paint the track background — that erases the accent fill", () => {
    /* The wrong fix, kept as an assertion because it is the one that looks
       right. Painting the runnable track with a token seems more
       principled than declaring a colour scheme, and in Chromium the
       accent-color FILL is painted AS the track background — so styling
       the track replaces it. Measured from the capture frame: the bar went
       uniform #2A2A2D with only a 10px purple thumb, where before it ran
       purple from x21 to x146. The slider kept its thumb and lost its
       filled-progress bar entirely. */
    for (const sel of [
      'input[type="range"]::-webkit-slider-runnable-track',
      'input[type="range"]::-moz-range-track',
    ]) {
      const rule = block(sel);
      if (rule === null) continue;
      expect(
        rule,
        `${sel} sets a background. In Chromium the accent-color fill IS ` +
          `the track background, so this erases it — the slider keeps its ` +
          `thumb and loses its filled bar. Use \`color-scheme\` on the ` +
          `input instead; it themes the groove without touching the fill.`
      ).not.toMatch(/background:/);
    }
  });

  it("does NOT declare its own colour scheme — the root does, per theme", () => {
    /* The second wrong turn. `color-scheme: light dark` on the control
       means "pick by the USER'S OS preference", i.e. the device's setting
       rather than the app's — and Tropos switches theme with a `.dark`
       CLASS. On a light-set phone running Tropos in dark mode it changes
       nothing, which is the original bug. Declared at the theme blocks
       instead, so it follows the class and covers every UA-painted
       control (date pickers, selects, scrollbars, spinners) at once. */
    const rule = block('input[type="range"]');
    expect(
      rule,
      "`color-scheme` on the control follows the DEVICE, not the `.dark` " +
        "class. Declare it at :root / .dark instead."
    ).not.toMatch(/color-scheme:/);
  });

  it("the theme blocks declare the scheme, so UA controls follow the class", () => {
    expect(block(":root"), ":root must declare color-scheme: light").toMatch(
      /color-scheme:\s*light\s*;/
    );
    expect(block(".dark"), ".dark must declare color-scheme: dark").toMatch(
      /color-scheme:\s*dark\s*;/
    );
  });

  it("no component overrides the scheme back to an OS-driven choice", () => {
    // Two date inputs carried `[color-scheme:light_dark]`, which overrides
    // the inherited per-theme value with the device preference.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const full = resolve(dir, name);
        if (statSync(full).isDirectory()) {
          if (name === "__tests__" || name === "node_modules") continue;
          out.push(...walk(full));
          continue;
        }
        if (name.endsWith(".tsx")) out.push(full);
      }
      return out;
    };
    const offenders = walk(resolve(repoRoot, "src")).filter((f) =>
      /color-scheme:light_dark|color-scheme:\s*light dark/.test(
        readFileSync(f, "utf8")
      )
    );
    expect(
      offenders.map((f) => f.replace(repoRoot + "/", "")),
      "These override the per-theme scheme with the DEVICE preference."
    ).toEqual([]);
  });

  it("keeps the input's own background out of the way", () => {
    // The 44px is hit area, not a bar. Without a transparent background
    // the input box would paint a 44px slab behind the UA track — the
    // other obvious wrong way to satisfy the floor.
    const rule = block('input[type="range"]');
    expect(rule).toMatch(/background:\s*transparent/);
  });
});
