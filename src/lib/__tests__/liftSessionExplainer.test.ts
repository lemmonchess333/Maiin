import { describe, expect, it } from "vitest";
import { liftSessionExplainer, liftWeekLabel } from "../liftSessionExplainer";
import { generateWeekPrescription } from "@/features/program/programEngine";
import { FOCUS_ORDER, focusLabel } from "@/features/program/trainingBlock";
import type {
  ActiveTrainingBlock,
  BlockPace,
} from "@/features/program/programTypes";

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

describe("session purpose derives from programme facts", () => {
  it.each([undefined, null])(
    "omits missing programme context (%s)",
    (value) => {
      expect(liftSessionExplainer(value, today)).toBeNull();
      expect(liftWeekLabel(value, today)).toBeNull();
    }
  );
  it.each([0, -1, NaN, Infinity, 1.5])(
    "omits invalid week %s",
    (weekNumber) => {
      expect(liftSessionExplainer({ ...state, weekNumber }, today)).toBeNull();
    }
  );
  it.each([1, 2, 3, 4, 5, 7, 8, 51, 52])(
    "agrees with engine at week %s",
    (weekNumber) => {
      const deload = generateWeekPrescription(weekNumber).deload;
      const context = {
        ...state,
        weekNumber,
        currentPhase: deload ? "deload" : "progression",
      };
      const line = liftSessionExplainer(context, today)!;
      expect(line.length).toBeLessThanOrEqual(90);
      expect(line.startsWith("Step-back")).toBe(deload);
      if (!deload) {
        expect(line.includes("last build week")).toBe(
          generateWeekPrescription(weekNumber + 1).deload
        );
        expect(liftWeekLabel(context, today)).toContain(
          `Week ${((weekNumber - 1) % 4) + 1} of 4`
        );
      }
    }
  );
  it("manual deload takes precedence over a block or build week", () => {
    expect(
      liftSessionExplainer(
        { ...state, currentPhase: "deload", trainingBlock: block },
        today
      )
    ).toMatch(/^Step-back/);
  });
  it.each(["easier_today", "express30", "express45"] as const)(
    "names the chosen %s variant",
    (variant) => {
      const line = liftSessionExplainer(state, today, variant)!;
      expect(line).toMatch(
        variant === "easier_today" ? /^Easier today/ : /^Shorter today/
      );
      expect(line.length).toBeLessThanOrEqual(90);
      expect(liftSessionExplainer(null, today, variant)).toBeNull();
    }
  );
  it("only describes double progression when every supplied exercise uses it", () => {
    expect(
      liftSessionExplainer(state, today, "full", ["double", "double"])
    ).toContain("reps build");
    expect(
      liftSessionExplainer(state, today, "full", ["double", "linear"])
    ).not.toContain("reps build");
  });
  for (const focus of FOCUS_ORDER) {
    for (const pace of ["full", "lighter", "easing"] as BlockPace[]) {
      it(`${focus} / ${pace} names only the owned block's current behaviour`, () => {
        const context = { ...state, trainingBlock: { ...block, focus, pace } };
        const line = liftSessionExplainer(context, today)!;
        expect(line).toContain(focusLabel(focus));
        expect(line.length).toBeLessThanOrEqual(90);
        expect(line.includes("loads hold")).toBe(pace === "easing");
        expect(liftWeekLabel(context, today)).toBe(
          `Week 2 of 8 · ${focusLabel(focus)}`
        );
      });
    }
  }
  it("does not claim a legacy block owns the prescription", () => {
    expect(
      liftSessionExplainer(
        { ...state, trainingBlock: { ...block, owned: false, pace: "easing" } },
        today
      )
    ).not.toMatch(/loads hold|follow this focus/);
  });
  it("stops claiming an easing hold after the existing two-week policy", () => {
    expect(
      liftSessionExplainer(
        { ...state, trainingBlock: { ...block, pace: "easing" } },
        "2026-09-13"
      )
    ).not.toContain("loads hold");
  });
  it("does not use a future or finished block to explain today's prescription", () => {
    for (const day of ["2026-08-29", "2026-10-25"]) {
      expect(
        liftSessionExplainer({ ...state, trainingBlock: block }, day)
      ).toBe(liftSessionExplainer(state, day));
      expect(liftWeekLabel({ ...state, trainingBlock: block }, day)).toBe(
        liftWeekLabel(state, day)
      );
    }
  });
});
