/**
 * DS6 step 4 (DESIGN_GUIDE §14o): toasts are glass, and a sheet takes the
 * card's lit rim and a grab handle that can be seen. Read from the real
 * sources, as `tokenContrast.test.ts` reads `src/index.css`.
 *
 * A sheet keeps its solid fill: measured, a blur under it changed no
 * pixel by more than 3 levels in 255 on dark (it sits under a 50% black
 * overlay on a near-black page), and light has no room for translucency
 * at all. The tests pin that decision as well as the toast's glass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const INDEX = read("src/index.css");
const COMPONENTS = read("src/styles/components.css");
const TOASTS = read("src/components/ToastProvider.tsx");
const SHEET = read("src/components/ui/BottomSheet.tsx");

type Rgb = [number, number, number];

function block(which: "light" | "dark"): string {
  const i = INDEX.indexOf(".dark {");
  return which === "light" ? INDEX.slice(0, i) : INDEX.slice(i);
}

function hslToken(which: "light" | "dark", name: string): Rgb {
  const m = block(which).match(
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

/** `top` at `alpha` over `under`, to eight bits. */
function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return top.map(
    (c, i) => Math.round((alpha * c + (1 - alpha) * under[i]) * 255) / 255
  ) as Rgb;
}

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [1, 1, 1];

function toastAlpha(selector: string): number {
  const escaped = selector.replace(/[.[\]]/g, "\\$&");
  const m = TOASTS.match(
    new RegExp(
      `\\n\\s*${escaped} \\{\\s*background: hsl\\(var\\(--card\\) / ([\\d.]+)\\) !important;`
    )
  );
  if (!m) throw new Error(`no translucent card fill on ${selector}`);
  return Number(m[1]);
}

describe("a toast is glass that reads with no blur at all", () => {
  it("is the card's colour over a blur, written out and prefixed", () => {
    // `-webkit-backdrop-filter` ignores a custom property (WebKit bug
    // 289800), and the app runs from iOS 15.4, before the unprefixed name.
    expect(TOASTS).toMatch(
      /\[data-sonner-toast\] \{[^}]*-webkit-backdrop-filter: blur\(24px\) saturate\(1\.3\) !important;\s*backdrop-filter: blur\(24px\) saturate\(1\.3\) !important;/
    );
  });

  it("keeps enough of the card that the grey line holds AA over the worst backdrop", () => {
    // Before Safari 18 a blur could fail to draw on an element added after
    // the page loaded, which a toast always is: the fill alone must read.
    const light = toastAlpha("[data-sonner-toast]");
    const dark = toastAlpha(".dark [data-sonner-toast]");
    const lightOnBlack = over(hslToken("light", "card"), light, BLACK);
    const darkOnWhite = over(hslToken("dark", "card"), dark, WHITE);
    expect(
      contrast(hslToken("light", "muted-foreground"), lightOnBlack)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(hslToken("dark", "muted-foreground"), darkOnWhite)
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("records why the fills are not lower: 90% and 85% miss AA", () => {
    expect(
      contrast(
        hslToken("light", "muted-foreground"),
        over(hslToken("light", "card"), 0.9, BLACK)
      )
    ).toBeLessThan(4.5);
    expect(
      contrast(
        hslToken("dark", "muted-foreground"),
        over(hslToken("dark", "card"), 0.85, WHITE)
      )
    ).toBeLessThan(4.5);
  });

  it("on dark takes the card's lit edge in place of the grey border", () => {
    expect(TOASTS).toMatch(
      /\.dark \[data-sonner-toast\] \{[^}]*border-color: transparent !important;[^}]*inset 0 1px 0 rgba\(255, 255, 255, 0\.14\),\s*inset 0 0 0 1px rgba\(255, 255, 255, 0\.08\)/
    );
  });

  it("goes solid where the blur cannot be drawn and under Reduce Transparency", () => {
    const solid =
      /\[data-sonner-toast\],\s*\.dark \[data-sonner-toast\] \{\s*background: hsl\(var\(--card\)\) !important;/;
    expect(TOASTS).toMatch(
      new RegExp(
        String.raw`@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*` +
          solid.source
      )
    );
    expect(TOASTS).toMatch(
      new RegExp(
        String.raw`@media \(prefers-reduced-transparency: reduce\) \{\s*` +
          solid.source
      )
    );
    // WebKit has no prefers-reduced-transparency (WebKit bug 175497); on
    // iPhone the app sets this attribute from the phone's own setting.
    expect(TOASTS).toMatch(
      /:root\[data-reduced-transparency\] \[data-sonner-toast\] \{\s*background: hsl\(var\(--card\)\) !important;\s*-webkit-backdrop-filter: none !important;\s*backdrop-filter: none !important;/
    );
  });
});

describe("a sheet takes the lit rim, on its solid fill", () => {
  const rim = () => {
    const m = COMPONENTS.match(/\n\.dark \.sheet-surface \{([^}]*)\}/);
    if (!m) throw new Error("no .dark .sheet-surface rule");
    return m[1];
  };

  it("draws a hairline of light along its top on dark, and no doubled edge", () => {
    expect(rim()).toMatch(
      /box-shadow:\s*inset 0 1px 0 rgba\(255, 255, 255, 0\.14\);/
    );
    expect(rim()).toMatch(/border-color:\s*transparent;/);
  });

  it("keeps the page's solid colour and takes no blur, which measured as nothing", () => {
    expect(SHEET).toContain(
      '"rounded-t-2xl flex flex-col bg-background sheet-surface safe-area-pb"'
    );
    expect(rim()).not.toMatch(/backdrop-filter/);
  });
});

describe("a sheet's grab handle can be seen", () => {
  const handleAlpha = () => {
    const m = COMPONENTS.match(
      /\n\.sheet-handle \{\s*background-color: hsl\(var\(--muted-foreground\) \/ ([\d.]+)\);/
    );
    if (!m) throw new Error("no .sheet-handle rule");
    return Number(m[1]);
  };

  it("parts from the sheet more than the border grey did, in both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const sheet = hslToken(theme, "background");
      const handle = over(
        hslToken(theme, "muted-foreground"),
        handleAlpha(),
        sheet
      );
      const old = contrast(hslToken(theme, "border"), sheet);
      expect(old).toBeLessThan(1.4);
      expect(contrast(handle, sheet)).toBeGreaterThanOrEqual(1.8);
    }
  });

  it("is the one handle every sheet draws", () => {
    // A sheet that hides the primitive's header draws its own handle;
    // each of them, and the hand-built plan options sheet, take this one.
    const stray = globSync("src/**/*.tsx", { cwd: process.cwd() })
      .filter((f) => !f.includes("__tests__"))
      .filter((f) =>
        /className="[^"]*\bh-1\b[^"]*rounded-full[^"]*\bbg-border\b/.test(
          read(f)
        )
      );
    // ScanDemo is a drawing of a phone on the paywall, not a sheet.
    expect(stray).toEqual(["src/components/paywall/ScanDemo.tsx"]);
  });
});
