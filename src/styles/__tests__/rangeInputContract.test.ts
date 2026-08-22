import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
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

  it("declares a colour scheme, so anything still UA-painted follows the theme", () => {
    const rule = block('input[type="range"]');
    expect(rule).toMatch(/color-scheme:\s*light dark/);
  });

  it("keeps the input's own background out of the way", () => {
    // The 44px is hit area, not a bar. Without a transparent background
    // the input box would paint a 44px slab behind the UA track — the
    // other obvious wrong way to satisfy the floor.
    const rule = block('input[type="range"]');
    expect(rule).toMatch(/background:\s*transparent/);
  });
});
