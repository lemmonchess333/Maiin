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
});
