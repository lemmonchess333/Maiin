import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RunningBaselineSettings from "../RunningBaselineSettings";
import { getRaceGoalPlannerState } from "@/lib/raceGoalPlanner";
import { newRunnerUntil } from "@/features/program/newRunner";
import { generateSchedule } from "@/lib/scheduleUtils";
import { localDateString } from "@/lib/dateHelpers";
import type { RunningBaseline } from "@/features/program/runningBaseline";

// Reads the person's recent runs, which this section's copy doesn't.
vi.mock("../RecentRunningContext", () => ({ default: () => null }));

/* Run20 (5): a new runner's first weeks run as run-walk, which the starting
   point leaves as it is, so its promise that weekly time stays within the
   report was untrue for them (review of #2655). */
describe("the running starting point, for someone new to running", () => {
  const today = localDateString();
  const baseline: RunningBaseline = {
    version: 1,
    experience: "building",
    weeklyMinutes: 20,
    longestRunMinutes: 10,
    confirmedAt: today,
    source: "self_reported",
  };
  const preview = (until: string | null) =>
    getRaceGoalPlannerState({
      distance: "5k",
      targetDate: localDateString(
        new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
      ),
      currentDate: today,
      liftDays: 3,
      weeklyRunDays: 3,
      runningBaseline: baseline,
      newRunnerUntil: until,
      weekSchedule: generateSchedule(3, 3),
    });

  it("knows the plan's first week is run-walk", () => {
    expect(preview(newRunnerUntil("new", today)).runWalkWeeks).toBe(true);
    expect(preview(null).runWalkWeeks).toBe(false);
  });

  it("knows it from the six weeks, whatever this week still holds", () => {
    // A week with no runs left in it: a plan made from today (Run19) on
    // the week's last day, or a race week that holds only the race.
    const noRunsLeft = getRaceGoalPlannerState({
      distance: "5k",
      targetDate: localDateString(
        new Date(Date.now() + 70 * 24 * 60 * 60 * 1000)
      ),
      currentDate: today,
      liftDays: 3,
      weeklyRunDays: 0,
      runningBaseline: baseline,
      newRunnerUntil: newRunnerUntil("new", today),
      weekSchedule: generateSchedule(3, 0),
    });
    expect(noRunsLeft.firstWeekMinutes).toBe(0);
    expect(noRunsLeft.runWalkWeeks).toBe(true);
  });

  it("says run-walk doesn't follow the report", () => {
    render(
      <RunningBaselineSettings
        value={baseline}
        onChange={() => {}}
        preview={preview(newRunnerUntil("new", today))}
      />
    );
    expect(
      screen.getByText(/Your first weeks run as run-walk, whatever you report/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/won't increase on its own/)).toBeNull();
  });

  /* R5, R6: the starting point is where the plan starts, and the plan
     climbs from it; it no longer promises to stay there. */
  it("says the plan builds from the report, and never that it stays there", () => {
    render(
      <RunningBaselineSettings
        value={baseline}
        onChange={() => {}}
        preview={preview(null)}
      />
    );
    expect(
      screen.getByText(/The plan starts here and builds a step a week/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/won't increase on its own/)).toBeNull();
    expect(screen.queryByText(/run-walk/)).toBeNull();
  });
});
