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
 * drift. Nothing else is exempt from the kg/km and pace scans.
 *
 * Durations are in scope too, as words with spaced units, from
 * `formatDuration` in formatters.ts: "3 min", "1 h 5 min", "1 min 30 s".
 * Two glued shapes are refused: minutes glued to their figure ("3min",
 * `${n}min`), and an hour glued to its figure with minutes after it
 * ("1h 05m", `${h}h ${m}m`). A bare "12m" is not scanned, for the reason
 * metres are not. A clock ("23:41") is formatClock's and is not a span
 * in words, so it never matches. The hour scan has two named exceptions
 * in HOUR_EXEMPT, each with its reason.
 *
 * And a signed figure takes the true minus, U+2212, from `withSign` /
 * `formatSigned`. The tell of the hyphen is a sign written only for the
 * positive case, `x > 0 ? "+" : ""`, which leaves a negative to print
 * the hyphen `toFixed` and `toLocaleString` give it: "+0.25 kg/wk" one
 * week and "-0.27 kg/wk" the next.
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
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("one unit treatment (spaced: '60 kg', '5.2 km')", () => {
  it("no unspaced kg/km value+unit adjacency in rendered code", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
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
      const rel = file.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
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

/** Minutes glued to a figure: "3min", `${n}min`. Not an identifier's
 *  digits ("every_5min", a stored key). */
const GLUED_MINUTES = /(?<![\w.$])\d+(?:\.\d+)?min\b|\}min\b/;
/** An hour glued to its figure with more after it: "1h 05m", `${h}h ${`. */
const GLUED_HOUR = /[\d}]h\s+(?:\$\{|\d)/;
/** A sign for the positive case only: `x > 0 ? "+" : ""`. */
const PLUS_ONLY = /[<>]=?\s*0\s*\?\s*(["'`])\+\1\s*:\s*(["'`])\2/;

/**
 * Files the hour scan leaves alone, and why. Each must still hold the
 * shape it is excused for; the last test fails when one no longer does,
 * so an entry cannot outlive its reason.
 */
const HOUR_EXEMPT: Record<string, string> = {
  /* A compact figure documented at its site ("12h 5m", "123h"): a week's
     time on the move in a third of a phone's width, as formatVolume's
     "1.5k" is a compact volume. */
  "lib/trainingWeeks.ts": "totalTimeLabel's compact figure",
  /* durationLabel's hour form. The file is being reworded in a pass of
     its own; route the hour form through formatDuration there and delete
     this entry. */
  "lib/runLabels.ts": "durationLabel, pending its own pass",
};

function scanLines(re: RegExp, exempt: Record<string, string> = {}): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const rel = file.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
    if (EXEMPT.has(rel) || rel in exempt) continue;
    stripComments(readFileSync(file, "utf8"))
      .split("\n")
      .forEach((line, i) => {
        if (re.test(line)) hits.push(`${rel}:${i + 1} ${line.trim()}`);
      });
  }
  return hits;
}

describe("durations in words, spaced ('3 min', '1 h 5 min')", () => {
  it("each detector catches the shape it exists to refuse", () => {
    expect(
      GLUED_MINUTES.test("return `${reps} × ${Math.round(s / 60)}min`;")
    ).toBe(true);
    expect(GLUED_MINUTES.test('label: "6 × 3min"')).toBe(true);
    expect(GLUED_MINUTES.test('label: "6 × 3 min"')).toBe(false);
    expect(GLUED_MINUTES.test('frequency === "every_5min"')).toBe(false);
    expect(
      GLUED_HOUR.test('return `${h}h ${String(mm).padStart(2, "0")}m`;')
    ).toBe(true);
    expect(GLUED_HOUR.test("return `Started ${hours}h ${remMins}m ago`;")).toBe(
      true
    );
    expect(GLUED_HOUR.test('const t = "1h 05m";')).toBe(true);
    expect(GLUED_HOUR.test('const t = "1 h 5 min";')).toBe(false);
    expect(GLUED_HOUR.test("const w = `${days}d`;")).toBe(false);
  });

  it("no minutes glued to their figure", () => {
    const hits = scanLines(GLUED_MINUTES);
    expect(
      hits,
      "minutes glued to the figure — the app writes '3 min'. Use " +
        "formatDuration from src/utils/formatters.ts:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("no '1h 05m': an hour and its minutes read in words", () => {
    const hits = scanLines(GLUED_HOUR, HOUR_EXEMPT);
    expect(
      hits,
      "an hour glued to its figure — the app writes '1 h 5 min'. Use " +
        "formatDuration from src/utils/formatters.ts:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("every hour exemption still holds the shape it excuses", () => {
    for (const rel of Object.keys(HOUR_EXEMPT)) {
      const code = stripComments(readFileSync(join(SRC_ROOT, rel), "utf8"));
      expect(
        GLUED_HOUR.test(code),
        `${rel} no longer writes a glued hour: delete its HOUR_EXEMPT entry`
      ).toBe(true);
    }
  });
});

describe("a signed figure takes the true minus ('−0.27', never '-0.27')", () => {
  it("the detector catches a sign written for the positive case only", () => {
    expect(PLUS_ONLY.test('{delta > 0 ? "+" : ""}')).toBe(true);
    expect(PLUS_ONLY.test("`${x >= 0 ? '+' : ''}${x}`")).toBe(true);
    expect(PLUS_ONLY.test("`${kg > 0 ? `+` : ``}${kg}`")).toBe(true);
    // A plus that is not a sign: added load on a bodyweight lift, a cap.
    expect(PLUS_ONLY.test('{bodyweight ? "+" : ""}')).toBe(false);
    expect(PLUS_ONLY.test('`${n}${capped ? "+" : ""} posts`')).toBe(false);
    expect(PLUS_ONLY.test("withSign(delta, String(Math.abs(delta)))")).toBe(
      false
    );
  });

  it("no sign written for the positive case alone", () => {
    const hits = scanLines(PLUS_ONLY);
    expect(
      hits,
      "a sign for the positive case only leaves a negative to print a " +
        "hyphen ('-0.27'). Use withSign or formatSigned from " +
        "src/utils/formatters.ts, which write '−0.27' and '+0.25':\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});
