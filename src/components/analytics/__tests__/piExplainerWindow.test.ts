import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The Performance Index tooltip is the only explanation of that number
 * anywhere in the app, and it named the wrong window.
 *
 * The engine scores a 7-day window against a 28-day baseline normalised
 * to a 7-day equivalent — all three factors come from the current week.
 * The sentence said the score combined them "over the last 4 weeks",
 * which describes the BASELINE as though it were the scored period. A
 * reader is told a bad week weighs on the figure for a month; the
 * opposite is nearer the truth, because a hard week is scored against a
 * calm four.
 *
 * Read from `functions/` rather than from the client mirror on purpose.
 * The rollup that writes every stored Performance Index runs there, so
 * that file is the copy whose numbers this sentence has to match.
 */

const ENGINE = readFileSync("functions/performanceEngine.js", "utf8");
const TAB = readFileSync("src/components/analytics/PerformanceTab.tsx", "utf8");

function constant(name: string): number {
  const m = ENGINE.match(new RegExp(`const ${name} = (\\d+);`));
  if (!m)
    throw new Error(`${name} not found in functions/performanceEngine.js`);
  return Number(m[1]);
}

function explainer(): string {
  const m = TAB.match(/const PI_EXPLAINER =\s*\n?\s*"([^"]+)";/);
  if (!m) throw new Error("PI_EXPLAINER not found");
  return m[1];
}

describe("the Performance Index explainer names the engine's windows", () => {
  it("reads both windows out of the engine that runs", () => {
    // Pins the extraction itself: a regex that silently matched nothing
    // would make every assertion below vacuous.
    expect(constant("WINDOW_DAYS")).toBe(7);
    expect(constant("BASELINE_DAYS")).toBe(28);
  });

  it("states the scored window in the engine's own days", () => {
    expect(explainer()).toContain(`last ${constant("WINDOW_DAYS")} days`);
  });

  it("states the baseline as the comparison, in weeks", () => {
    const weeks = constant("BASELINE_DAYS") / 7;
    expect(explainer()).toMatch(
      new RegExp(`measured against your previous ${weeks} weeks`)
    );
  });

  it("does not describe the score as covering the baseline", () => {
    /* The defect exactly: "combining … over the last 4 weeks". Any
       phrasing that puts the baseline span where the scored span belongs
       is the same claim. */
    const weeks = constant("BASELINE_DAYS") / 7;
    expect(explainer()).not.toMatch(
      new RegExp(`(combining|over|across)[^.]*last ${weeks} weeks`)
    );
  });

  it("keeps the sentence that stops the score reading as a target", () => {
    // The half that was already right — a higher PI is not advice to
    // train harder, and removing that is how this becomes a leaderboard.
    expect(explainer()).toContain("not a recommendation to train harder");
  });
});
