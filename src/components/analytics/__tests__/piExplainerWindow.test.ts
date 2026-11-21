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
// The sentence sits beside the score's ring, the first of Progress's
// Score details (Trim1 call 5, App1 Q10), which are Pro; the number itself
// is free, small on the lead above (the owner, 18 November 2026).
const TAB = readFileSync(
  "src/components/analytics/PerformanceDetails.tsx",
  "utf8"
);
// The lead above it explains its usual week from the same two windows.
const LEAD = readFileSync(
  "src/components/analytics/PerformanceSection.tsx",
  "utf8"
);

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

function leadExplainer(): string {
  const m = LEAD.match(/const LEAD_EXPLAINER =\s*\n?\s*"([^"]+)";/);
  if (!m) throw new Error("LEAD_EXPLAINER not found");
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

  it("says what the score is made of in your training, never as load", () => {
    /* "training load, recovery and consistency" named a metric where the
       person's lifting and running are (house voice: say sessions, kilos
       and kilometres; no load unless the screen explains it). */
    expect(explainer()).not.toMatch(/\bload\b/i);
    expect(explainer()).toContain("how much you lifted and ran");
  });

  it("keeps the sentence that stops the score reading as a target", () => {
    // The half that was already right — a higher PI is not advice to
    // train harder, and removing that is how this becomes a leaderboard.
    expect(explainer()).toContain("not a recommendation to train harder");
  });
});

describe("the lead's explainer names the same windows", () => {
  it("states the 7 days against the usual week of the 4 before", () => {
    // "These", not "your last": a score kept from before a break names an
    // older window ("7 days to 2 Aug").
    expect(leadExplainer()).toContain(`These ${constant("WINDOW_DAYS")} days`);
    expect(leadExplainer()).toContain(
      `the weeks you trained in the ${constant("BASELINE_DAYS") / 7} before them`
    );
  });

  it("says which word means ease off, so no other reads as a target", () => {
    expect(leadExplainer()).toContain("Backing off means ease off.");
  });
});
