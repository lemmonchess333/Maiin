import { describe, it, expect } from "vitest";
import { migrateRunStateToRun9 } from "../run9Migration";
import type { RaceGoal } from "../runModeResolution";

const RACE: RaceGoal = { distance: "half", targetDate: "2026-09-01" };

describe("migrateRunStateToRun9", () => {
  it("structured (no race) → freeform + WIPES orphaned runDays + clears runPlan", () => {
    const r = migrateRunStateToRun9(
      { runMode: "structured", raceGoal: null },
      { runPlan: { mode: "structured" }, runDays: [{ id: "a" }, { id: "b" }] }
    );
    expect(r.profilePatch).toEqual({ runMode: "freeform", raceGoal: null });
    expect(r.programStatePatch.runPlan).toBeNull();
    expect(r.programStatePatch.runDays).toEqual([]);
    expect(r.noop).toBe(false);
  });

  it("race_prep with future race → keeps the overlay, mirror re-derived", () => {
    const r = migrateRunStateToRun9(
      { runMode: "race_prep", raceGoal: RACE },
      { runPlan: { mode: "race_prep", raceGoal: RACE }, runDays: [{ id: "x" }] }
    );
    expect(r.profilePatch).toEqual({ runMode: "race_prep", raceGoal: RACE });
    expect(r.programStatePatch.runPlan?.raceGoal).toEqual(RACE);
    expect(r.programStatePatch.runPlan?.mode).toBe("race_prep");
    // runDays NOT wiped for a race overlay
    expect(r.programStatePatch.runDays).toBeUndefined();
    expect(r.noop).toBe(true); // already Run9-consistent
  });

  it("backfills profile.raceGoal from the runPlan mirror when profile's is missing", () => {
    const r = migrateRunStateToRun9(
      { runMode: "race_prep", raceGoal: null }, // profile copy lost
      { runPlan: { mode: "race_prep", raceGoal: RACE }, runDays: [{ id: "x" }] }
    );
    expect(r.profilePatch.raceGoal).toEqual(RACE);
    expect(r.profilePatch.runMode).toBe("race_prep");
    expect(r.noop).toBe(false); // had to backfill → a write is needed
  });

  it("preserves recovery sub-state on the runPlan when a race exists", () => {
    const r = migrateRunStateToRun9(
      { runMode: "race_prep", raceGoal: RACE },
      {
        runPlan: {
          mode: "race_prep",
          raceGoal: RACE,
          phase: "recovery",
          recoveryEndDate: "2026-09-15",
          completedRaces: ["runday_x"],
        },
        runDays: [],
      }
    );
    expect(r.programStatePatch.runPlan?.phase).toBe("recovery");
    expect(r.programStatePatch.runPlan?.recoveryEndDate).toBe("2026-09-15");
    expect(r.programStatePatch.runPlan?.completedRaces).toEqual(["runday_x"]);
  });

  it("already-freeform user is a no-op", () => {
    const r = migrateRunStateToRun9(
      { runMode: "freeform", raceGoal: null },
      { runPlan: null, runDays: [] }
    );
    expect(r.profilePatch).toEqual({ runMode: "freeform", raceGoal: null });
    expect(r.noop).toBe(true);
  });

  it("legacy profile with no runMode at all and no race → freeform no-op", () => {
    const r = migrateRunStateToRun9({}, {});
    expect(r.profilePatch.runMode).toBe("freeform");
    expect(r.noop).toBe(true);
  });

  it("past-dated race goal stays race_prep (runtime no-show/recovery owns the past case)", () => {
    const past: RaceGoal = { distance: "10k", targetDate: "2020-01-01" };
    const r = migrateRunStateToRun9(
      { runMode: "race_prep", raceGoal: past },
      { runPlan: { mode: "race_prep", raceGoal: past } }
    );
    expect(r.profilePatch.runMode).toBe("race_prep");
    expect(r.profilePatch.raceGoal).toEqual(past);
  });
});
