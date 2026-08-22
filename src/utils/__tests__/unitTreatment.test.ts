import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * The app's one unit treatment is SPACED: "60 kg", "5.2 km" (2026-08-22
 * sweep — 24 unspaced sites, including two shared producers whose every
 * consumer inherited the gap, plus a byte-identical formatter duplicated
 * across ChallengeCard/ChallengeFinaleCard).
 *
 * Scope — kg and km only, deliberately:
 *  - grams are the food surface's documented HOUSE STYLE unspaced
 *    ("128g" — MacroColumn's rationale) and are a design decision, not
 *    drift; changing them is out of this ratchet's scope.
 *  - bare metres ("400 m") were fixed but not ratcheted: /\dm\b/ is too
 *    false-positive-prone (durations "12m", ids) to scan safely.
 *  - "5K"/"10K" race names, "1.5k" abbreviations, "2.6t" tonnes and
 *    pace "/km" are not value+unit adjacencies and never match.
 *
 * Exemption: ShareCardRenderer's compact no-space forms ("12.3km") are a
 * DOCUMENTED deliberate variant for the rasterised share card's small
 * stats (see its distanceLabel2Compact comment) — a named exception, not
 * drift. Nothing else is exempt.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const EXEMPT = new Set(["components/share/ShareCardRenderer.tsx"]);

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

/** Strip block and line comments so prose mentioning "0km bugs" or
 *  "a 60kg squat" cannot trip the scan — only code and string literals
 *  remain. Crude (a // inside a string would truncate that line) but
 *  safe for a ban: it can only under-match lines that contain //. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("one unit treatment (spaced: '60 kg', '5.2 km')", () => {
  it("no unspaced kg/km value+unit adjacency in rendered code", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1);
      if (EXEMPT.has(rel)) continue;
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");
      lines.forEach((line, i) => {
        // A digit OR a closing `}` before the unit: `0.5km` catches the
        // literal form, `${x}kg` the interpolated one — the first draft
        // matched only digits, which missed every template-literal site
        // (i.e. most of the class the sweep just fixed).
        if (/[\d}](kg|km)\b/.test(line))
          hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
    }
    expect(
      hits,
      "unspaced unit — the app writes '60 kg' / '5.2 km' (space before " +
        "the unit). If a site is a genuinely deliberate compact variant, " +
        "document it at the site and add the FILE to EXEMPT here:\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});
