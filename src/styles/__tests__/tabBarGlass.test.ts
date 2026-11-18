/**
 * The tab bar's glass (DS6 step 3, DESIGN_GUIDE §14o): a rim that is the
 * card's lit edge at the bar's size, a fade under the bar so nothing
 * scrolled past it reads in plain view below it, and a solid bar under
 * Reduce Transparency on iPhone as well as on the web. Read from the real
 * stylesheets, as `tokenContrast.test.ts` reads them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const COMPONENTS = readFileSync(
  resolve(process.cwd(), "src/styles/components.css"),
  "utf8"
);
const INDEX = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** The declarations of the first rule whose selector list is exactly
 *  `selector`. */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

function darkBlock(): string {
  return INDEX.slice(INDEX.indexOf(".dark {"));
}

function hex(h: string): [number, number, number] {
  const n = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) =>
    L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((c) => Math.round(c * 255) / 255) as [
    number,
    number,
    number,
  ];
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

/** White at `alpha` painted over `under`, to eight bits. */
function whiteOver(
  alpha: number,
  under: [number, number, number]
): [number, number, number] {
  return under.map(
    (c) => Math.round((alpha + (1 - alpha) * c) * 255) / 255
  ) as [number, number, number];
}

function whiteAlpha(block: string, name: string): number {
  const m = block.match(
    new RegExp(`--${name}:\\s*rgba\\(255,\\s*255,\\s*255,\\s*([\\d.]+)\\)`)
  );
  if (!m) throw new Error(`--${name} is not a white rgba in this block`);
  return Number(m[1]);
}

describe("the fade under the tab bar", () => {
  const fade = () => rule(COMPONENTS, ".bottom-nav-frame::before");

  it("is the page's own colour, from nothing at the bar's top to solid at its bottom edge", () => {
    // Words scrolled past the bar read in plain view in the gap and the
    // safe area under it (the owner's recording, 10 November 2026).
    const gradient = fade().replace(/\s+/g, " ");
    expect(gradient).toMatch(
      /linear-gradient\( to bottom, hsl\(var\(--background\) \/ 0\), hsl\(var\(--background\)\) calc\(100% - var\(--safe-bottom\) - var\(--tab-bar-gap\)\) \)/
    );
    expect(fade()).toMatch(/inset:\s*0;/);
  });

  it("sits behind the bar and takes no taps", () => {
    expect(fade()).toMatch(/z-index:\s*-1;/);
    expect(fade()).toMatch(/pointer-events:\s*none;/);
    expect(rule(COMPONENTS, ".bottom-nav-frame")).toMatch(
      /pointer-events:\s*none;/
    );
  });

  it("has no blur of its own: one backdrop filter per bar", () => {
    expect(fade()).not.toMatch(/backdrop-filter/);
  });
});

describe("the bar's glass holds on iPhone", () => {
  const frost = () => rule(COMPONENTS, ".bottom-nav-frost");

  it("writes the blur out, prefixed and not, never through a variable", () => {
    // iOS 15.4 is the app's oldest, and the unprefixed name arrived in
    // Safari 18; `-webkit-backdrop-filter` ignores a custom property
    // (WebKit bug 289800).
    const prefixed = frost().match(/-webkit-backdrop-filter:\s*([^;]+);/);
    const plain = frost().match(/(?:^|[^-])backdrop-filter:\s*([^;]+);/);
    expect(prefixed?.[1]).toBe("blur(24px) saturate(1.3)");
    expect(plain?.[1]).toBe("blur(24px) saturate(1.3)");
  });

  it("goes solid under Reduce Transparency from the phone's own setting", () => {
    // WebKit has no prefers-reduced-transparency (WebKit bug 175497), so
    // the media query alone never fired on iPhone.
    const marked = rule(
      COMPONENTS,
      ":root[data-reduced-transparency] .bottom-nav-frost"
    );
    expect(marked).toMatch(/background:\s*var\(--surface-solid\);/);
    expect(marked).toMatch(/-webkit-backdrop-filter:\s*none;/);
    expect(marked).toMatch(/(?:^|[^-])backdrop-filter:\s*none;/);
  });

  it("keeps the media query and the no-blur fallback beside it", () => {
    expect(COMPONENTS).toMatch(
      /@media \(prefers-reduced-transparency: reduce\) \{\s*\.bottom-nav-frost,\s*\.dark \.bottom-nav-frost \{\s*background: var\(--surface-solid\);/
    );
    expect(COMPONENTS).toMatch(
      /@supports not \(\s*\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\s*\) \{\s*\.bottom-nav-frost,/
    );
  });
});

describe("the bar's rim on dark is the card's lit edge at its size", () => {
  const dark = darkBlock();
  const solid = hex(dark.match(/--surface-solid:\s*(#[0-9a-fA-F]{6})/)![1]);
  const pageHsl = dark.match(
    /--background:\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/
  )!;
  const page = hslToRgb(
    Number(pageHsl[1]),
    Number(pageHsl[2]),
    Number(pageHsl[3])
  );

  it("its hairline of light parts from the page as a card's top edge does", () => {
    // A card's lit edge is about 1.55:1 against the page (tokens.css).
    // The bar's measured 1.37:1 at the top before this.
    const hairline = whiteOver(whiteAlpha(dark, "nav-frost-highlight"), solid);
    expect(contrast(hairline, page)).toBeGreaterThanOrEqual(1.5);
  });

  it("its outline stays fainter than the hairline", () => {
    expect(whiteAlpha(dark, "glass-border")).toBeLessThan(
      whiteAlpha(dark, "nav-frost-highlight")
    );
  });
});
