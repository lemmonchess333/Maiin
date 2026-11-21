/**
 * With nothing to add load with (no equipment), a bodyweight lift's reps
 * climb past its range to 30, a rep a session, and nothing asks for load
 * (`NO_LOAD_MAX_REPS`). Anyone else's bodyweight lift stops at its range
 * and is told to add load, as before.
 */
import { describe, it, expect } from "vitest";
import { applyProgression, NO_LOAD_MAX_REPS } from "../programEngine";
import { sessionPrescription } from "../sessionCompletion";
import { normalizeExercise, type ProgramExercise } from "../programTypes";

const pushUps = (extra: Partial<ProgramExercise> = {}): ProgramExercise =>
  normalizeExercise({
    exerciseId: "push-ups",
    name: "Push-Ups",
    sets: 3,
    reps: 12,
    baseReps: 8,
    repRangeMax: 12,
    weight: 0,
    movementCategory: "horizontal_push",
    progressionType: "double",
    ...extra,
  });

const done = (ex: ProgramExercise, reps: number, noLoad: boolean) =>
  applyProgression(
    ex,
    reps,
    0,
    false,
    undefined,
    1,
    "2026-07-29",
    "kg",
    noLoad
  );

describe("a bodyweight lift with nothing to add load with", () => {
  it("climbs past the top of its range, a rep a session", () => {
    const next = done(pushUps(), 12, true);
    expect(next.reps).toBe(13);
    expect(next.notes).toBeUndefined();
    expect(done(pushUps({ reps: 20 }), 21, true).reps).toBe(22);
  });

  it("stops at 30, saying nothing", () => {
    expect(NO_LOAD_MAX_REPS).toBe(30);
    const top = done(pushUps({ reps: 30 }), 34, true);
    expect(top.reps).toBe(30);
    expect(top.notes).toBeUndefined();
  });

  it("climbs on a fixed target too", () => {
    const fixed = pushUps({
      reps: 15,
      baseReps: 8,
      repRangeMax: undefined,
      progressionType: "linear",
    });
    expect(done(fixed, 15, true).reps).toBe(16);
  });

  it("holds a plank at a minute, saying nothing", () => {
    const plank = normalizeExercise({
      exerciseId: "plank",
      name: "Plank",
      sets: 3,
      reps: 60,
      baseReps: 30,
      repRangeMax: 60,
      repUnit: "seconds",
      weight: 0,
      movementCategory: "core",
      progressionType: "double",
    });
    const held = done(plank, 60, true);
    expect(held.reps).toBe(60);
    expect(held.notes).toBeUndefined();
    // Under it, five seconds more, as any hold.
    expect(done({ ...plank, reps: 40 }, 40, true).reps).toBe(45);
  });
});

describe("anyone else's bodyweight lift", () => {
  it("stops at its range and is told to add load", () => {
    const top = done(pushUps(), 12, false);
    expect(top.reps).toBe(12);
    expect(top.notes).toMatch(/add load/);
  });
});

describe("a session's prescription", () => {
  const day = { dayName: "Upper A", exercises: [pushUps()] };

  it("says so when the person has no equipment, and only then", () => {
    expect(
      sessionPrescription(day, "s1", undefined, "no_equipment").bodyweightOnly
    ).toBe(true);
    for (const equipment of ["minimal", "home_gym", "full_gym", undefined])
      expect(
        sessionPrescription(day, "s1", undefined, equipment),
        String(equipment)
      ).not.toHaveProperty("bodyweightOnly");
  });
});
