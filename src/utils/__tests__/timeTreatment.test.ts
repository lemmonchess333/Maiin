import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * The app's one clock time of day is 24-hour "HH:mm" ("07:10", "13:13"),
 * printed by `formatTimeOfDay` in src/utils/formatters.ts (owner,
 * 2026-10-05: "We need one format"). Before that the Food diary printed a
 * meal's time as "1:13 PM" (a date-fns "h:mm a" written at the site) and
 * the water sheet printed "13:13" (an "HH:mm" written at its own site):
 * two patterns, each fine alone, one app.
 *
 * 24-hour because the dates are already en-GB whatever the device
 * (dateTreatment.test.ts), because it is the UK convention and cannot be
 * misread, and because a fixed pattern reads the same on every phone,
 * where Intl reads as the locale's convention.
 *
 * This scan refuses three shapes:
 *  1. a clock pattern written into a date-fns format call ("h:mm a",
 *     "p", and "HH:mm" too: one home is what keeps it one format);
 *  2. a time asked of Intl: `toLocaleTimeString`, or an hour, minute,
 *     second, day-period or time-style option to `toLocaleString`,
 *     `toLocaleDateString` or `Intl.DateTimeFormat`;
 *  3. AM or PM in code or copy ("7:42 PM", "before 7am", a bare "pm").
 * The first two exempt formatters.ts, the home. All three read code with
 * the comments blanked out: prose may discuss the 12-hour clock.
 *
 * Never matched, because they are not times of day: durations and paces
 * ("23:41", "5:18 /km"), stored reminder times ("08:00", already 24-hour
 * data) and native `<input type="time">` controls, which the OS draws.
 * Not seen: a Date's own `toLocaleString()` with no options, which a scan
 * cannot tell from a number's (the operator crash list in Diagnostics
 * prints one, "en-GB", seconds included), and date-fns' formatter
 * imported under another name.
 *
 * An empty scan proves only what its detector can see, so each detector
 * is run against the shapes it exists to refuse before its empty result
 * is believed (the positive controls below), and the date-fns reader
 * must read every format call in the tree, so a pattern it cannot see
 * fails instead of passing.
 */

const SRC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.." // src/
);

/** The one home for a clock time's pattern. */
const HOME = "utils/formatters.ts";

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

