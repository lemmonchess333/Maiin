import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * The app's one date treatment is en-GB day-before-month ("22 Aug",
 * "Saturday 23 August") via src/utils/formatters.ts. Two prior sweeps
 * each declared themselves the last one and both missed the same two
 * classes, because neither greps like a bug:
 *
 *  1. `toLocaleDateString(undefined, …)` / `toLocaleDateString({…})` —
 *     an ABSENT locale follows the DEVICE, so the site renders the
 *     correct order on a UK phone and "Aug 22" on a US one. Invisible
 *     to a UK developer, wrong for half the user base. Six sites
 *     survived this way (2026-08-22 sweep).
 *  2. date-fns month-before-day patterns ("MMM d", "EEE, MMMM d") —
 *     these don't look like locale bugs at all, and two of them fed
 *     share-card payloads, so the American order was rasterised into
 *     public images.
 *
 * This scan closes both classes. Legitimate exceptions:
 *  - A literal locale ("en-GB") is always allowed.
 *  - Number.prototype.toLocaleString is out of scope (numeric grouping
 *    deliberately follows the runner — see energyCaptureAnchor).
 *  - Chart-axis "22/8" numerals are hand-rolled day-first, not date-fns.
 *
 * A third class is order-correct and still drift: a day-first date-fns
 * pattern written at the site ("d MMM", "EEE d MMM yyyy") beside the
 * helpers in formatters.ts that print the same date. Two routes to one
 * date disagree where their sources do: date-fns spells September "Sep"
 * and the helpers' en-GB Intl spells it "Sept", so one screen can show
 * both. The last test refuses a day-first pattern with a month NAME
 * outside formatters.ts. A numeric month ("d/M", the chart-axis compact
 * register), a weekday alone ("EEEEE", the week strips' column letter)
 * and a day key ("yyyy-MM-dd", which is data, not display) never match.
 */

const SRC_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.." // src/
);

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

/**
 * Scan whole FILE text, not line by line.
 *
 * Line-at-a-time was a real hole, not a hypothetical one. Prettier wraps
 * a `toLocaleDateString` call as soon as its arguments are long — which
 * is precisely when a site passes an options object, the commonest shape
 * of this bug:
 *
 *     .toLocaleDateString(
 *       undefined,
 *       { day: "numeric", month: "short", year: "numeric" }
 *     )
 *
 * `.toLocaleDateString(` ends one line and `undefined` begins the next,
 * so no per-line pattern can ever match it. `WorkoutHistoryList` sat
 * like that and rendered every saved workout's date in the DEVICE's
 * order — "Aug 1, 2026" on a US phone, "1. Aug. 2026" on a German one —
 * while this guard reported clean. Found by running the suite under
 * de-DE, not by reading.
 *
 * Patterns passed here therefore need `\s*` where a newline may fall.
 */
function scan(re: RegExp): string[] {
  const hits: string[] = [];
  for (const file of walk(SRC_ROOT)) {
    const text = readFileSync(file, "utf8");
    const rx = new RegExp(
      re.source,
      re.flags.includes("g") ? re.flags : re.flags + "g"
    );
    for (const m of text.matchAll(rx)) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push(
        `${file.slice(SRC_ROOT.length + 1)}:${line} ${m[0].replace(/\s+/g, " ").trim()}`
      );
    }
  }
  return hits;
}

