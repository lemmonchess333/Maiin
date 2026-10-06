import { describe, expect, it } from "vitest";
import { liftWeekLabel } from "../liftWeekLabel";
import { generateWeekPrescription } from "@/features/program/weekPrescription";
import { FOCUS_ORDER, focusLabel } from "@/features/program/trainingBlock";
import type {
  ActiveTrainingBlock,
  WorkoutDay,
} from "@/features/program/programTypes";

const today = "2026-09-06";
/** Three lift days: with an intermediate's level, a plan the calendar
 *  gives lighter weeks, so it counts a cycle of four. */
const threeDays = [{}, {}, {}] as WorkoutDay[];
const state = {
  weekNumber: 2,
  currentPhase: "progression",
  primaryGoal: "strength" as const,
  workouts: threeDays,
};
const block: ActiveTrainingBlock = {
  id: "test",
  owned: true,
  focus: "strength",
  pace: "full",
  durationWeeks: 8,
  startDate: "2026-08-30",
  goalBefore: "general",
  amnestyWeeksLeft: 1,
  weeklyLiftTarget: 4,
  anchorExerciseIds: [],
  why: "",
  createdAt: 1,
  schemaVersion: 1,
};

describe("the lift week label derives from programme facts", () => {
  it.each([undefined, null])(
    "omits missing programme context (%s)",
    (value) => {
      expect(liftWeekLabel(value, today)).toBeNull();
    }
  );
  it.each([0, -1, NaN, Infinity, 1.5])(
    "omits invalid week %s",
    (weekNumber) => {
      expect(liftWeekLabel({ ...state, weekNumber }, today)).toBeNull();
    }
  );
  it.each([1, 2, 3, 4, 5, 7, 8, 51, 52])(
    "agrees with the engine's cycle at week %s",
    (weekNumber) => {
      const deload = generateWeekPrescription(weekNumber).deload;
      const label = liftWeekLabel(
        {
          ...state,
          weekNumber,
          currentPhase: deload ? "deload" : "progression",
        },
        today,
        "intermediate"
      );
      expect(label).toBe(
        `Week ${((weekNumber - 1) % 4) + 1} of 4 · ${deload ? "Lighter week" : "Get stronger"}`
      );
    }
  );
  /* One setting, one name on Train. The plain cycle named the focus
     "Hypertrophy" and a block named it "Build muscle", so starting a block
     appeared to rename the setting, and the block picker beside the row
     offered "Build muscle" for what the row called "Hypertrophy". */
  for (const focus of FOCUS_ORDER) {
    it(`names the ${focus} focus as Settings and a block do`, () => {
      expect(
        liftWeekLabel({ ...state, primaryGoal: focus }, today, "intermediate")
      ).toBe(`Week 2 of 4 · ${focusLabel(focus)}`);
    });
  }
  it("names a programme with no stored focus as the general one", () => {
    expect(
      liftWeekLabel({ weekNumber: 1, currentPhase: "progression" }, today)
    ).toBe(`Week 1 · ${focusLabel("general")}`);
  });
  /* Lift4 (9): a cycle of four is counted only where the calendar gives
     lighter weeks. Without them the counter would point at a week that
     never comes. */
  it.each([
    ["a beginner", "beginner" as const, threeDays],
    ["an unknown level", undefined, threeDays],
    ["a two-day plan", "advanced" as const, threeDays.slice(0, 2)],
  ])("counts the weeks without a cycle for %s", (_who, level, workouts) => {
    expect(
      liftWeekLabel({ ...state, weekNumber: 7, workouts }, today, level)
    ).toBe("Week 7 · Get stronger");
  });
  it("names a lighter week the person took, with or without a cycle", () => {
    const lighter = { ...state, weekNumber: 6, currentPhase: "deload" };
    expect(liftWeekLabel(lighter, today, "intermediate")).toBe(
      "Week 2 of 4 · Lighter week"
    );
    expect(liftWeekLabel(lighter, today, "beginner")).toBe(
      "Week 6 · Lighter week"
    );
  });
  for (const focus of FOCUS_ORDER) {
    it(`names a ${focus} block's week and focus`, () => {
      expect(
        liftWeekLabel({ ...state, trainingBlock: { ...block, focus } }, today)
      ).toBe(`Week 2 of 8 · ${focusLabel(focus)}`);
    });
  }
  it("does not use a future or finished block for today's label", () => {
    for (const day of ["2026-08-29", "2026-10-25"]) {
      expect(liftWeekLabel({ ...state, trainingBlock: block }, day)).toBe(
        liftWeekLabel(state, day)
      );
    }
  });
});
