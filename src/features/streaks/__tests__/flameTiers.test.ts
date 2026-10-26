/**
 * The streak flame's tiers are steps of the brand purple ramp, growing in
 * strength, with the platinum badge metal at the top; gold is kept for new
 * bests. Its colours were twelve raw Tailwind hexes (orange, amber, red,
 * violet, pink), three of them hues the app used nowhere else.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { THEME } from "@/lib/theme";
import { FLAME_TIERS, flamePaletteFor } from "../flameTiers";

const RAMP = THEME.purpleRamp;
const RAMP_STEPS = Object.entries(RAMP).map(([step, hex]) => ({
  step: Number(step),
  hex,
}));
const stepOf = (hex: string) =>
  RAMP_STEPS.find((s) => s.hex === hex)?.step ?? null;

function luminance(hex: string): number {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** The pill is `bg-card`: read the card surface of each theme from the
 *  stylesheet rather than copying it. */
function cardLuminance(theme: "light" | "dark"): number {
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const dark = css.indexOf(".dark {");
  const block = theme === "light" ? css.slice(0, dark) : css.slice(dark);
  const m = /--card:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(block)!;
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex =
    "#" +
    [f(0), f(8), f(4)]
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("");
  return luminance(hex);
}

describe("the streak flame's tiers", () => {
  it("are built from the brand purple ramp and the platinum metal only", () => {
    for (const { minDays, palette } of FLAME_TIERS)
      for (const [slot, hex] of Object.entries(palette))
        expect(
          stepOf(hex) !== null || hex === THEME.tier.platinum,
          `${minDays}+ days, ${slot}: ${hex} is not a palette step`
        ).toBe(true);
  });

  it("never use gold, which means a new best", () => {
    const colours = FLAME_TIERS.flatMap((t) => Object.values(t.palette));
    expect(colours).not.toContain(THEME.tier.gold);
    expect(colours).not.toContain(THEME.tier.bronze);
    expect(colours).not.toContain(THEME.amber);
  });

  it("start at one day and run shortest first", () => {
    expect(FLAME_TIERS[0].minDays).toBe(1);
    const days = FLAME_TIERS.map((t) => t.minDays);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(new Set(days).size).toBe(days.length);
  });

  it("grow in strength: each purple tier's body is a deeper step than the last", () => {
    const purple = FLAME_TIERS.filter(
      (t) => t.palette.coreBase !== THEME.tier.platinum
    );
    expect(purple.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < purple.length; i++) {
      const was = purple[i - 1].palette;
      const now = purple[i].palette;
      expect(stepOf(now.bodyBase)!).toBeGreaterThan(stepOf(was.bodyBase)!);
      expect(stepOf(now.bodyTip)!).toBeGreaterThan(stepOf(was.bodyTip)!);
      expect(luminance(now.coreBase)).toBeLessThan(luminance(was.coreBase));
    }
  });

  it("put the platinum metal at the top, on the strongest purple", () => {
    const top = FLAME_TIERS[FLAME_TIERS.length - 1];
    expect(top.minDays).toBe(100);
    expect(top.palette.coreBase).toBe(THEME.tier.platinum);
    expect(top.palette.coreTip).toBe(THEME.tier.platinum);
    const deepest = Math.max(...RAMP_STEPS.map((s) => s.step));
    expect(stepOf(top.palette.bodyBase)).toBe(deepest);
    for (const t of FLAME_TIERS.slice(0, -1))
      expect(Object.values(t.palette)).not.toContain(THEME.tier.platinum);
  });

  it.each(["light", "dark"] as const)(
    "keep the flame's outline at 3:1 on the pill in %s",
    (theme) => {
      /* The body is the silhouette, so one of its two stops has to hold
         the non-text 3:1 against the card it sits on. A deeper step is
         stronger on white and weaker on the dark card, which is why no
         tier's body runs 700 to 700. */
      const card = cardLuminance(theme);
      for (const { minDays, palette } of FLAME_TIERS) {
        const best = Math.max(
          contrast(luminance(palette.bodyBase), card),
          contrast(luminance(palette.bodyTip), card)
        );
        expect(
          best,
          `${minDays}+ days: the flame's body is ${best.toFixed(2)}:1 (${theme})`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  );

  it("are picked by the streak's length", () => {
    const at = (days: number) =>
      FLAME_TIERS.findIndex((t) => t.palette === flamePaletteFor(days));
    expect([1, 6, 7, 29, 30, 99, 100, 365].map(at)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
    expect(at(0)).toBe(0);
  });

  it("stay where the lint rule bans every hex literal", () => {
    // eslint.config.js's PALETTE_TABLES is what reaches this table; a
    // move or rename that left it behind would let a hex back in.
    const config = readFileSync(
      resolve(process.cwd(), "eslint.config.js"),
      "utf8"
    );
    expect(config).toMatch(
      /const PALETTE_TABLES = \[[^\]]*"src\/features\/streaks\/flameTiers\.ts"/
    );
  });
});
