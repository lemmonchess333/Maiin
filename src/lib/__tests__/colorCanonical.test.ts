/**
 * Colour canonical-layer drift guard.
 *
 * Colour lives in three places that historically drifted (src/index.css HSL
 * vars, src/styles/tokens.css --ds-* hexes, src/lib/theme.ts JS hexes). theme.ts
 * can't read CSS vars at module-eval, so it MIRRORS the canonical hexes — this
 * test fails CI the moment a hex is edited in one place but not the others.
 *
 * Canonical model (locked): the fixed-identity brand/sport/nutrition colours
 * are HEX, shared by tokens.css + theme.ts (asserted EXACT below). The index.css
 * HSL vars are the theme-tunable layer that drives the Tailwind sport/nutrition
 * classes; they round to WITHIN ONE 8-bit channel of the canonical hex (a known,
 * sub-perceptual, pre-existing difference — NOT pixel-identical, so tokens.css
 * deliberately does not `hsl(var())`-derive them). --running is the one that
 * round-trips exactly. Tolerances below encode that contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { THEME, MACROS_TEXT_LIGHT } from "@/lib/theme";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const tokensCss = read("../../styles/tokens.css");
const indexCss = read("../../index.css");

const norm = (hex: string) => hex.trim().toLowerCase();

/** Extract a `--name: #rrggbb` hex var from a CSS string. */
function cssHexVar(css: string, name: string): string {
  const m = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`hex var ${name} not found`);
  return norm(m[1]);
}

/** Extract a `--name: H S% L%` HSL var and convert to hex. */
function cssHslVarHex(css: string, name: string): string {
  const m = css.match(
    new RegExp(`${name}\\s*:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`hsl var ${name} not found`);
  return hslToHex(+m[1], +m[2], +m[3]);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return norm(`#${to(r)}${to(g)}${to(b)}`);
}

/** Max absolute per-channel (0-255) difference between two #rrggbb hexes. */
function channelDelta(a: string, b: string): number {
  const ch = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const A = ch(norm(a));
  const B = ch(norm(b));
  return Math.max(...A.map((v, i) => Math.abs(v - B[i])));
}

describe("colour canonical layer — theme.ts ↔ tokens.css (EXACT hex)", () => {
  it("brand purple is identical across theme.ts and tokens.css", () => {
    const ds = cssHexVar(tokensCss, "--ds-purple-500");
    expect(norm(THEME.brand)).toBe(ds);
    expect(norm(THEME.lifting)).toBe(ds);
    expect(ds).toBe("#7b72e9");
  });

  it("brand-strong is identical across theme.ts and tokens.css", () => {
    expect(norm(THEME.brandStrong)).toBe(
      cssHexVar(tokensCss, "--ds-purple-600")
    );
    expect(norm(THEME.brandStrong)).toBe("#6560c8");
  });

  it("brand-light is identical across theme.ts and tokens.css", () => {
    const ds = cssHexVar(tokensCss, "--ds-purple-400");
    expect(norm(THEME.brandLight)).toBe(ds);
    expect(norm(THEME.liftingLight)).toBe(ds);
  });

  it("nutrition orange is the single canonical #D9884E (post #E87316 resolution)", () => {
    expect(norm(THEME.semantic.nutrition)).toBe("#d9884e");
    expect(norm(THEME.warning)).toBe("#d9884e"); // legacy alias kept in sync
    expect(norm(MACROS_TEXT_LIGHT.nutrition)).toBe("#b45309"); // -strong step
  });

  it("sport + accent identity hexes are internally consistent", () => {
    expect(norm(THEME.running)).toBe("#d4637a");
    expect(norm(THEME.semantic.vitals)).toBe(norm(THEME.running));
    expect(norm(THEME.danger)).toBe(norm(THEME.running));
    expect(norm(THEME.teal)).toBe("#52a3bd");
    expect(norm(THEME.semantic.hydration)).toBe(norm(THEME.teal));
  });
});

describe("colour canonical layer — index.css HSL ↔ canonical hex (tolerance)", () => {
  it("--running round-trips EXACTLY to the canonical running hex", () => {
    expect(cssHslVarHex(indexCss, "--running")).toBe(norm(THEME.running));
  });

  it("--lifting is within 1 channel of brand (theme-tunable approximation)", () => {
    // Known sub-perceptual diff — index.css HSL renders ~#7c72e9 vs #7b72e9.
    // This guards against a LARGE divergence while documenting the 1-unit gap
    // that's exactly why tokens.css holds the hex instead of hsl(var()).
    expect(
      channelDelta(cssHslVarHex(indexCss, "--lifting"), THEME.lifting)
    ).toBeLessThanOrEqual(1);
  });

  it("--nutrition is within 1 channel of the canonical nutrition hex", () => {
    expect(
      channelDelta(
        cssHslVarHex(indexCss, "--nutrition"),
        THEME.semantic.nutrition
      )
    ).toBeLessThanOrEqual(1);
  });

  it("--nutrition-strong is within 1 channel of the -strong text hex", () => {
    expect(
      channelDelta(
        cssHslVarHex(indexCss, "--nutrition-strong"),
        MACROS_TEXT_LIGHT.nutrition
      )
    ).toBeLessThanOrEqual(1);
  });

  it("--primary-strong is within 1 channel of brandStrong", () => {
    expect(
      channelDelta(
        cssHslVarHex(indexCss, "--primary-strong"),
        THEME.brandStrong
      )
    ).toBeLessThanOrEqual(1);
  });
});
