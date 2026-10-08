import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { loadGridFor } from "@/features/program/loadSteps";
import type { ProgramExercise } from "@/features/program/programTypes";
import { unexplainedChange } from "@/test/sim/liftSeason";

/* The simulator's rules-sheet check has to bite: each change the sheet
   forbids is named, and each it allows passes. */

const bar = loadGridFor("squat", false);
const squat = (over: Partial<ProgramExercise>): ProgramExercise =>
  ({
    exerciseId: "squat",
    weight: 60,
    reps: 5,
    sets: 3,
    ...over,
  }) as ProgramExercise;

const check = (
  before: Partial<ProgramExercise>,
  after: Partial<ProgramExercise>,
  lifted: number,
  reps: number[],
  lighter: false | "a lighter week" | "an easier session" = false
) =>
  unexplainedChange(
    squat(before),
    squat({ ...before, ...after }),
    lifted,
    reps,
    lighter,
    bar
  );

describe("the simulator's rules-sheet check", () => {
  it("allows a step after every set hit its target", () => {
    expect(check({}, { weight: 62.5 }, 60, [5, 5, 5])).toBeNull();
  });

  it("names a step without every set at its target", () => {
    expect(check({}, { weight: 62.5 }, 60, [5, 3, 2])).toMatch(
      /rose without every set/
    );
  });

  it("names a lift lowered on its first miss", () => {
    expect(check({}, { weight: 55 }, 60, [5, 3, 2])).toMatch(
      /came down without a second miss/
    );
  });

  it("allows a lift lowered 10% on its second miss in a row", () => {
    expect(
      check({ consecutiveFailures: 1 }, { weight: 55 }, 60, [5, 3, 2])
    ).toBeNull();
  });

  it("allows the plan following a lighter weight lifted", () => {
    expect(check({}, { weight: 50 }, 50, [5, 5, 5])).toBeNull();
  });

  it("names a plan that ignores the weight lifted", () => {
    expect(check({}, {}, 50, [5, 5, 5])).toMatch(/didn't follow/);
  });

  it("names a lift lowered in a lighter week", () => {
    expect(check({}, { weight: 57.5 }, 60, [5, 5], "a lighter week")).toMatch(
      /lighter week/
    );
  });

  it("names reps that climb without every set at its target", () => {
    expect(check({ reps: 8, baseReps: 8 }, { reps: 9 }, 60, [8, 8, 6])).toMatch(
      /reps climbed/
    );
  });
});
