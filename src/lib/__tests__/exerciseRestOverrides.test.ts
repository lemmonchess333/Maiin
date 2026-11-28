// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {} }));

import {
  formatRestChipLabel,
  readExerciseRestOverrides,
  writeExerciseRestOverride,
} from "../exerciseRestOverrides";
import { diffCompletedRoutine } from "../savedRoutines";

describe("exerciseRestOverrides", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists per-user per-exercise rest overrides and clears back to plan default", () => {
    expect(readExerciseRestOverrides("u1")).toEqual({});

    writeExerciseRestOverride("u1", "squat", 180);
    writeExerciseRestOverride("u1", "db-curl", 60);
    expect(readExerciseRestOverrides("u1")).toEqual({
      squat: 180,
      "db-curl": 60,
    });
    // Isolated per user
    expect(readExerciseRestOverrides("u2")).toEqual({});

    writeExerciseRestOverride("u1", "squat", null);
    expect(readExerciseRestOverrides("u1")).toEqual({ "db-curl": 60 });
  });

  it("formats compact rest labels cleanly", () => {
    expect(formatRestChipLabel(45)).toBe("45s");
    expect(formatRestChipLabel(75)).toBe("75s");
    expect(formatRestChipLabel(90)).toBe("1:30");
    expect(formatRestChipLabel(120)).toBe("2:00");
    expect(formatRestChipLabel(180)).toBe("3:00");
  });
});

describe("diffCompletedRoutine", () => {
  const saved = [
    {
      name: "Bench Press",
      exerciseId: "bench-press",
      summary: "3×8×60kg",
      setCount: 3,
      targetReps: 8,
      targetWeightKg: 60,
    },
  ];

  it("reports unchanged when completed working sets match the saved blueprint", () => {
    const res = diffCompletedRoutine(
      saved,
      [{ name: "Bench Press", exerciseId: "bench-press" }],
      [
        [
          { weight: 60, reps: 8, completed: true, type: "working" },
          { weight: 60, reps: 8, completed: true, type: "working" },
          { weight: 60, reps: 8, completed: true, type: "working" },
        ],
      ]
    );
    expect(res.changed).toBe(false);
  });

  it("reports changed with updated exercises when weights, reps, or exercise count change", () => {
    const res = diffCompletedRoutine(
      saved,
      [
        { name: "Bench Press", exerciseId: "bench-press" },
        { name: "Dumbbell Curl", exerciseId: "db-curl" },
      ],
      [
        [
          { weight: 62.5, reps: 8, completed: true, type: "working" },
          { weight: 62.5, reps: 8, completed: true, type: "working" },
          { weight: 62.5, reps: 8, completed: true, type: "working" },
        ],
        [
          { weight: 14, reps: 10, completed: true, type: "working" },
          { weight: 14, reps: 10, completed: true, type: "working" },
        ],
      ]
    );
    expect(res.changed).toBe(true);
    expect(res.updatedExercises).toHaveLength(2);
    expect(res.updatedExercises[0].targetWeightKg).toBe(62.5);
    expect(res.updatedExercises[1].exerciseId).toBe("db-curl");
    expect(res.summary).toContain("2 exercises");
  });
});
