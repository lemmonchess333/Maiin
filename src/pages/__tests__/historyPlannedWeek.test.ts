import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * App1's third settings fault: Analytics' planned bar read `daysPerWeek`,
 * the days asked for at setup and written once, so a plan changed later
 * (or a lighter week, or a run plan) never reached it. It now reads the
 * week Home and the finish screens count (`useWeekPulse` → `trainingWeek`).
 * The page renders through too many hooks for a unit render, so this pins
 * its source: the planned figure comes from the week, and the setup answer
 * is read nowhere on the page.
 */
const source = readFileSync(resolve(__dirname, "../History.tsx"), "utf8");

describe("Analytics' planned sessions this week", () => {
  it("come from the week the plan holds now", () => {
    expect(source).toContain("useWeekPulse()");
    expect(source).toMatch(/plannedThisWeek=\{plannedThisWeek\}/);
  });

  it("never from the days asked for at setup", () => {
    expect(source).not.toContain("daysPerWeek");
  });
});
