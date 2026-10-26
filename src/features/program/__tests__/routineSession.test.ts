/**
 * A saved routine's session, as its page runs it and as the readers that
 * offer an unfinished one back recognise its draft. The page's own draft
 * is matched against these in `WorkoutSessionDraftRecovery.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import {
  draftRoutineId,
  routineDraftIdentity,
  routineDraftScope,
  type RoutineLayout,
} from "../routineSession";
import { computeDraftIdentity } from "@/hooks/useWorkoutDraft";

const ARMS: RoutineLayout = {
  id: "r1",
  name: "Arms",
  exercises: [
    {
      name: "Barbell Curl",
      exerciseId: "barbell-curl",
      summary: "3×10",
      setCount: 3,
      targetReps: 10,
      targetWeightKg: 30,
    },
    {
      name: "Rope Pushdown",
      summary: "3×12",
      setCount: 3,
      targetReps: 12,
      targetWeightKg: 0,
    },
  ],
};

describe("routineSession", () => {
  it("names the routine a draft was kept from, and none for a programme day's", () => {
    expect(draftRoutineId({ identity: routineDraftIdentity(ARMS) })).toBe("r1");
    expect(
      draftRoutineId({
        identity: computeDraftIdentity({
          scope: "programme",
          epoch: 3,
          dayIndex: 0,
          dayName: "Push",
          layout: [{ id: "bench-press", sets: 3 }],
        }),
      })
    ).toBeNull();
    // Only a name a routine's document could have: nothing to look up
    // otherwise.
    for (const identity of [
      "v1|routine:|e0|d-1|Arms|",
      "v1|routine:a/b|e0|d-1|Arms|",
      "v1|routine:..|e0|d-1|Arms|",
      "v2|routine:r1|e0|d-1|Arms|",
      "routine:r1",
    ])
      expect(draftRoutineId({ identity })).toBeNull();
  });

  it("gives each routine its own scope", () => {
    expect(routineDraftScope("r1")).not.toBe(routineDraftScope("r2"));
    expect(routineDraftIdentity({ ...ARMS, id: "r2" })).not.toBe(
      routineDraftIdentity(ARMS)
    );
  });

  it("changes when the routine is renamed, or an exercise or a set count is", () => {
    const kept = routineDraftIdentity(ARMS);
    const [curl, pushdown] = ARMS.exercises;
    for (const edited of [
      { ...ARMS, name: "Arms day" },
      { ...ARMS, exercises: [curl] },
      { ...ARMS, exercises: [pushdown, curl] },
      { ...ARMS, exercises: [{ ...curl, setCount: 4 }, pushdown] },
      {
        ...ARMS,
        exercises: [{ ...curl, exerciseId: "ez-bar-curl" }, pushdown],
      },
    ])
      expect(routineDraftIdentity(edited)).not.toBe(kept);
    // The loads and reps the session starts from are not its layout: the
    // sets kept still fit it.
    expect(
      routineDraftIdentity({
        ...ARMS,
        exercises: [{ ...curl, targetWeightKg: 35, targetReps: 8 }, pushdown],
      })
    ).toBe(kept);
  });
});
