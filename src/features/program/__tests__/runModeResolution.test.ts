import { describe, it, expect } from "vitest";
import {
  deriveRunMode,
  isSameRace,
  raceGoalIsCompletedRace,
  resolveRecoveryExit,
  newRaceSupersedesRecovery,
  setRaceGoalPatch,
  type RaceGoal,
} from "../runModeResolution";

const MARATHON: RaceGoal = { distance: "marathon", targetDate: "2026-04-01" };
const HALF_FUTURE: RaceGoal = { distance: "half", targetDate: "2026-08-01" };

describe("deriveRunMode — materialization rule (Run9a)", () => {
  it("a race goal materializes race_prep", () => {
    expect(deriveRunMode(MARATHON)).toBe("race_prep");
  });
  it("no race goal materializes freeform", () => {
    expect(deriveRunMode(null)).toBe("freeform");
    expect(deriveRunMode(undefined)).toBe("freeform");
  });
});

describe("isSameRace", () => {
  it("matches on distance + targetDate", () => {
    expect(isSameRace(MARATHON, { ...MARATHON })).toBe(true);
  });
  it("differs on date or distance", () => {
    expect(isSameRace(MARATHON, { ...MARATHON, targetDate: "2026-04-08" })).toBe(false);
    expect(isSameRace(MARATHON, { ...MARATHON, distance: "half" })).toBe(false);
  });
  it("is false when either is missing", () => {
    expect(isSameRace(MARATHON, null)).toBe(false);
    expect(isSameRace(null, MARATHON)).toBe(false);
  });
});

describe("resolveRecoveryExit — R3-cycle + R3-backtoback", () => {
  it("clears raceGoal + goes freeform when raceGoal is still the completed race", () => {
    const patch = resolveRecoveryExit({
      currentRaceGoal: MARATHON,
      completedRaceGoal: MARATHON,
    });
    expect(patch.raceGoal).toBeNull();
    expect(patch.runMode).toBe("freeform");
  });

  it("PRESERVES a newer race set during recovery, stays race_prep (back-to-back)", () => {
    // User finished the marathon (in recovery) then set a future half.
    const patch = resolveRecoveryExit({
      currentRaceGoal: HALF_FUTURE,
      completedRaceGoal: MARATHON,
    });
    // raceGoal omitted = unchanged (the new half is NOT deleted).
    expect(patch.raceGoal).toBeUndefined();
    expect(patch.runMode).toBe("race_prep");
  });

  it("goes freeform when there is no current race goal at all", () => {
    const patch = resolveRecoveryExit({
      currentRaceGoal: null,
      completedRaceGoal: MARATHON,
    });
    expect(patch.runMode).toBe("freeform");
  });
});

describe("raceGoalIsCompletedRace", () => {
  it("true only when current === completed", () => {
    expect(
      raceGoalIsCompletedRace({ currentRaceGoal: MARATHON, completedRaceGoal: MARATHON })
    ).toBe(true);
    expect(
      raceGoalIsCompletedRace({ currentRaceGoal: HALF_FUTURE, completedRaceGoal: MARATHON })
    ).toBe(false);
  });
});

describe("newRaceSupersedesRecovery — back-to-back ends prior recovery", () => {
  const today = "2026-04-05"; // a few days after the marathon

  it("true when a new future race is set during recovery", () => {
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: HALF_FUTURE, completedRaceGoal: MARATHON },
        today
      )
    ).toBe(true);
  });

  it("false when the race goal is still the completed race", () => {
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: MARATHON, completedRaceGoal: MARATHON },
        today
      )
    ).toBe(false);
  });

  it("false when there is no race goal", () => {
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: null, completedRaceGoal: MARATHON },
        today
      )
    ).toBe(false);
  });

  it("false when the new race date is in the past (not a real future race)", () => {
    expect(
      newRaceSupersedesRecovery(
        {
          currentRaceGoal: { distance: "5k", targetDate: "2026-03-01" },
          completedRaceGoal: MARATHON,
        },
        today
      )
    ).toBe(false);
  });
});

describe("setRaceGoalPatch — co-writes materialized runMode", () => {
  it("setting a race writes raceGoal + race_prep", () => {
    expect(setRaceGoalPatch(HALF_FUTURE)).toEqual({
      raceGoal: HALF_FUTURE,
      runMode: "race_prep",
    });
  });
  it("clearing writes null + freeform", () => {
    expect(setRaceGoalPatch(null)).toEqual({ raceGoal: null, runMode: "freeform" });
  });
});
