import { describe, expect, it } from "vitest";
import type { UserProfile } from "@/lib/auth";
import type { ProgramState } from "../programTypes";
import {
  STARTER_GOAL_NAME,
  starterGoalReached,
  starterProgress,
} from "../starterProgress";
import { starterRunPlan } from "../starterWeek";

// Monday week keys; pure functions of the days given.
const LAST_WEEK = "2026-10-12";
const THIS_WEEK = "2026-10-19";
const plan = (stage: number, weekKey = THIS_WEEK) =>
  ({ runPlan: starterRunPlan(stage, weekKey) }) as Pick<
    ProgramState,
    "runPlan"
  >;
const goal = { startedOn: "2026-09-01" };

describe("starterProgress", () => {
  it("says the week in weeks of nine and the weeks to go, never a date", () => {
    const view = starterProgress(plan(3), goal, [])!;
    expect(view.weekLabel).toBe("Week 3 of 9");
    expect(view.toGoLabel).toBe("about 7 weeks to go");
    expect(starterProgress(plan(8), goal, [])!.toGoLabel).toBe(
      "about 2 weeks to go"
    );
    expect(starterProgress(plan(9), goal, [])!.toGoLabel).toBe("the last week");
  });

  it("counts this week's saved runs against the two that make it done", () => {
    const view = starterProgress(plan(3), goal, ["2026-10-20", "2026-10-18"])!;
    expect(view.runsThisWeek).toBe(1);
    expect(view.runsForTheWeek).toBe(2);
  });

  it("repeats when last week, inside the goal, was not done", () => {
    expect(starterProgress(plan(3), goal, ["2026-10-14"])!.repeated).toBe(true);
    expect(
      starterProgress(plan(3), goal, ["2026-10-13", "2026-10-15"])!.repeated
    ).toBe(false);
    // A goal begun this week has no week before it to repeat.
    expect(
      starterProgress(plan(1), { startedOn: "2026-10-20" }, [])!.repeated
    ).toBe(false);
  });

  it("is reached once the last stage's week is done", () => {
    expect(starterProgress(plan(9), goal, ["2026-10-20"])!.reached).toBe(false);
    expect(
      starterProgress(plan(9), goal, ["2026-10-20", "2026-10-22"])!.reached
    ).toBe(true);
    expect(
      starterProgress(plan(8), goal, ["2026-10-20", "2026-10-22"])!.reached
    ).toBe(false);
  });

  it("is nothing for a plan that is not the starter's", () => {
    expect(starterProgress(null, goal, [])).toBeNull();
    expect(
      starterProgress(
        { runPlan: { mode: "race_prep" } } as ProgramState,
        goal,
        []
      )
    ).toBeNull();
  });

  it("names the goal as setup and Train say it", () => {
    expect(STARTER_GOAL_NAME).toBe("30 minutes without stopping");
  });
});

describe("starterGoalReached", () => {
  const profile = (p: Partial<UserProfile>) =>
    p as Pick<UserProfile, "runMode" | "starterGoal">;

  it("is reached on the last week's second run, before the rollover writes it", () => {
    expect(
      starterGoalReached(
        profile({ runMode: "starter", starterGoal: goal }),
        plan(9),
        ["2026-10-20", "2026-10-21"]
      )
    ).toBe(true);
    expect(
      starterGoalReached(
        profile({ runMode: "starter", starterGoal: goal }),
        plan(9),
        ["2026-10-20"]
      )
    ).toBe(false);
  });

  it("is reached once finished, until a race goal takes over", () => {
    const finished = { ...goal, finishedOn: "2026-10-22" };
    expect(
      starterGoalReached(
        profile({ runMode: "freeform", starterGoal: finished }),
        null,
        []
      )
    ).toBe(true);
    expect(
      starterGoalReached(
        profile({ runMode: "race_prep", starterGoal: finished }),
        null,
        []
      )
    ).toBe(false);
  });

  it("is not reached for a goal ended by a race, or none", () => {
    expect(
      starterGoalReached(
        profile({
          runMode: "freeform",
          starterGoal: { ...goal, endedOn: "2026-10-01", stage: 4 },
        }),
        plan(9, LAST_WEEK),
        ["2026-10-13", "2026-10-14"]
      )
    ).toBe(false);
    expect(starterGoalReached(profile({ runMode: "freeform" }), null, [])).toBe(
      false
    );
  });
});
