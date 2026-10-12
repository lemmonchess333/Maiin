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
 *  - "5K"/"10K" race names, "1.5k" abbreviations and "2.6t" tonnes are
 *    not value+unit adjacencies and never match.
 *
 * Pace IS in scope (2026-10-06). It used to be excluded as "not a
 * value+unit adjacency", and that was wrong: "5:34/km" is a value glued
 * to its unit exactly as "60kg" is, and the app rendered it both ways —
 * RunStatGrid and RacePredictionsCard wrote "6:00 /km" while the central
 * `paceLabel` (~30 consumers), the run-launch pill, the interval labels,
 * the heat note, the race-goal line and the validation copy wrote
 * "5:34/km". The one treatment is spaced, the unit once: "5:34 /km",
 * "5:05–5:12 /km" for a range. The second test bans the three shapes the
 * glued form took: a template `}${paceUnitLabel(`, a literal or
 * interpolated `5:00/km` / `}/km`, and JSX that sets the unit beside the
 * value with nothing but a line break between them (JSX drops whitespace
 * that contains a newline, so `{pace}` over `{paceUnitLabel(unit)}`
 * renders glued). "12 s/km faster" is already spaced (number, space,
 * unit) and never matches.
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
 *  remain. A block comment keeps its line breaks, so a hit's line
 *  number is the file's. Crude (a // inside a string would truncate that line) but
 *  safe for a ban: it can only under-match lines that contain //. */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
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

  it("no pace glued to its unit ('5:34 /km', never '5:34/km')", () => {
    const hits: string[] = [];
    // JSX: a value (`}` closing an expression, or `</span>`) followed by
    // the unit with only a line break between them — optionally inside an
    // opening <span> — renders glued. `{" "}` ends in a space, so it is
    // the spaced form and is excluded by the lookbehind.
    const jsxGlue =
      /(?:(?<![ ]["'`])\}|<\/span>)(?:[ \t]*\n\s*)?(?:<span(?:\s[^>]*)?>\s*)*\{paceUnitLabel\(/g;
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1);
      if (EXEMPT.has(rel)) continue;
      const code = stripComments(readFileSync(file, "utf8"));
      code.split("\n").forEach((line, i) => {
        // `${pace}${paceUnitLabel(unit)}` — the template form — and
        // `2:00/km` / `${x}/km` — the literal and interpolated forms. A
        // range of two `paceLabel`s says the unit twice ("5:05 /km–5:12
        // /km"); `paceBandLabel` says it once, at the end.
        if (
          /\}\$\{paceUnitLabel\(/.test(line) ||
          /[\d}]\/(km|mi)\b/.test(line) ||
          /paceLabel\([^)]*\)\}\s*[–-]\s*\$\{paceLabel\(/.test(line)
        )
          hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
      for (const m of code.matchAll(jsxGlue)) {
        const lineNo = code.slice(0, m.index).split("\n").length;
        hits.push(`${rel}:${lineNo} ${m[0].replace(/\s+/g, " ").trim()}`);
      }
    }
    expect(
      hits,
      "pace glued to its unit — the app writes '5:34 /km' (a space before " +
        "the unit; a range '5:05–5:12 /km', unit once). Use `paceLabel` / " +
        '`paceBandLabel` from runLabels, or put {" "} before the unit in ' +
        "JSX:\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});
