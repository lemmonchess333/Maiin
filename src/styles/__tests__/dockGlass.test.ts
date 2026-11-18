/**
 * The workout's docked cards are glass (DS6 step 5, DESIGN_GUIDE §14o):
 * the new best and the rest card float over the foot of the set list, the
 * card's colour over a static blur of the rows behind. Read from the real
 * stylesheets, as `tokenContrast.test.ts` reads them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const INDEX = read("src/index.css");
const COMPONENTS = read("src/styles/components.css");

type Rgb = [number, number, number];

function hslToken(which: "light" | "dark", name: string): Rgb {
  const i = INDEX.indexOf(".dark {");
  const block = which === "light" ? INDEX.slice(0, i) : INDEX.slice(i);
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`--${name} not found in ${which}`);
  const [h, s, l] = [Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100];
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((c) => Math.round(c * 255) / 255) as Rgb;
}

function luminance([r, g, b]: Rgb): number {
  const f = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return top.map(
    (c, i) => Math.round((alpha * c + (1 - alpha) * under[i]) * 255) / 255
  ) as Rgb;
}

/** The declarations of the first rule whose selector is exactly this,
 *  at the start of a line or indented in a block. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = COMPONENTS.match(new RegExp(`\\n\\s*${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

function fillAlpha(selector: string): number {
  const m = rule(selector).match(
    /background-color:\s*hsl\(var\(--card\) \/ ([\d.]+)\);/
  );
  if (!m) throw new Error(`no translucent card fill on ${selector}`);
  return Number(m[1]);
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];

describe("the docked cards' glass", () => {
  it("is a blur written out and prefixed, never through a variable", () => {
    const glass = rule(".dock-glass");
    expect(glass).toMatch(
      /-webkit-backdrop-filter:\s*blur\(24px\) saturate\(1\.3\);/
    );
    expect(glass).toMatch(
      /(?:^|[^-])backdrop-filter:\s*blur\(24px\) saturate\(1\.3\);/
    );
  });

  it("keeps enough of the card that every word on it holds AA with no blur at all", () => {
    // Before Safari 18 a blur could fail to draw on an element added after
    // the page loaded, which both cards always are. The worst backdrop is
    // the opposite theme's extreme.
    const light = over(
      hslToken("light", "card"),
      fillAlpha(".dock-glass"),
      BLACK
    );
    const dark = over(
      hslToken("dark", "card"),
      fillAlpha(".dark .dock-glass"),
      WHITE
    );
    for (const [theme, fill] of [
      ["light", light],
      ["dark", dark],
    ] as const) {
      expect(
        contrast(hslToken(theme, "muted-foreground"), fill)
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(hslToken(theme, "achievement-strong"), fill)
      ).toBeGreaterThanOrEqual(4.5);
      // The "New best" pill: the gold text on a 15% gold wash over the
      // frosted card, the tightest pair on either card.
      const pill = over(hslToken(theme, "achievement"), 0.15, fill);
      expect(
        contrast(hslToken(theme, "achievement-strong"), pill)
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("goes solid where the blur cannot be drawn and under Reduce Transparency", () => {
    expect(COMPONENTS).toMatch(
      /@supports not \(\s*\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\s*\) \{\s*\.dock-glass,\s*\.dark \.dock-glass \{\s*background-color: hsl\(var\(--card\)\);/
    );
    expect(COMPONENTS).toMatch(
      /@media \(prefers-reduced-transparency: reduce\) \{\s*\.dock-glass,\s*\.dark \.dock-glass \{\s*background-color: hsl\(var\(--card\)\);\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/
    );
    // WebKit has no prefers-reduced-transparency (WebKit bug 175497); on
    // iPhone the app sets this attribute from the phone's own setting.
    const marked = rule(":root[data-reduced-transparency] .dock-glass");
    expect(marked).toMatch(/background-color:\s*hsl\(var\(--card\)\);/);
    expect(marked).toMatch(/-webkit-backdrop-filter:\s*none;/);
  });
});
