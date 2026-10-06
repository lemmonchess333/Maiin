/**
 * The platform layer that makes the app feel installed rather than
 * embedded on a phone. Each rule here is one line of CSS that is easy to
 * lose in a tidy-up and invisible in a desktop browser, so it is asserted.
 *
 * - The tap flash is off at the root. WebKit paints it over any element
 *   with a click handler, and most of the app's tappable rows are
 *   `role="button"` divs; turning it off only on `button, a` left them
 *   flashing grey.
 * - Controls take `touch-action: manipulation` and no long-press
 *   callout, in @layer base so a touch-action utility on the same
 *   element (FoodRow's `touch-pan-y`) still wins.
 * - Text fields are 16px at least on a touch screen. Under 16px, iOS
 *   zooms the page into the field on focus and stays zoomed. The rule
 *   names the size utilities it lifts, so every field's own size class
 *   has to be one it names or 16px and up.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const css = readFileSync(resolve(repoRoot, "src/index.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);

/** The size utilities the coarse-pointer rule lifts to 16px. */
const LIFTED = [
  "text-xs",
  "text-sm",
  "text-small",
  "text-micro",
  "text-caption",
];
/** Every size utility at 16px or more. */
const FINE = [
  "text-base",
  "text-body",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-h1",
  "text-h2",
  "text-h3",
  "text-display",
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "test") continue;
      walk(full, out);
    } else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const blankComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

function openingTag(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

describe("mobile-native platform layer", () => {
  it("turns the tap flash off at the root", () => {
    expect(css).toMatch(
      /(^|\n)html\s*\{[^}]*-webkit-tap-highlight-color:\s*transparent/
    );
  });

  it("gives controls manipulation and no callout, in @layer base", () => {
    const base = css.match(
      /@layer base\s*\{\s*button,\s*a,\s*\[role="button"\],\s*\[role="tab"\]\s*\{([^}]*)\}/
    );
    expect(base, "no base-layer control rule in src/index.css").not.toBeNull();
    expect(base![1]).toMatch(/touch-action:\s*manipulation/);
    expect(base![1]).toMatch(/-webkit-touch-callout:\s*none/);
    expect(base![1]).toMatch(/user-select:\s*none/);
  });

  it("lifts small fields to 16px on a touch screen", () => {
    const coarse = css.slice(css.indexOf("@media (pointer: coarse)"));
    for (const tag of ["input", "textarea", "select"]) {
      const lifted = new RegExp(
        `${tag}:is\\(${LIFTED.map((c) => `\\.${c}`).join(",\\s*")}\\)`
      );
      expect(coarse, `${tag} is not lifted`).toMatch(lifted);
    }
    expect(coarse).toMatch(/font-size:\s*16px/);
    expect(coarse).toMatch(/font-size:\s*max\(16px,\s*1em\)/);
  });

  it("every field's own size class is one the rule lifts, or 16px and up", () => {
    const offenders: string[] = [];
    let seen = 0;
    for (const file of walk(resolve(repoRoot, "src"))) {
      const src = blankComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
        const tag = openingTag(src, m.index!);
        if (/type="(range|checkbox|radio|hidden|file)"/.test(tag)) continue;
        seen++;
        // Bare size utilities only: `placeholder:text-sm` sizes the hint,
        // not the typed text that iOS measures.
        for (const s of tag.matchAll(/(?<![:\w-])(text-[\w[\]./-]+)/g)) {
          const cls = s[1];
          const isSize =
            LIFTED.includes(cls) ||
            FINE.includes(cls) ||
            /^text-\[\d/.test(cls);
          if (!isSize) continue;
          if (LIFTED.includes(cls) || FINE.includes(cls)) continue;
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${relative(repoRoot, file)}:${line}  ${cls}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(50);
    expect(
      offenders,
      "A field sized by an arbitrary value escapes the 16px rule in " +
        "index.css, so iOS zooms into it on focus. Use a token size:\n" +
        offenders.join("\n")
    ).toEqual([]);
  });
});
