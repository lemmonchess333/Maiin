import { describe, it, expect } from "vitest";
import {
  activityExercisesToRoutine,
  isExternalRoutineSource,
  redactExternalRoutineExercises,
} from "../savedRoutines";

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
    expect(Object.prototype.hasOwnProperty.call(first, "exerciseId")).toBe(
      false
    );
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

/**
 * Structure-only external saves — the ROUTINE-EXCHANGE privacy contract:
 * "routine blueprint with personal working weights hidden by default".
 * Saving another member's workout must never carry their working loads
 * into the recipient's copy; saving your own keeps your own. Applied at
 * write AND read (legacy adapter), both through this pure helper.
 */
describe("redactExternalRoutineExercises", function () {
  const ME = "uid-me";
  const THEM = "uid-them";

  const structured = {
    name: "Bench Press",
    exerciseId: "bench-press",
    summary: "4×6×80kg",
    setCount: 4,
    targetReps: 6,
    targetWeightKg: 80,
  };

  it("blanks weights and weight-bearing summaries on an external source", function () {
    const [ex] = redactExternalRoutineExercises(ME, THEM, [structured]);
    expect(ex.targetWeightKg).toBe(0);
    expect(ex.summary).toBe("4×6");
    // Structure survives untouched.
    expect(ex.setCount).toBe(4);
    expect(ex.targetReps).toBe(6);
    expect(ex.exerciseId).toBe("bench-press");
  });

  it("keeps my own loads when the source is my own workout", function () {
    const [ex] = redactExternalRoutineExercises(ME, ME, [structured]);
    expect(ex.targetWeightKg).toBe(80);
    expect(ex.summary).toBe("4×6×80kg");
  });

  it("strips the weight token from legacy freeform summaries (no structured fields)", function () {
    const [ex] = redactExternalRoutineExercises(ME, THEM, [
      {
        name: "Squat",
        summary: "5×5×100kg",
        setCount: 0,
        targetReps: 0,
        targetWeightKg: 0,
      },
    ]);
    expect(ex.summary).toBe("5×5");
    expect(ex.summary).not.toMatch(/kg/i);
  });

  it("passes cue-carrying weightless summaries through untouched (blueprints)", function () {
    // Blueprint summaries like "3×1 (45s holds)" have no kg token — a
    // rebuild would destroy the cue. Redaction must leave them alone.
    const [ex] = redactExternalRoutineExercises("uid-me", "tropos", [
      {
        name: "Plank",
        exerciseId: "plank",
        summary: "3×1 (45s holds)",
        setCount: 3,
        targetReps: 1,
        targetWeightKg: 0,
      },
    ]);
    expect(ex.summary).toBe("3×1 (45s holds)");
    expect(ex.targetWeightKg).toBe(0);
  });

  it("decimal weights are stripped too", function () {
    const [ex] = redactExternalRoutineExercises(ME, THEM, [
      { ...structured, summary: "4×6×7.5kg", targetWeightKg: 7.5 },
    ]);
    expect(ex.targetWeightKg).toBe(0);
    expect(ex.summary).toBe("4×6");
  });

  it("no redaction when sourceAuthorId is absent (pre-contract legacy self docs)", function () {
    const [ex] = redactExternalRoutineExercises(ME, undefined, [structured]);
    expect(ex.targetWeightKg).toBe(80);
  });
});

describe("isExternalRoutineSource", function () {
  it("external only when a source author exists and isn't the owner", function () {
    expect(isExternalRoutineSource("me", "them")).toBe(true);
    expect(isExternalRoutineSource("me", "tropos")).toBe(true);
    expect(isExternalRoutineSource("me", "me")).toBe(false);
    expect(isExternalRoutineSource("me", undefined)).toBe(false);
    expect(isExternalRoutineSource("me", "")).toBe(false);
  });
});
