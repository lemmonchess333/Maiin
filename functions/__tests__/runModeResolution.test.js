/**
 * Run9 3b — functions/lib/runModeResolution.js contract tests.
 *
 * Mirrors src/features/program/__tests__/runModeResolution.test.ts so the JS
 * port and the TS source stay in lockstep (the materialization rule must
 * resolve identically on the client and in Cloud Functions).
 */
import { describe, it, expect } from "vitest";
import {
  deriveRunMode,
  isSameRace,
  raceGoalIsCompletedRace,
  resolveRecoveryExit,
  newRaceSupersedesRecovery,
  setRaceGoalPatch,
} from "../lib/runModeResolution";

const raceA = { distance: "10k", targetDate: "2026-08-01" };
const raceB = { distance: "half", targetDate: "2026-09-15" };

describe("deriveRunMode", () => {
  it("race_prep when a goal is present, freeform when null/undefined", () => {
    expect(deriveRunMode(raceA)).toBe("race_prep");
    expect(deriveRunMode(null)).toBe("freeform");
    expect(deriveRunMode(undefined)).toBe("freeform");
  });
});

describe("isSameRace", () => {
  it("matches on distance + targetDate, false on either mismatch or null", () => {
    expect(isSameRace(raceA, { ...raceA })).toBe(true);
    expect(isSameRace(raceA, { ...raceA, targetDate: "2026-08-02" })).toBe(false);
    expect(isSameRace(raceA, { ...raceA, distance: "5k" })).toBe(false);
    expect(isSameRace(raceA, null)).toBe(false);
    expect(isSameRace(null, raceA)).toBe(false);
  });
});

describe("resolveRecoveryExit", () => {
  it("completed race with no successor → freeform + clears raceGoal", () => {
    const patch = resolveRecoveryExit({
      currentRaceGoal: raceA,
      completedRaceGoal: { ...raceA },
    });
    expect(patch).toEqual({ raceGoal: null, runMode: "freeform" });
  });

  it("newer race set during recovery → keep it, materialize race_prep (no raceGoal in patch)", () => {
    const patch = resolveRecoveryExit({
      currentRaceGoal: raceB, // a different, newer race
      completedRaceGoal: raceA,
    });
    expect(patch).toEqual({ runMode: "race_prep" });
    expect("raceGoal" in patch).toBe(false); // raceGoal left untouched
  });

  it("no current raceGoal at all → freeform via deriveRunMode", () => {
    const patch = resolveRecoveryExit({
      currentRaceGoal: null,
      completedRaceGoal: raceA,
    });
    // Not the completed race (null !== raceA) → derive from current (null) →
    // freeform, raceGoal untouched.
    expect(patch).toEqual({ runMode: "freeform" });
  });

  it("raceGoalIsCompletedRace gates the branch", () => {
    expect(
      raceGoalIsCompletedRace({ currentRaceGoal: raceA, completedRaceGoal: raceA })
    ).toBe(true);
    expect(
      raceGoalIsCompletedRace({ currentRaceGoal: raceB, completedRaceGoal: raceA })
    ).toBe(false);
  });
});

describe("newRaceSupersedesRecovery", () => {
  const today = "2026-06-01";
  it("true when a new future race is set (different from the completed one)", () => {
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: raceB, completedRaceGoal: raceA },
        today
      )
    ).toBe(true);
  });
  it("false for the same race, no race, or a past new race", () => {
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: raceA, completedRaceGoal: raceA },
        today
      )
    ).toBe(false);
    expect(
      newRaceSupersedesRecovery(
        { currentRaceGoal: null, completedRaceGoal: raceA },
        today
      )
    ).toBe(false);
    expect(
      newRaceSupersedesRecovery(
        {
          currentRaceGoal: { distance: "5k", targetDate: "2026-05-01" },
          completedRaceGoal: raceA,
        },
        today
      )
    ).toBe(false);
  });
});

describe("setRaceGoalPatch", () => {
  it("co-writes runMode for set and clear", () => {
    expect(setRaceGoalPatch(raceA)).toEqual({
      raceGoal: raceA,
      runMode: "race_prep",
    });
    expect(setRaceGoalPatch(null)).toEqual({
      raceGoal: null,
      runMode: "freeform",
    });
  });
});
