import { describe, expect, it } from "vitest";
import { liftWeekLabel } from "../liftWeekLabel";
import { generateWeekPrescription } from "@/features/program/programEngine";
import { FOCUS_ORDER, focusLabel } from "@/features/program/trainingBlock";
import type { ActiveTrainingBlock } from "@/features/program/programTypes";

const today = "2026-09-06";
const state = {
  weekNumber: 2,
  currentPhase: "progression",
  primaryGoal: "strength" as const,
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
        today
      );
      expect(label).toBe(
        `Week ${((weekNumber - 1) % 4) + 1} of 4 · ${deload ? "Deload" : "Strength"}`
      );
    }
  );
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
