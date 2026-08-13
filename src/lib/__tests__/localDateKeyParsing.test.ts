/**
 * A "YYYY-MM-DD" key must never reach `new Date(...)` on a display path.
 *
 * `new Date("2026-08-13")` is parsed as UTC midnight — ECMA-262 mandates it
 * for the date-only ISO form. Rendering that instant back through
 * `toLocaleDateString` in any NEGATIVE UTC offset prints the PREVIOUS day.
 * Every user in the Americas sees a date-key display one day early, and
 * nobody in the UK ever does: at UTC+0 the instant is exact and at UTC+1
 * (BST) it lands at 01:00 the same day. The bug is invisible from where
 * this app is developed, and CLAUDE.md already names the class — "never mix
 * local-date and UTC operations in one calculation".
 *
 * `src/lib/dateHelpers.ts` has carried `parseLocalDate` for this the whole
 * time, and `performanceEngine.ts` cites it by name. Five display sites
 * bypassed it anyway, because nothing was checking:
 *
 *   - the race target date on the run-setup modal
 *   - the weigh-in date on TrendWeight's single-entry card
 *   - TrendWeight's chart tooltip header (Recharts hands the `date`
 *     dataKey through as `props.label`)
 *   - the workout date on WorkoutDetail (the no-`createdAt` fallback)
 *   - the workout date baked into a cold-start share card
 *
 * SCOPE — deliberately narrow, and narrow in the safe direction. It flags a
 * PROPERTY whose name ends in `date` (`r.date`, `ctx.targetDate`,
 * `series[0].date`) or a `String(...)` wrap, because those read as strings.
 * It does NOT flag a bare identifier: `new Date(today)` / `new Date(end)` is
 * almost always cloning a Date, and flagging those would drown the signal in
 * exactly the cases that are already correct. So this can miss a
 * date-key-holding bare identifier — it cannot invent one.
 *
 * The `+ "T12:00:00"` noon-anchor idiom is accepted as an equal alternative
 * to `parseLocalDate` — three chart surfaces already use it, and it is
 * local-parsing by construction.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Sites that parse a date key with `new Date` ON PURPOSE, keyed by file AND
 * by the exact argument expression.
 *
 * Per-EXPRESSION, not per-file, and that distinction is load-bearing rather
 * than fastidious. The first version keyed on the file, which exempted
 * `TrendWeight.tsx` wholesale — and TrendWeight is where TWO of the five
 * display bugs lived, alongside a legitimate span. A file-keyed list would
 * have reported three of five while reading as fully green on the rest. The
 * mutation run is what surfaced that: reverting all five fixes produced
 * three offenders, not five.
 *
 * All eight entries are SPANS — `later − earlier`, divided into days — or
 * the sort comparator feeding one. A constant offset cancels in a
 * subtraction, so UTC parsing is not merely harmless here, it is BETTER:
 * UTC days are uniformly 86 400 000 ms, while local midnights straddling a
 * DST change are 23 or 25 hours apart. Converting these to `parseLocalDate`
 * would turn an exact 14-day span into 13.958 on a spring-forward week, and
 * these spans feed `>=` thresholds. That is a real regression, so they stay
 * — this is a classification, not a rubber stamp.
 */
const SPAN_ONLY: Record<string, Record<string, string>> = {
  "src/utils/weightTrend.ts": {
    "a.date": "sort comparator; a constant offset cancels in the comparison",
    "b.date": "sort comparator; a constant offset cancels in the comparison",
    "last.date": "first→last day span — offset cancels, UTC days DST-uniform",
    "first.date": "first→last day span — offset cancels, UTC days DST-uniform",
  },
  "src/components/progress/TrendWeight.tsx": {
    "data[0].date": "daysSpan feeding the thin-data projection gate",
    "data[data.length - 1].date":
      "daysSpan feeding the thin-data projection gate",
  },
  "src/lib/weeklyReviewViewModel.ts": {
    "series[0].date": "daysSpan for the weight-trend blurb",
    "last.date": "daysSpan for the weight-trend blurb",
  },
};

/** Balanced-paren argument text for every `new Date(` in a source file. */
function newDateArgs(src: string): { arg: string; line: number }[] {
  const out: { arg: string; line: number }[] = [];
  const re = /new Date\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < src.length && depth > 0) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") depth--;
      i++;
    }
    out.push({
      arg: src.slice(m.index + m[0].length, i - 1).trim(),
      line: src.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (s) => " ".repeat(s.length))
    .replace(/\/\/[^\n]*/g, (s) => " ".repeat(s.length));
}

