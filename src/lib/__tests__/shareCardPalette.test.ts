/**
 * Share-card palette drift pin (visual audit Phase 7).
 *
 * ShareCardRenderer is deliberately token-FREE: html-to-image's DOM clone
 * can't reliably resolve CSS variables, so the card hardcodes its sport
 * colours as literals (documented in the component header). That's correct
 * for capture — but it means a future THEME change would silently leave
 * exported share cards wearing the OLD brand colours. This source-scan pin
 * makes that drift loud: the renderer's literals must equal the THEME
 * tokens they duplicate.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { THEME } from "../theme";

const here = dirname(fileURLToPath(import.meta.url));
const rendererSrc = readFileSync(
  resolve(here, "../../components/share/ShareCardRenderer.tsx"),
  "utf8"
);

function literal(name: string): string {
  const m = rendererSrc.match(
    new RegExp(`const ${name} = "(#[0-9a-fA-F]{6})"`)
  );
  expect(m, `${name} literal not found in ShareCardRenderer`).not.toBeNull();
  return m![1].toLowerCase();
}

describe("share-card palette stays in lockstep with THEME", () => {
  it("RUN_CORAL === THEME.running", () => {
    expect(literal("RUN_CORAL")).toBe(THEME.running.toLowerCase());
  });
  it("LIFT_PURPLE === THEME.lifting", () => {
    expect(literal("LIFT_PURPLE")).toBe(THEME.lifting.toLowerCase());
  });
  it("NUTRITION_ORANGE === THEME.semantic.nutrition", () => {
    expect(literal("NUTRITION_ORANGE")).toBe(
      THEME.semantic.nutrition.toLowerCase()
    );
  });

  it("SHARE_RUN_ACCENT === THEME.brandLight", () => {
    /* The run card's accent is brand purple, NOT THEME.running — the one
       deliberate break from sport-coding in the app, because a share card is
       a brand artefact seen by people who have never opened Tropos. It still
       has to track a real token, or the silent drift this file exists to
       catch just relocates to the most public surface we have. */
    expect(literal("SHARE_RUN_ACCENT")).toBe(THEME.brandLight.toLowerCase());
  });

  it("the run card is actually WIRED to that accent", () => {
    /* The pin above would still pass if someone pointed `accentFor` back at
       RUN_CORAL and left the unused constant behind — the literal would
       match while the card wore the old colour. So assert the wiring, which
       is the thing the owner looked at and rejected. */
    const accentFn = rendererSrc.match(/function accentFor[\s\S]*?\n}/)?.[0];
    expect(accentFn, "accentFor not found").toBeTruthy();
    expect(accentFn).toMatch(/template === "run"\) return SHARE_RUN_ACCENT/);
    expect(accentFn).not.toMatch(/template === "run"\) return RUN_CORAL/);
  });

  it("the run card's brand ground stays near-neutral, not accent-tinted", () => {
    /* The defect was never the accent on its own — it was a ground that was
       a desaturated wash OF it, which is the Strava/Runna look and left the
       accent nothing to sit against. Pinned as a property of the hex rather
       than as the exact gradient string, so a future retune of the stops is
       free but a return to a hued ground is not: each stop's RGB channels
       must sit within a narrow spread (a grey with a slight bias), and stay
       dark enough for white Archivo numerals at display size. */
    const runGradient = rendererSrc.match(
      /template === "run"[\s\S]{0,600}?`(linear-gradient\(155deg[^`]*)`/
    )?.[1];
    expect(runGradient, "run brand gradient not found").toBeTruthy();
    const stops = runGradient!.match(/#[0-9a-f]{6}/gi) ?? [];
    expect(stops.length).toBeGreaterThanOrEqual(3);
    for (const stop of stops) {
      const r = parseInt(stop.slice(1, 3), 16);
      const g = parseInt(stop.slice(3, 5), 16);
      const b = parseInt(stop.slice(5, 7), 16);
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      // The maroon this replaced ran a spread of 22 at its last stop.
      expect(
        spread,
        `${stop} is too saturated to read as a neutral ground`
      ).toBeLessThanOrEqual(18);
      expect(
        Math.max(r, g, b),
        `${stop} is too light for white numerals`
      ).toBeLessThanOrEqual(60);
    }
  });
});
