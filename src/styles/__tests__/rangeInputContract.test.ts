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
 * instead, and that verification earned its keep three times over, because
 * (2) took THREE attempts and every one of them looked right:
 *
 *   a. Paint the runnable track with a token. In Chromium the accent fill
 *      IS the track background, so this replaced it — the frame showed a
 *      uniform bar with a lone 10px thumb.
 *   b. `color-scheme: light dark` on the control. That value means "follow
 *      the USER'S OS preference"; Tropos themes with a `.dark` CLASS, so on
 *      a light-set phone in dark mode it changes nothing.
 *   c. `color-scheme` per theme at `:root` / `.dark`. Correct on its own
 *      terms — every UA-painted control now follows the app — but the next
 *      frame measured the groove at 239,239,239 still. Chromium does not
 *      re-derive a range groove from the colour scheme.
 *
 * Which exhausts fixing the groove alone, so the track is painted whole:
 * `accent-color` is gone and both halves come from tokens, the fill as a
 * hard-stopped gradient at `--range-pct`. That inverts (a) from a
 * prohibition into a requirement — see the assertion, which keeps the old
 * reasoning rather than deleting it, because the old rule was CORRECT
 * under a premise that no longer holds.
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

  it("if the WebKit track is painted, it carries the FILL too", () => {
    /* The inverted form of what used to be a flat prohibition here, and
       the inversion is the whole lesson.

       While `accent-color` supplied the fill, painting the runnable track
       DELETED it — in Chromium the accent fill is painted as the track
       background. Measured from the capture frame at the time: the bar
       went uniform #2A2A2D with a lone 10px thumb, where before it ran
       purple x21-146. So "never paint the track" was right, conditionally.

       Nothing supplies a fill any more (`appearance: none` would ignore
       `accent-color` regardless), so the condition is void and the rule it
       implied would now FORBID the only working fix. What survives is the
       real invariant: a painted track must paint both halves. A background
       naming only one colour is the failure the old rule was reaching for. */
    const rule = block('input[type="range"]::-webkit-slider-runnable-track');
    expect(
      rule,
      "no runnable-track rule — the groove is UA-painted again, " +
        "which is the original defect (one hard-coded grey in both themes)"
    ).not.toBeNull();
    expect(
      rule,
      "the track is painted but has no fill stop. A single flat background " +
        "is a groove with no filled-progress indication — the exact frame " +
        "the first attempt at this produced."
    ).toMatch(/var\(--range-pct/);
    expect(rule, "the fill must come from a token, not a literal").toMatch(
      /hsl\(var\(--primary-strong\)\)/
    );
    expect(rule, "the groove must come from a token, not a literal").toMatch(
      /hsl\(var\(--muted\)\)/
    );
  });

  it("Firefox gets its own fill — it must not depend on --range-pct", () => {
    /* Firefox has a real `::-moz-range-progress`, so it needs no custom
       property. Worth pinning because the tempting simplification is one
       shared gradient, which would make every Firefox slider silently
       depend on plumbing only the WebKit path needs. */
    const progress = block('input[type="range"]::-moz-range-progress');
    expect(
      progress,
      "no ::-moz-range-progress — Firefox has no fill"
    ).not.toBeNull();
    expect(progress).toMatch(/hsl\(var\(--primary-strong\)\)/);
    expect(progress, "Firefox should not need the custom property").not.toMatch(
      /var\(--range-pct/
    );
  });

  it("the thumb is explicit — `appearance: none` removes the UA one", () => {
    // Setting appearance:none on the input opts every part out of UA
    // painting, the thumb included. Without an explicit rule the control
    // renders as a bare bar with nothing to grab.
    const thumb = block('input[type="range"]::-webkit-slider-thumb');
    expect(
      thumb,
      "no thumb rule — the control has nothing to drag"
    ).not.toBeNull();
    expect(thumb).toMatch(/appearance:\s*none/);
    expect(thumb, "the thumb needs a size").toMatch(/width:\s*\d+px/);
  });

  it("every range input in the app goes through the primitive", () => {
    /* The fill position reaches CSS as a custom property, which is exactly
       the plumbing a call site forgets — and forgetting it is silent: the
       track renders all-groove with a thumb on it, which looks like a
       slider at zero rather than like a bug. `RangeInput` computes it from
       the value the input already has, so this guard is what keeps the
       property from being optional in practice. */
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
    const offenders = walk(resolve(repoRoot, "src"))
      .filter((f) => /type="range"/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(repoRoot + "/", ""))
      // The primitive itself is where the raw input legitimately lives.
      .filter((f) => f !== "src/components/ui/RangeInput.tsx");
    expect(
      offenders,
      "these render a raw range input, so `--range-pct` is unset and the " +
        "track paints all-groove. Use `<RangeInput>`."
    ).toEqual([]);
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