/** Does this argument read as a date-KEY string rather than a Date? */
function looksLikeDateKey(arg: string): boolean {
  if (!arg) return false;
  // Already local-parsed by the noon-anchor idiom.
  if (/\+\s*["'`]T\d/.test(arg)) return false;
  if (/^String\(/.test(arg)) return true;
  // A property access ending in `date` / `Date` (r.date, ctx.targetDate,
  // series[0].date). A BARE identifier is excluded on purpose — see header.
  return /[.\]]\s*\w*[Dd]ate$/.test(arg) || /\.\w*[Dd]ate$/.test(arg);
}

function scan(): { site: string; arg: string; file: string }[] {
  const files = globSync("src/**/*.{ts,tsx}", { cwd: repoRoot }).filter(
    (f) => !f.includes("__tests__") && !f.includes(".test.")
  );
  const found: { site: string; arg: string; file: string }[] = [];
  for (const rel of files) {
    const src = stripComments(readFileSync(resolve(repoRoot, rel), "utf8"));
    for (const { arg, line } of newDateArgs(src)) {
      if (!looksLikeDateKey(arg)) continue;
      found.push({ site: `${rel}:${line}`, arg, file: rel });
    }
  }
  return found;
}

const found = scan();

/** Is this exact (file, argument) pair classified as span-only? */
function classified(file: string, arg: string): boolean {
  return Boolean(SPAN_ONLY[file]?.[arg]);
}

describe("date keys are parsed locally, not as UTC midnight", () => {
  it("still sees the pattern at all", () => {
    /* The positive control. A detector that matches nothing is
       indistinguishable from a clean codebase, and every regex here is one
       refactor away from matching nothing — `looksLikeDateKey` in
       particular is anchored on a naming convention. If the classified
       span sites stop being found, this detector has gone blind and the
       assertion below has become decorative. */
    expect(found.length).toBeGreaterThanOrEqual(4);
    expect(found.some((f) => f.file === "src/utils/weightTrend.ts")).toBe(true);
  });

  it("classifies the argument shapes it is supposed to", () => {
    // Guards the guard: if `looksLikeDateKey` returned false for
    // everything, the gate below would be vacuous.
    expect(looksLikeDateKey("r.date")).toBe(true);
    expect(looksLikeDateKey("ctx.targetDate")).toBe(true);
    expect(looksLikeDateKey("series[0].date")).toBe(true);
    expect(looksLikeDateKey("String(props.label)")).toBe(true);
    // And the shapes it must NOT flag.
    expect(looksLikeDateKey('point.date + "T12:00:00"')).toBe(false);
    expect(looksLikeDateKey("today")).toBe(false);
    expect(looksLikeDateKey("endDate")).toBe(false);
  });

  it("every classified entry still corresponds to a real site", () => {
    /* Keeps the exemption list honest: a fixed or deleted span site must
       take its entry with it, or the list silently pre-authorises an
       expression nobody has looked at. */
    const stale: string[] = [];
    for (const [file, args] of Object.entries(SPAN_ONLY)) {
      for (const arg of Object.keys(args)) {
        if (!found.some((f) => f.file === file && f.arg === arg))
          stale.push(`${file}  new Date(${arg})`);
      }
    }
    expect(stale, `SPAN_ONLY entries matching no site`).toEqual([]);
  });

  it("no unclassified site parses a date key as UTC", () => {
    const offenders = found
      .filter((f) => !classified(f.file, f.arg))
      .map((f) => `${f.site}  new Date(${f.arg})`);
    expect(
      offenders,
      `These parse a "YYYY-MM-DD" key as UTC midnight. Rendered through ` +
        `toLocaleDateString they print the PREVIOUS day for every user at a ` +
        `negative UTC offset — and never for a UK developer, which is why ` +
        `five of these shipped. Use parseLocalDate() from @/lib/dateHelpers, ` +
        `or the + "T12:00:00" noon anchor. If the value is only ever used in ` +
        `a SPAN (later − earlier), classify it in SPAN_ONLY with the ` +
        `reason:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });

  it("parseLocalDate really is local", () => {
    // The whole gate is pointless if the replacement shares the defect.
    const local = new Date(2026, 7, 13);
    const utc = new Date("2026-08-13");
    expect(local.getDate()).toBe(13);
    expect(local.getMonth()).toBe(7);
    // Same wall-clock date only when the runner sits at UTC+0; the point is
    // that the LOCAL constructor is offset-independent by construction.
    expect(local.getHours()).toBe(0);
    expect(utc.getUTCHours()).toBe(0);
  });
});
