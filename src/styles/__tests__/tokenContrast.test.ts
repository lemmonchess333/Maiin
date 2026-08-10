/**
 * Token contrast — WCAG AA, enforced instead of swept.
 *
 * CLAUDE.md's design-system note says the colour invariants "regress
 * constantly and keep getting swept up after the fact". A periodic sweep
 * can't fix that; a test can. This one parses the REAL `src/index.css`
 * (never a copied table — the parsed file is the source of truth) and
 * fails when a text token drops below the AA threshold on its own
 * theme's card surface.
 *
 * What this would have caught (2026-08-09): the run summary rendered its
 * pace and calorie numerals from the STATIC JS constants `THEME.teal`
 * (#52A3BD) and `THEME.success` (#4DB872) via inline styles. Static hexes
 * cannot respond to the theme, so on the light card they measured 2.86:1
 * and 2.50:1 — under even the 3:1 large-text floor — while looking fine
 * in the dark theme the app defaults to, which is why it went unseen.
 * `--success` had a correct theme-aware token all along; `--teal` had no
 * token at all, the same gap the `--nutrition` comment blames for orange
 * hexes leaking past the guardrail.
 *
 * Thresholds: WCAG 2.2 SC 1.4.3 — 4.5:1 for normal text, 3:1 for large
 * text (>=24px, or >=18.66px bold). These tokens are used for numerals at
 * both sizes, so they are held to the stricter 4.5:1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** Pull an `--name: H S% L%;` triple out of a given block of the file. */
function readHsl(block: string, name: string): [number, number, number] {
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The `:root` (light) block ends where the `.dark` block begins. */
function lightBlock(): string {
  const i = CSS.indexOf(".dark {");
  expect(i).toBeGreaterThan(-1);
  return CSS.slice(0, i);
}
function darkBlock(): string {
  return CSS.slice(CSS.indexOf(".dark {"));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(
  a: [number, number, number],
  b: [number, number, number]
): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const AA_NORMAL = 4.5;
const AA_LARGE = 3;

/**
 * Each token is held to the bar its ACTUAL USE requires — a single
 * blanket rule would be dishonest here:
 *
 *  - `teal` / `success` are SEMANTIC tokens, free to differ per theme, and
 *    appear at small sizes. They must clear 4.5:1.
 *  - `running` is the FIXED sport identity (`--running` is deliberately
 *    "IDENTICAL to :root" per index.css, and CLAUDE.md bars changing the
 *    colour scheme). It is 3.58:1 on the light card: fine for the large
 *    numerals it headlines (>=24px / >=18.66px bold), short of 4.5:1 for
 *    small text. Pinning it at the large-text bar records that real
 *    constraint instead of pretending the identity is safe everywhere —
 *    small-text coral on light needs a `--running-strong` step, the same
 *    shape as `--primary-strong` / `--nutrition-strong`.
 */
const TOKEN_BARS = [
  { token: "teal", min: AA_NORMAL, use: "semantic, any size" },
  { token: "success", min: AA_NORMAL, use: "semantic, any size" },
  { token: "running", min: AA_LARGE, use: "fixed identity, large text only" },
  {
    token: "running-strong",
    min: AA_NORMAL,
    use: "the AA step for small coral text",
  },
  { token: "lifting", min: AA_LARGE, use: "fixed identity, large text only" },
  {
    token: "lifting-strong",
    min: AA_NORMAL,
    use: "the AA step for small purple text",
  },
] as const;

describe("token contrast — text tokens on the card surface", () => {
  it.each(TOKEN_BARS)("--$token clears its bar on the LIGHT card", ({ token, min }) => {
    const block = lightBlock();
    const fg = hslToRgb(...readHsl(block, token));
    const bg = hslToRgb(...readHsl(block, "card"));
    const ratio = contrast(fg, bg);
    expect(
      ratio,
      `--${token} is ${ratio.toFixed(2)}:1 on the light card (needs ${min}:1)`
    ).toBeGreaterThanOrEqual(min);
  });

  it.each(TOKEN_BARS)("--$token clears its bar on the DARK card", ({ token, min }) => {
    const dark = darkBlock();
    const fg = hslToRgb(...readHsl(dark, token));
    const bg = hslToRgb(...readHsl(dark, "card"));
    const ratio = contrast(fg, bg);
    expect(
      ratio,
      `--${token} is ${ratio.toFixed(2)}:1 on the dark card (needs ${min}:1)`
    ).toBeGreaterThanOrEqual(min);
  });

  /**
   * Sport-tinted chips (`bg-running/10` + `text-running-strong`) are a
   * standard pattern here, and the tint LOWERS the effective contrast on
   * both themes — the plain-card check alone would miss it. Composite the
   * 10% tint over the card and re-measure.
   */
  /* Both sport identities, on both themes, over BOTH surfaces a tinted
     chip can sit on. `--card` alone is not enough: `--muted` is the darker
     raised tile, and it was the muted surface that failed first for
     purple (3.70:1 in dark). */
  it.each([
    ["light", "running"],
    ["dark", "running"],
    ["light", "lifting"],
    ["dark", "lifting"],
  ] as const)("%s: small %s text clears AA on its /10 chip", (theme, sport) => {
    const block = theme === "light" ? lightBlock() : darkBlock();
    const tint = hslToRgb(...readHsl(block, sport));
    const fg = hslToRgb(...readHsl(block, `${sport}-strong`));
    for (const surface of ["card", "muted"] as const) {
      const bg = hslToRgb(...readHsl(block, surface));
      const chip = bg.map((c, i) => 0.1 * tint[i] + 0.9 * c) as [
        number,
        number,
        number,
      ];
      const ratio = contrast(fg, chip);
      expect(
        ratio,
        `--${sport}-strong is ${ratio.toFixed(2)}:1 on a ${sport}/10 chip over --${surface} (${theme})`
      ).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it("teal and success are THEME-AWARE, not one fixed value", () => {
    /* The defect was theme-blindness, not a bad hue: a single value cannot
       clear AA on both a white and a near-black card. A future edit that
       collapses these back to one value across both blocks reintroduces
       exactly that, so the difference itself is the contract. */
    for (const token of ["teal", "success", "running-strong", "lifting-strong"] as const) {
      expect(
        readHsl(lightBlock(), token),
        `--${token} must differ between themes`
      ).not.toEqual(readHsl(darkBlock(), token));
    }
  });
});

describe("the static JS hexes these replaced", () => {
  it("documents why inline THEME constants cannot be used for card text", () => {
    /* Kept as an executable record of the measurement, so the reasoning
       survives even if the tokens are later retuned. */
    const onLightCard = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const rgb: [number, number, number] = [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
      ];
      return contrast(rgb, hslToRgb(...readHsl(lightBlock(), "card")));
    };
    // THEME.teal and THEME.success — the values that shipped.
    expect(onLightCard("#52A3BD")).toBeLessThan(3);
    expect(onLightCard("#4DB872")).toBeLessThan(3);
  });
});
