import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * The overview's bars are weeks or months, and each is named as the whole
 * of one: "17 Aug" on the axis, "Week of 17 Aug" when tapped. The window
 * rarely starts on a Monday or a 1st, so its first bar begins before the
 * window does. Given only the window's sessions, that bar held a part: on
 * Monday 21 Sep at 1M it held Sunday 23 Aug alone and read "Week of
 * 17 Aug: 0 kg · 0 sessions", and at 1Y the first month held two to nine
 * days. `summaryBins` bins whatever it is given, so what makes the bar
 * whole is the page handing it the first bar's days from before the
 * window as well.
 *
 * Pinned at the source, as the other History tests are: the page mounts
 * charts, maps and several Firestore hooks, and a render test would pin
 * fixtures rather than which sessions the bars are given.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const history = readFileSync(resolve(repoRoot, "src/pages/History.tsx"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/\/\/[^\n]*/g, " ");

/** The period summary's memo, up to its dependency list. */
function periodSummaryBlock(): string {
  const start = history.indexOf("const periodSummary = useMemo(");
  expect(start, "the period summary memo is gone").toBeGreaterThan(-1);
  const end = history.indexOf("}, [", start);
  expect(end, "unterminated period summary memo").toBeGreaterThan(start);
  return history.slice(start, end);
}

/** The expression passed as `name:` to `summaryBins`. */
function binsArgument(name: "lifts" | "runs"): string {
  const block = periodSummaryBlock();
  const call = block.slice(block.indexOf("summaryBins("));
  const at = call.indexOf(`${name}:`);
  expect(at, `summaryBins is no longer given ${name}`).toBeGreaterThan(-1);
  const next = call.slice(at + name.length + 1).search(/\n\s{6}\w+[:,]/);
  return call.slice(at, at + name.length + 1 + next);
}

describe("History — each summary bar is the whole week or month it names", () => {
  it("starts the bars' sessions on the first bar's first day, not the window's", () => {
    for (const name of ["lifts", "runs"] as const) {
      const arg = binsArgument(name);
      expect(
        arg,
        `${name} are cut at the window's first day, so the first bar holds part of the week it names`
      ).not.toMatch(/>= sinceKey/);
      expect(arg).toMatch(/>= firstDayKey/);
    }
    expect(periodSummaryBlock()).toMatch(
      /const firstDayKey = summaryFirstDayKey\(since, granularity\)/
    );
  });

  it("takes the first bar's runs from before the window from the read of every run", () => {
    /* `runs` is `useRunningStats(rangeDays)`, which reads the window only.
       Inside the window the bars keep counting that read, so the change
       reaches the first bar's earlier days and nothing else. */
    const block = periodSummaryBlock();
    expect(block).toMatch(
      /lifetimeRuns\.runs\.filter\(\(r\) => runEvidenceDate\(r\) < sinceKey\)/
    );
    expect(block).toMatch(
      /runs\.filter\(\(r\) => runEvidenceDate\(r\) >= sinceKey\)/
    );
    expect(history).toMatch(
      /const periodSummary = useMemo\([\s\S]*?\}, \[[^\]]*lifetimeRuns\.runs[^\]]*\]\)/
    );
  });
});
