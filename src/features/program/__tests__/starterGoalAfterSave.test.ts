/**
 * The starter goal as a Run plan save leaves it, which the plan built by
 * that save reads its new-runner limits from. Leaving a running goal for a
 * race ends it at the stage reached; read from the goal still running, the
 * limits fell back to the sign-up date, so a runner leaving stage 3 got a
 * first race week of continuous runs instead of 3-minute run-walks, and
 * one not marked new got no new-runner limits at all that week.
 */
import { describe, expect, it } from "vitest";
import { starterGoalAfterSave } from "../runModeResolution";
import { profileNewRunnerUntil } from "../newRunner";
import { starterNewRunnerUntil } from "../starterPlan";

const TODAY = "2026-11-10";
const running = { startedOn: "2026-10-05" };

describe("starterGoalAfterSave", () => {
  it("ends a running goal left for a race or free running, at the stage reached", () => {
    for (const mode of ["race_prep", "freeform"] as const)
      expect(starterGoalAfterSave(running, mode, 3, TODAY)).toEqual({
        startedOn: "2026-10-05",
        endedOn: TODAY,
        stage: 3,
      });
  });

  it("leaves a goal kept, finished or ended as it is", () => {
    expect(starterGoalAfterSave(running, "starter", 3, TODAY)).toBe(running);
    const finished = { startedOn: "2026-08-01", finishedOn: "2026-10-01" };
    expect(starterGoalAfterSave(finished, "race_prep", 9, TODAY)).toBe(
      finished
    );
    expect(starterGoalAfterSave(undefined, "race_prep", 1, TODAY)).toBe(
      undefined
    );
  });

  it("gives the race plan the stage's new-runner weeks, not the sign-up date's", () => {
    // Signed up in August as a new runner, and the goal still running says
    // nothing of the stage.
    const profile = {
      runFrequency: "new" as const,
      onboardingCompletedAt: { toMillis: () => Date.UTC(2026, 7, 17, 12) },
      starterGoal: running,
    };
    // Six weeks from sign-up ended on 28 September: no limits this week.
    expect(profileNewRunnerUntil(profile)! < TODAY).toBe(true);
    const ending = {
      ...profile,
      starterGoal: starterGoalAfterSave(running, "race_prep", 3, TODAY),
    };
    expect(profileNewRunnerUntil(ending)).toBe(
      starterNewRunnerUntil(3, "2026-11-09")
    );
    expect(profileNewRunnerUntil(ending)! > TODAY).toBe(true);
  });
});
