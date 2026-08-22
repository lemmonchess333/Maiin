import { describe, it, expect } from "vitest";
import { exerciseFromRoutine } from "../routineExercise";
import { TIMED_EXERCISE_IDS } from "../repUnits";
import type { SavedRoutineExercise } from "@/lib/savedRoutines";

/**
 * The routine projection, and the unit it used to drop.
 *
 * A saved routine snapshot has no `repUnit` — it carries `setCount /
 * targetReps / targetWeightKg` and nothing else — and `normalizeExercise`
 * only keeps the optional fields it is handed. So every routine exercise
 * arrived unitless, no matter which catalog exercise it named.
 *
 * That is not cosmetic. `WorkoutSession` reads `repUnit` for the entry
 * column heading ("Seconds" vs "Reps"), for the previous-performance
 * label, and for `isSetEligibleForStrengthPr`. A routine containing a
 * plank therefore prescribed "3 × 10" — ten REPS of a hold — and let one
 * set a weight×reps strength "PR". `repUnitsCatalogue.test.ts` describes
 * catching exactly that bug for `replaceExercise`; routines were a second
 * door into it that nothing was watching, because this function was
 * module-private inside a page component and no test could reach it.
 */
function routineEx(
  overrides: Partial<SavedRoutineExercise> & { name: string }
): SavedRoutineExercise {
  return {
    setCount: 3,
    targetReps: 10,
    targetWeightKg: 0,
    ...overrides,
  } as SavedRoutineExercise;
}

describe("exerciseFromRoutine — rep unit", () => {
  it("marks a timed hold as seconds", () => {
    const ex = exerciseFromRoutine(
      routineEx({
        name: "Plank",
        exerciseId: "plank",
        targetReps: 45,
      })
    );
    expect(ex.repUnit).toBe("seconds");
    // The prescription itself is untouched — 45 now READS as 45 seconds,
    // which is what the routine meant when it stored it.
    expect(ex.reps).toBe(45);
  });

  it("marks a LOADED timed hold as seconds, weight and all", () => {
    /* `weighted-plank` is the case that makes the tonnage rule matter
       downstream: with a unit, the writer knows 20 kg × 60 s is not
       1,200 kg lifted. */
    const ex = exerciseFromRoutine(
      routineEx({
        name: "Weighted Plank",
        exerciseId: "weighted-plank",
        targetReps: 60,
        targetWeightKg: 20,
      })
    );
    expect(ex.repUnit).toBe("seconds");
    expect(ex.weight).toBe(20);
  });

  it("leaves an ordinary lift unitless", () => {
    /* The field must stay ABSENT rather than become "reps": Firestore
       rejects undefined, and `normalizeExercise` uses a conditional
       spread precisely so the key does not appear. An over-eager version
       that stamped every exercise would put a hold's own marker on a
       bench press. */
    const ex = exerciseFromRoutine(
      routineEx({ name: "Bench Press", exerciseId: "bench-press" })
    );
    expect(ex.repUnit).toBeUndefined();
    expect("repUnit" in ex).toBe(false);
  });

  it("agrees with the timed set across every one of its members", () => {
    /* Ties the behaviour to the SET rather than restating four ids, so an
       exercise added to `TIMED_EXERCISE_IDS` later is covered here for
       free instead of silently escaping. */
    for (const id of TIMED_EXERCISE_IDS) {
      expect(
        exerciseFromRoutine(routineEx({ name: id, exerciseId: id })).repUnit,
        id
      ).toBe("seconds");
    }
  });

  it("stays unitless when the routine saved no exerciseId", () => {
    /* Pre-PR-4 routine payloads carry only `{ name, summary }`, so the id
       is synthesised from the name and is never a catalog id. Guessing a
       unit from a name would be a different feature, and a wrong guess
       here mis-prescribes the session. */
    const ex = exerciseFromRoutine(routineEx({ name: "Plank" }));
    expect(ex.exerciseId).toBe("routine-plank");
    expect(ex.repUnit).toBeUndefined();
  });
});

describe("exerciseFromRoutine — the rest of the projection", () => {
  it("keeps the saved prescription and floors the degenerate values", () => {
    /* Regression cover for the fields the extraction moved: this function
       had no test at all before it left the page. */
    const ex = exerciseFromRoutine(
      routineEx({
        name: "Barbell Row",
        exerciseId: "barbell-row",
        setCount: 4,
        targetReps: 8,
        targetWeightKg: 60,
      })
    );
    expect(ex.sets).toBe(4);
    expect(ex.reps).toBe(8);
    expect(ex.weight).toBe(60);
    // Seeded so the runner's "Prev" affordance has something to offer.
    expect(ex.lastAttemptedWeight).toBe(60);
    expect(ex.lastSuccessfulWeight).toBe(60);

    const degenerate = exerciseFromRoutine(
      routineEx({ name: "X", exerciseId: "x", setCount: 0, targetReps: 0 })
    );
    expect(degenerate.sets).toBe(1);
    expect(degenerate.reps).toBe(8);
  });

  it("infers a movement category from the name", () => {
    // Flows onto the workout doc and drives analytics + MuscleHeatMap.
    expect(
      exerciseFromRoutine(
        routineEx({ name: "Bench Press", exerciseId: "bench-press" })
      ).movementCategory
    ).toBeTruthy();
  });
});
