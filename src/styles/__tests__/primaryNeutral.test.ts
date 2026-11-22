/**
 * The chrome is neutral, so purple means lifting (DS10 call 1, owner
 * 22 November 2026).
 *
 * Selection, links and text buttons, switches, focus rings, icon and
 * callout tints and filled buttons all read `--primary`, so the chrome went
 * neutral by making `--primary` the text colour. This file keeps it there:
 * a later change that puts a hue back into `--primary` would turn every
 * `bg-primary`, `ring-primary` and `text-primary` in the app purple again
 * in one line, which is how purple came to mean "selected", "a link", "Pro"
 * and "lifting" at once. It also holds the places that do not read
 * `--primary` but drew the chrome in a sport's colour: the tab bar's own
 * token, the segmented control's selected fill and the switch.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const CSS = read("src/index.css");
const DARK_AT = CSS.indexOf(".dark {");
const LIGHT = CSS.slice(0, DARK_AT);
const DARK = CSS.slice(DARK_AT);

function hsl(block: string, name: string): [number, number, number] {
  const m = block.match(
    new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`)
  );
  if (!m) throw new Error(`token --${name} not found`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

describe("--primary is the text colour, in both themes", () => {
  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ])("%s: --primary and --primary-strong are --foreground", (_t, block) => {
    expect(hsl(block, "primary")).toEqual(hsl(block, "foreground"));
    expect(hsl(block, "primary-strong")).toEqual(hsl(block, "foreground"));
    // A neutral: saturation this low reads as grey at any lightness.
    expect(hsl(block, "primary")[1]).toBeLessThanOrEqual(10);
  });

  it("what sits on it is white in light and the page in dark", () => {
    expect(hsl(LIGHT, "primary-foreground")).toEqual([0, 0, 100]);
    expect(hsl(DARK, "primary-foreground")).toEqual(hsl(DARK, "background"));
  });

  it("the open tab is the text colour, not a purple of its own", () => {
    const nav = [...CSS.matchAll(/--nav-active-foreground:\s*([^;]+);/g)].map(
      (m) => m[1].trim()
    );
    expect(nav).toEqual([
      "hsl(var(--foreground))",
      "hsl(var(--foreground))",
    ]);
    const pill = read("src/styles/components.css").match(
      /\.bottom-nav-pill\s*\{[^}]*\}/
    )?.[0];
    expect(pill).toBeDefined();
    expect(pill).not.toMatch(/purple|lifting|primary/);
  });
});

describe("one selected state everywhere", () => {
  it("the segmented control fills a selected option grey, whatever its sport", () => {
    const src = read("src/components/ui/SegmentedControl.tsx");
    expect(src).toContain("bg-segment-selected");
    expect(src).not.toMatch(/bg-(lifting|running)(-fill)?\b/);
    expect(src).not.toMatch(/\btone\??:/);
  });

  it("the switch's on track is the chrome's, never a sport's", () => {
    const src = read("src/components/ui/Toggle.tsx");
    expect(src).toContain('"bg-primary justify-end"');
    expect(src).not.toMatch(/\b(bg|text|border)-(lifting|running)|purple/);
  });

  it("no solid primary fill carries white text (white on white in dark)", () => {
    const offenders: string[] = [];
    for (const f of globSync("src/**/*.tsx")) {
      if (f.includes("__tests__") || f.includes("/dev/")) continue;
      const lines = read(f).split("\n");
      lines.forEach((line, i) => {
        if (!/\bbg-primary(-strong)?\b(?!\/)/.test(line)) return;
        const near = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        if (/\btext-white\b/.test(near)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("every focus ring is solid, so it clears 3:1 in light", () => {
    // `ring-primary/40` is 2.7:1 on the white card now that the ring is
    // the text colour; solid it is about 19:1.
    const offenders = globSync("src/**/*.tsx")
      .filter((f) => !f.includes("__tests__"))
      .filter((f) => /focus-visible:ring-primary\/\d/.test(read(f)));
    expect(offenders).toEqual([]);
  });
});

describe("purple text is lifting's, not the chrome's", () => {
  /* A count, as identityTextGuard keeps its counts: each remaining use is
     a lift's own word, label or icon (a lift's card, a set's chip, the
     lift plan's headings). A link or a text button written in it would
     raise the number, and the author has to look at the site and give it
     `text-foreground` instead. */
  it("text-lifting-strong is used on at most 37 lines of the app", () => {
    const n = globSync("src/**/*.{ts,tsx}")
      .filter((f) => !f.includes("__tests__") && !f.startsWith("src/website"))
      .reduce(
        (sum, f) => sum + (read(f).match(/\btext-lifting-strong\b/g) ?? []).length,
        0
      );
    expect(n).toBeLessThanOrEqual(37);
  });
});