/** A string literal in any of the three quotes. */
const STR =
  String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` +
  "`(?:[^`\\\\]|\\\\[\\s\\S])*`";

/**
 * The text with its comments blanked and everything else kept, line
 * numbers intact. One left-to-right pass takes whichever of a comment or
 * a string starts first, so the "//" in "https://…" stays string and a
 * quote inside a comment stays comment. A line-at-a-time "//.*$" strip
 * would cut a URL string and hide the rest of its line.
 */
function stripComments(text: string): string {
  return text.replace(
    new RegExp(String.raw`\/\*[\s\S]*?\*\/|\/\/[^\n]*|${STR}`, "g"),
    (m) => (m[0] === "/" ? m.replace(/[^\n]/g, " ") : m)
  );
}

function lineAt(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

/* ── 1. Clock patterns in date-fns format calls ─────────────────────── */

/* Scanned whole-file, not by line, because Prettier wraps a format call
   across lines once its arguments are long. The first argument nests
   calls and strings of its own (`new Date(selectedDate + "T12:00:00")`,
   `addDays(parseLocalDate(weekStartKey), -1)`), so an argument is read
   as strings, (…) groups three deep and anything that is neither a comma
   nor a bracket, and a comma inside a pattern ("d MMM, HH:mm") stays in
   its string. */
const NOT_QUOTE_OR_PAREN = "[^()\"'`]";
const GROUP = String.raw`\((?:${STR}|${NOT_QUOTE_OR_PAREN}|\((?:${STR}|${NOT_QUOTE_OR_PAREN}|\((?:${STR}|${NOT_QUOTE_OR_PAREN})*\))*\))*\)`;
const ARG = String.raw`(?:${STR}|${GROUP}|[^,()"'` + "`])+?";

const FORMATTER = String.raw`(?<![\w.$])(?:format|formatDate|lightFormat)\(`;
/** A call to date-fns' formatter; group 1 is its pattern argument. */
const FORMAT_CALL = String.raw`${FORMATTER}\s*${ARG}\s*,\s*(${ARG})(?=\s*[,)])`;
/** A file that calls it. */
const IMPORTS_FORMAT =
  /import\s*\{[^}]*\b(?:format|formatDate|lightFormat)\b[^}]*\}\s*from\s*["']date-fns(?:\/[\w-]+)*["']/;

function literalsIn(text: string): string[] {
  return [...text.matchAll(new RegExp(STR, "g"))].map((m) =>
    m[0].slice(1, -1).replace(/\$\{[^}]*\}/g, "")
  );
}

/** What `const name = …;` holds, in the same file. */
function constValue(code: string, name: string): string {
  const id = name.replace(/\$/g, "\\$");
  const m = new RegExp(
    String.raw`(?:const|let|var)\s+${id}(?![\w$])(?:\s*:[^=;]+)?\s*=\s*([^;]+);`
  ).exec(code);
  return m ? m[1] : "";
}

type FormatCall = { at: string; patterns: string[] | null };

/**
 * Every call to date-fns' formatter in `code`, with the patterns it can
 * be handed: the string literals in its second argument (both arms of a
 * ternary), or in the same-file const that argument names
 * (raceDates.ts's `pattern`). null when none can be seen: a parameter,
 * an import, or a call the reader cannot parse.
 */
function formatCalls(code: string): FormatCall[] {
  return [...code.matchAll(new RegExp(FORMATTER, "g"))].map((start) => {
    const call = new RegExp(FORMAT_CALL, "y");
    call.lastIndex = start.index;
    const m = call.exec(code);
    let patterns: string[] | null = null;
    if (m) {
      const arg = m[1].trim();
      patterns = literalsIn(arg);
      if (patterns.length === 0 && /^[A-Za-z_$][\w$]*$/.test(arg))
        patterns = literalsIn(constValue(code, arg));
      if (patterns.length === 0) patterns = null;
    }
    const text = (m ? m[0] : code.slice(start.index, start.index + 60))
      .replace(/\s+/g, " ")
      .trim();
    return { at: `${lineAt(code, start.index)} ${text}`, patterns };
  });
}

/** An hour, minute or second token, a day period (a, b, B) or a
 *  localised time (p). 'Quoted' text is not tokens, so it goes first. */
function printsAClock(pattern: string): boolean {
  return /[hHkKmsSabBp]/.test(pattern.replace(/'[^']*'/g, ""));
}

function clockPatterns(code: string): string[] {
  return formatCalls(code)
    .filter((c) => c.patterns?.some(printsAClock))
    .map((c) => c.at);
}

function unreadFormatCalls(code: string): string[] {
  if (!IMPORTS_FORMAT.test(code)) return [];
  return formatCalls(code)
    .filter((c) => c.patterns === null)
    .map((c) => c.at);
}

/* ── 2 and 3. Times asked of Intl, and day periods ──────────────────── */

const INTL_TIME = new RegExp(
  String.raw`\.toLocaleTimeString\(|(?:toLocaleString|toLocaleDateString|DateTimeFormat)\(\s*(?:${STR}|${GROUP}|[^()"'` +
    "`" +
    String.raw`])*?\b(?:hour|minute|second|dayPeriod|timeStyle|hour12|hourCycle)\s*:`,
  "g"
);

/* "PM" as a word (not "PM2.5", not `isPM`), am/pm against a digit
   ("7am", "7 p.m.", not "I am" or "npm"), or a bare "am"/"pm" string. */
const DAY_PERIOD = new RegExp(
  String.raw`\b(?:AM|PM)\b|\d\s?[ap]\.?m\.?(?!\w)|(["'` +
    "`" +
    String.raw`])\s*[ap]\.?m\.?\s*\1`,
  "g"
);

/** Each match, as its line number and that source line. */
function hitsIn(code: string, re: RegExp): string[] {
  const lines = code.split("\n");
  return [...code.matchAll(re)].map((m) => {
    const line = lineAt(code, m.index);
    return `${line} ${lines[line - 1].trim().slice(0, 120)}`;
  });
}

const intlTimes = (code: string) => hitsIn(code, INTL_TIME);
const dayPeriods = (code: string) => hitsIn(code, DAY_PERIOD);

/* ── The scan ────────────────────────────────────────────────────────── */

let sourcesCache: { rel: string; code: string }[] | undefined;
function sources(): { rel: string; code: string }[] {
  sourcesCache ??= walk(SRC_ROOT).map((file) => ({
    rel: file.slice(SRC_ROOT.length + 1),
    code: stripComments(readFileSync(file, "utf8")),
  }));
  return sourcesCache;
}

function scan(detect: (code: string) => string[], exempt?: string): string[] {
  return sources()
    .filter((s) => s.rel !== exempt)
    .flatMap((s) => detect(s.code).map((hit) => `${s.rel}:${hit}`));
}

/** A snippet read exactly as the scan reads a file. */
const read = (text: string, detect: (code: string) => string[]) =>
  detect(stripComments(text));

describe("one time of day (24-hour HH:mm, via formatTimeOfDay)", () => {
  it("names a home that is where formatTimeOfDay lives", () => {
    const home = sources().find((s) => s.rel === HOME);
    expect(home?.code).toMatch(/export function formatTimeOfDay\(/);
  });

  it("no clock pattern written into a date-fns format call", () => {
    const hits = scan(clockPatterns, HOME);
    expect(
      hits,
      "a clock pattern written at the site — print a time of day with " +
        "formatTimeOfDay from src/utils/formatters.ts (24-hour 'HH:mm'):\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("no time of day asked of Intl", () => {
    const hits = scan(intlTimes, HOME);
    expect(
      hits,
      "Intl prints a time in the locale's convention ('1:13 PM' on one " +
        "phone, '13:13' on the next) — use formatTimeOfDay:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("no AM or PM in code or copy", () => {
    const hits = scan(dayPeriods);
    expect(
      hits,
      "the app's times are 24-hour ('19:42', 'before 07:00'), with no " +
        "AM/PM:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("reads the pattern of every date-fns format call in the tree", () => {
    const calls = sources()
      .filter((s) => IMPORTS_FORMAT.test(s.code))
      .flatMap((s) => formatCalls(s.code));
    expect(
      calls.length,
      "found no date-fns format calls at all: the reader is not reading " +
        "this tree, so the clock-pattern scan above is proving nothing"
    ).toBeGreaterThan(0);

    const hits = scan(unreadFormatCalls);
    expect(
      hits,
      "a date-fns format call whose pattern the guard cannot see. Write " +
        "the pattern at the call or in a const in the same file; for a " +
        "time of day, call formatTimeOfDay instead:\n" +
        hits.join("\n")
    ).toEqual([]);
  });
});

describe("each detector catches what it exists to catch", () => {
  it.each([
    ["the diary's 12-hour time", `format(new Date(group.latestMs), "h:mm a")`],
    ["the water sheet's own HH:mm", `format(new Date(drink.at), "HH:mm")`],
    [
      "a call Prettier wrapped",
      `format(\n  addDays(parseLocalDate(weekStartKey), -1),\n  "HH:mm"\n)`,
    ],
    ["a comma inside the pattern", `format(at, "d MMM, h:mm a")`],
    ["a template-literal date", 'format(new Date(`${day}T${time}`), "HH:mm")'],
    ["date-fns' localised time", `format(at, "p")`],
    ["a ternary of patterns", `format(at, long ? "EEEE HH:mm" : "HH:mm")`],
    ["a same-file const", `const pattern = "h:mm a";\nformat(at, pattern);`],
  ])("clock pattern: %s", (_, code) => {
    expect(read(code, clockPatterns)).toHaveLength(1);
  });

  it.each([
    ["a date", `format(parseLocalDate(dateKey), "EEE d MMM")`],
    ["a day key", `format(addDays(new Date(), -30), "yyyy-MM-dd")`],
    ["quoted text, which is not tokens", `format(d, "EEEE 'the' d")`],
    ["a comment", `// format(at, "h:mm a") was the diary's`],
  ])("not a clock pattern: %s", (_, code) => {
    expect(read(code, clockPatterns)).toEqual([]);
  });

  it.each([
    ["toLocaleTimeString", `new Date(at).toLocaleTimeString()`],
    [
      "toLocaleTimeString with en-GB",
      `at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })`,
    ],
    [
      "an hour option, wrapped",
      `at.toLocaleString(\n  "en-US",\n  { hour: "numeric", minute: "2-digit" }\n)`,
    ],
    [
      "a time style",
      `new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(at)`,
    ],
    [
      "a time on a date",
      `at.toLocaleDateString("en-GB", { day: "numeric", hour: "numeric" })`,
    ],
  ])("Intl time: %s", (_, code) => {
    expect(read(code, intlTimes)).toHaveLength(1);
  });

  it.each([
    [
      "a date",
      `d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })`,
    ],
    ["the device's zone", `Intl.DateTimeFormat().resolvedOptions().timeZone`],
    ["a grouped number", `Math.round(n).toLocaleString()`],
  ])("not an Intl time: %s", (_, code) => {
    expect(read(code, intlTimes)).toEqual([]);
  });

  it.each([
    ["the demo's diary row", `meta="Snacks · 4:24 PM"`],
    ["a template", "meta={`${r.meal} · 7:42 PM`}"],
    ["JSX text", `<p>Tomorrow at 8:00 AM</p>`],
    ["the old Early Bird copy", `description: "Log before 7am for 5 days"`],
    ["a dotted period", `const label = "7 p.m.";`],
    ["a bare suffix", `const suffix = "pm";`],
    [
      "a line whose string holds //",
      `const u = "https://tropos.app"; const t = "7:42 PM";`,
    ],
  ])("AM/PM: %s", (_, code) => {
    expect(read(code, dayPeriods)).toHaveLength(1);
  });

  it.each([
    ["a line comment", `// a US phone reads 1:13 PM`],
    ["a block comment", `/* "Breakfast · 8:12 AM" */`],
    [
      "words that only contain the letters",
      `const air = "PM2.5"; const isPM = h >= 12; run("npm test");`,
    ],
    ["English", `const s = "I am at camp";`],
    ["the one format", `const t = "13:13";`],
  ])("not AM/PM: %s", (_, code) => {
    expect(read(code, dayPeriods)).toEqual([]);
  });

  it("reports a format call whose pattern it cannot see", () => {
    const code = [
      `import { format } from "date-fns";`,
      `import { TIME } from "./patterns";`,
      `format(at, TIME);`,
    ].join("\n");
    expect(read(code, unreadFormatCalls)).toHaveLength(1);
  });

  it("but reads a pattern held in a same-file const, as raceDates.ts does", () => {
    const code = [
      `import { format } from "date-fns";`,
      `const pattern = long ? "EEEE d MMMM yyyy" : "d MMM yyyy";`,
      `format(parseLocalDate(key), pattern);`,
    ].join("\n");
    expect(read(code, unreadFormatCalls)).toEqual([]);
  });
});
