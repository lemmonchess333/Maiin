import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * Raw Tailwind palette colour classes (`text-amber-500`, `bg-green-500`)
 * are the hex guardrail's blind spot: the ESLint rule bans hex LITERALS
 * in inline styles, but a palette class is a class name, so every one of
 * these was invisible to it — and they drift off the Tropos palette
 * (green-500 #22C55E is not THEME.success #4DB872; orange-500 #FF6900 is
 * not the nutrition orange). The 2026-08-22 sweep found 30+ live sites:
 * trophies in amber-500 instead of the achievement token, pace-zone bars
 * in traffic-light greens the palette never defined, a CTA in purple-500
 * instead of brand. All repointed; this scan keeps the class closed.
 *
 * What a hit should become:
 *  - Themed surfaces: a token class (text-achievement, text-warning-strong,
 *    hover:bg-destructive/10) or "hsl(var(--…))" in a style.
 *  - The always-dark run surface: a FIXED THEME.* value via style — the
 *    CSS vars follow the USER'S theme there, so a token class hands a
 *    light-mode user light-step colours on the dark ground.
 *
 * Exemptions are per-file and documented — not a licence, a ledger.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const EXEMPT: Record<string, string> = {
  // Set-TYPE badges (warmup/dropset/failure): a deliberate micro-palette
  // of light/dark pairs whose meanings have no Tropos token equivalents —
  // warmup-yellow is not the warning register, failure-red is not
  // destructive-the-action. Conflating them with semantic tokens would
  // repaint meanings, not clean up drift.
  "components/WorkoutSession.tsx": "set-type badge micro-palette",
  // Dev-only brand bake-off rig — deliberately outside the app palette.
  "pages/dev/BrandBakeoff.tsx": "dev bake-off rig",
};

const PALETTE_RE =
  /\b(?:hover:|focus:|active:|disabled:|dark:|group-hover:)*(?:text|bg|border|stroke|fill|ring|from|to|via|accent|caret|divide|outline|decoration|shadow)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-[0-9]{2,3}\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("no raw Tailwind palette colour classes", () => {
  it("colours come from Tropos tokens, not the stock palette", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1);
      if (EXEMPT[rel]) continue;
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, i) => {
        const m = line.match(PALETTE_RE);
        if (m) hits.push(`${rel}:${i + 1} ${m[0]}`);
      });
    }
    expect(
      hits,
      "raw Tailwind palette class — use a Tropos token (token class on " +
        "themed surfaces; fixed THEME.* via style on the always-dark run " +
        "surface). If a site is a genuinely designed micro-palette, add " +
        "the FILE to EXEMPT with its reason:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("the exemption ledger only names files that still exist and still hit", () => {
    // A stale exemption is a hole: the file gets rewritten or renamed and
    // the blanket pass stays behind. Each entry must still earn itself.
    for (const rel of Object.keys(EXEMPT)) {
      const full = join(SRC_ROOT, rel);
      const text = stripComments(readFileSync(full, "utf8"));
      expect(
        PALETTE_RE.test(text),
        `${rel} is exempt but no longer contains a palette class — remove it from EXEMPT`
      ).toBe(true);
    }
  });
});