describe("one date treatment (en-GB day-before-month)", () => {
  it("no toLocaleDateString without an explicit locale", () => {
    // Matches `.toLocaleDateString()` and `.toLocaleDateString(undefined…`
    // — both resolve the runner's locale. A literal ("en-GB") passes.
    const hits = scan(/\.toLocaleDateString\(\s*(\)|undefined)/);
    expect(
      hits,
      "locale-less toLocaleDateString follows the DEVICE — route through " +
        "src/utils/formatters.ts (formatDayMonth / formatDayMonthYear / " +
        "formatWeekdayDayMonth) or pass 'en-GB' explicitly:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("no month-before-day date-fns format patterns", () => {
    // "MMM d" / "MMMM d" (optionally after a weekday token) render the
    // American order. The en-GB forms are "d MMM" / "EEEE d MMMM".
    const hits = scan(/["'`][^"'`]*MMM+ d\b[^"'`]*["'`]/);
    expect(
      hits,
      "month-before-day date pattern — the app's treatment is day-first " +
        "('d MMM', 'EEEE d MMMM'):\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("each day-first detector case reads as it should", () => {
    for (const pattern of [
      "d MMM",
      "EEE d MMM",
      "EEEE d MMMM yyyy",
      "d MMM yyyy",
      "do MMMM",
    ])
      expect(isDayFirstPattern(pattern), pattern).toBe(true);
    for (const pattern of [
      "yyyy-MM-dd",
      "d/M",
      "EEEEE",
      "EEE",
      "'day' d", // no month
      "Add MMM", // a word, not a day token
    ])
      expect(isDayFirstPattern(pattern), pattern).toBe(false);
    // Read whole-file, so a comment that quotes a pattern stays quiet.
    expect(dayFirstLiterals(`// was "EEE d MMM"\nconst a = 1;`)).toEqual([]);
    expect(
      dayFirstLiterals(`format(\n  parseLocalDate(d),\n  "d MMM yyyy"\n)`)
    ).toHaveLength(1);
  });

  it("no day-first date-fns pattern written outside formatters.ts", () => {
    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const rel = file.slice(SRC_ROOT.length + 1).replaceAll("\\", "/");
      if (rel === FORMATTERS || rel in DAY_FIRST_PENDING) continue;
      for (const hit of dayFirstLiterals(readFileSync(file, "utf8")))
        hits.push(`${rel}:${hit}`);
    }
    expect(
      hits,
      "a date pattern written at the site — print it with a helper from " +
        "src/utils/formatters.ts (formatDayMonth, formatDayMonthYear, " +
        "formatShortWeekdayDayMonth, formatWeekdayDayMonth, " +
        "formatDayMonthLong, formatDayMonthYearLong, " +
        "formatWeekdayDayMonthYear), or add one there:\n" +
        hits.join("\n")
    ).toEqual([]);
  });

  it("every pending file still holds the pattern it is excused for", () => {
    for (const rel of Object.keys(DAY_FIRST_PENDING)) {
      expect(
        dayFirstLiterals(readFileSync(join(SRC_ROOT, rel), "utf8")).length,
        `${rel} no longer writes a day-first pattern: delete its ` +
          `DAY_FIRST_PENDING entry`
      ).toBeGreaterThan(0);
    }
  });
});

/** The helpers' home, where a pattern may be written. */
const FORMATTERS = "utils/formatters.ts";

/**
 * Files the day-first scan leaves for now, and why. Each must still hold
 * a pattern; the test above fails once one does not, so an entry cannot
 * outlive its reason.
 */
const DAY_FIRST_PENDING: Record<string, string> = {
  /* "EEE d MMM" for a run day's date. The file is being reworded in a
     pass of its own; move it onto formatShortWeekdayDayMonth there and
     delete this entry. */
  "components/program/ProgrammeRunSection.tsx": "a run day's date",
};

/** A string literal in any of the three quotes. */
const STR =
  String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|` +
  "`(?:[^`\\\\]|\\\\[\\s\\S])*`";

/** A date-fns pattern that prints a day of the month and a month's
 *  name. 'Quoted' text is not tokens, so it goes first. */
function isDayFirstPattern(pattern: string): boolean {
  const tokens = pattern.replace(/'[^']*'/g, "");
  return (
    /(?<![A-Za-z])(?:d{1,2}|do)(?![A-Za-z])/.test(tokens) &&
    /M{3,}|L{3,}/.test(tokens)
  );
}

/**
 * Each string literal in `text` that is a day-first pattern, as its line
 * and the literal. One left-to-right pass takes whichever of a comment or
 * a string starts first, so a comment that quotes a pattern is skipped
 * and the "//" in a URL stays part of its string.
 */
function dayFirstLiterals(text: string): string[] {
  const hits: string[] = [];
  const rx = new RegExp(String.raw`\/\*[\s\S]*?\*\/|\/\/[^\n]*|${STR}`, "g");
  for (const m of text.matchAll(rx)) {
    if (m[0][0] === "/") continue;
    if (!isDayFirstPattern(m[0].slice(1, -1))) continue;
    const line = text.slice(0, m.index).split("\n").length;
    hits.push(`${line} ${m[0]}`);
  }
  return hits;
}
