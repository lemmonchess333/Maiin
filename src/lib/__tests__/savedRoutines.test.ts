import { describe, it, expect } from "vitest";
import { activityExercisesToRoutine } from "../savedRoutines";

describe("activityExercisesToRoutine", function () {
  it("maps the structured PR-4 payload through unchanged", function () {
    const result = activityExercisesToRoutine([
      {
        name: "Bench Press",
        exerciseId: "bench-press",
        summary: "4×6×7.5kg",
        setCount: 4,
        targetReps: 6,
        targetWeightKg: 7.5,
      },
      {
        name: "Overhead Press",
        exerciseId: "overhead-press",
        summary: "3×8×0kg",
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 0,
      },
    ]);
    expect(result).toEqual([
      {
        name: "Bench Press",
        exerciseId: "bench-press",
        summary: "4×6×7.5kg",
        setCount: 4,
        targetReps: 6,
        targetWeightKg: 7.5,
      },
      {
        name: "Overhead Press",
        exerciseId: "overhead-press",
        summary: "3×8×0kg",
        setCount: 3,
        targetReps: 8,
        targetWeightKg: 0,
      },
    ]);
  });

  it("falls back to zeros for missing structured fields on legacy payloads", function () {
    // Pre-PR-4 activities only had { name, summary }. The mapper must
    // still produce a valid SavedRoutineExercise so the routine saves;
    // PR 4.1 will treat zero-set entries as freeform.
    const result = activityExercisesToRoutine([
      { name: "Squat", summary: "5×5×100kg" },
    ]);
    expect(result).toEqual([
      {
        name: "Squat",
        summary: "5×5×100kg",
        setCount: 0,
        targetReps: 0,
        targetWeightKg: 0,
      },
    ]);
  });

  it("omits exerciseId when the source has none, rather than writing undefined", function () {
    // Prevents Firestore from rejecting docs that contain undefined
    // values (it requires explicit nulls or absent fields).
    const [first] = activityExercisesToRoutine([
      { name: "Mystery lift", summary: "3×10" },
    ]);
    expect(Object.prototype.hasOwnProperty.call(first, "exerciseId")).toBe(false);
  });

  it("returns an empty array when input is not an array", function () {
    expect(activityExercisesToRoutine(undefined)).toEqual([]);
    expect(activityExercisesToRoutine(null)).toEqual([]);
    expect(activityExercisesToRoutine("not-an-array")).toEqual([]);
    expect(activityExercisesToRoutine({ exercises: [] })).toEqual([]);
  });

  it("provides a name fallback when source is missing it", function () {
    const [first] = activityExercisesToRoutine([{ summary: "1×1×0kg" }]);
    expect(first.name).toBe("Exercise");
  });
});
