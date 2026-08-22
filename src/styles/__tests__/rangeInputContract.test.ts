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
 * jsdom render cannot see. The visual half is verified from capture
 * frames instead.
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

  it("the track is painted from a token, not left to the UA default", () => {
    // The UA groove is theme-blind: it measured the same #EFEFEF in dark
    // and light, which is 16.5:1 on one and 1.03:1 on the other.
    for (const sel of [
      'input[type="range"]::-webkit-slider-runnable-track',
      'input[type="range"]::-moz-range-track',
    ]) {
      const rule = block(sel);
      expect(
        rule,
        `no ${sel} rule — that engine keeps the UA groove`
      ).not.toBeNull();
      expect(
        rule,
        `${sel} must set an explicit background; a UA-painted groove does ` +
          `not follow the theme.`
      ).toMatch(/background:\s*hsl\(var\(--/);
    }
  });

  it("declares a colour scheme, so anything still UA-painted follows the theme", () => {
    const rule = block('input[type="range"]');
    expect(rule).toMatch(/color-scheme:\s*light dark/);
  });

  it("keeps the visual track thin — the 44px is hit area, not a fat bar", () => {
    // Guards the obvious wrong fix: satisfying the floor by making the
    // rendered bar 44px tall instead of the hit target.
    const track = block('input[type="range"]::-webkit-slider-runnable-track');
    const h = Number(/height:\s*(\d+)px/.exec(track!)?.[1]);
    expect(h).toBeGreaterThan(0);
    expect(h).toBeLessThanOrEqual(10);
  });
});
