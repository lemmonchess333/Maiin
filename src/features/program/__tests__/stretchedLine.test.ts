/**
 * The stretched line (Pgm7 A3, kept by Pgm8 L11). When the next weight is
 * too big a step to take on its own (Lift4 (6)), a lift's target climbs past
 * its range instead. The session where it first does so, at that weight,
 * leaves a record (`stretched`) for one line on the next session ("Up to 19
 * reps on 10 kg: 12.5 kg is a big jump"), and that session's finish clears
 * it, as the lowered line's does.
 *
 * Independent literals: dumbbells go from 10 kg to 12.5 kg (25%) and from
 * 12.5 kg to 15 kg (20%). On Nuzzo 2024's means (`stretchedRepCeiling`),
 * 12 reps at 12.5 kg is the effort of 19 at 10 kg, 8 reps of 16, and 12 reps
 * at 15 kg of 17 at 12.5 kg.
 */
import { describe, it, expect } from "vitest";
import { applyProgression } from "@/features/program/programEngine";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import { migrateProgramState } from "@/features/program/migrations";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  normalizeProgramState,
  stretchOf,
} from "@/features/program/programTypes";
import type {
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import type { LoggedSet } from "@/features/program/workoutSetRecord";

/** Lateral raises on 10 kg dumbbells, at the top of a 12–15 range. */
function raise(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    name: "Lateral Raise",
    exerciseId: "lateral-raise",
    instanceId: "i-raise",
    movementCategory: "vertical_push",
    sets: 3,
    reps: 15,
    baseReps: 12,
    repRangeMax: 15,
    weight: 10,
    progressionType: "double",
    isAccessory: true,
    lastSuccessfulWeight: 10,
    lastAttemptedWeight: 10,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

const STRETCHED = {
  exerciseId: "lateral-raise",
  weight: 10,
  next: 12.5,
  ceiling: 19,
};

/** Dumbbell bench on 10 kg: `progression` and a target of 8. */
function dbBench(
  progressionType: ProgramExercise["progressionType"]
): ProgramExercise {
  return raise({
    name: "Dumbbell Bench Press",
    exerciseId: "db-bench",
    movementCategory: "horizontal_push",
    isAccessory: false,
    progressionType,
    reps: 8,
    baseReps: 8,
    repRangeMax: undefined,
  });
}

describe("the session a target first climbs past its range records it", () => {
  it("at a range's top on 10 kg dumbbells: a rep past it, and the record", () => {
    const out = applyProgression(raise(), 15, 10, false);
    expect(out.weight).toBe(10);
    expect(out.reps).toBe(16);
    expect(out.stretched).toEqual(STRETCHED);
  });

  it("from inside the range too, when every set reached past its top", () => {
    const out = applyProgression(raise({ reps: 13 }), 15, 10, false);
    expect(out.reps).toBe(16);
    expect(out.stretched).toEqual(STRETCHED);
  });

  it("not again while the target climbs on to the ceiling", () => {
    const out = applyProgression(raise({ reps: 16 }), 16, 10, false);
    expect(out.reps).toBe(17);
    expect(out.stretched).toBeUndefined();
  });

  it("a fixed target that can't step climbs past itself, and says so once", () => {
    const first = applyProgression(dbBench("linear"), 8, 10, false);
    expect(first.reps).toBe(9);
    expect(first.stretched).toEqual({
      exerciseId: "db-bench",
      weight: 10,
      next: 12.5,
      ceiling: 16,
    });
    const { stretched: _shown, ...after } = first;
    expect(applyProgression(after, 9, 10, false).stretched).toBeUndefined();
  });

  it("a range-less double, past the top its target climbs to", () => {
    // No authored range: the climb tops out two past the target, 8 to 10.
    const out = applyProgression(dbBench("double"), 10, 10, false);
    expect(out.reps).toBe(11);
    expect(out.stretched).toEqual({
      exerciseId: "db-bench",
      weight: 10,
      next: 12.5,
      ceiling: 16,
    });
  });

  it("again at a new weight, the first time past the top there", () => {
    // Every set at the stretched target, on 12.5 kg: the plan follows it.
    const out = applyProgression(raise({ reps: 16 }), 16, 12.5, false);
    expect(out.weight).toBe(12.5);
    expect(out.reps).toBe(17);
    expect(out.stretched).toEqual({
      exerciseId: "lateral-raise",
      weight: 12.5,
      next: 15,
      ceiling: 17,
    });
  });

  it("not where the plan takes the step itself", () => {
    // 8 kg to 9 kg is 12.5%.
    const out = applyProgression(
      raise({ weight: 8, lastSuccessfulWeight: 8 }),
      15,
      8,
      false
    );
    expect(out.weight).toBe(9);
    expect(out.stretched).toBeUndefined();
  });

  it("not where the target stays inside its range", () => {
    // 15 kg to 17.5 kg on a stack is 17%: 10 reps there is the effort of 15
    // here, the range's own top, so the target waits at 15.
    const pulldown = raise({
      name: "Lat Pulldown",
      exerciseId: "lat-pulldown",
      movementCategory: "vertical_pull",
      reps: 15,
      baseReps: 10,
      repRangeMax: 15,
      weight: 15,
      lastSuccessfulWeight: 15,
    });
    const out = applyProgression(pulldown, 15, 15, false);
    expect(out.weight).toBe(15);
    expect(out.reps).toBe(15);
    expect(out.stretched).toBeUndefined();
  });

  it("not for a bodyweight lift, whose top asks for load instead", () => {
    const pullUps = raise({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      isAccessory: false,
      reps: 12,
      baseReps: 8,
      repRangeMax: 12,
      weight: 0,
      lastSuccessfulWeight: 0,
    });
    const out = applyProgression(pullUps, 12, 0, false);
    expect(out.reps).toBe(12);
    expect(out.notes).toMatch(/add load/);
    expect(out.stretched).toBeUndefined();
  });
});

/* ─── At the finish: applySessionProgression ───────────────────────────── */

function stateWith(ex: ProgramExercise): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 3,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 1,
    settings: { autoProgression: true, smallPlates: false },
    workouts: [
      {
        dayName: "Upper",
        dayType: "upper",
        completed: false,
        exercises: [ex],
      },
    ],
  } as ProgramState;
}

function finishState(
  state: ProgramState,
  sets: Array<Pick<LoggedSet, "weight" | "reps">>,
  sessionVariant?: "easier_today"
): ProgramState {
  const ex = state.workouts[0].exercises[0];
  return applySessionProgression(state, 0, {
    completionId: "session-1",
    date: "2026-10-05",
    prescription: { exercises: [ex], progressionBaseline: [ex] },
    setLogs: [
      sets.map((set) => ({ ...set, completed: true, type: "working" })),
    ],
    ...(sessionVariant ? { sessionVariant } : {}),
  });
}

function finish(
  state: ProgramState,
  sets: Array<Pick<LoggedSet, "weight" | "reps">>,
  sessionVariant?: "easier_today"
): ProgramExercise {
  return finishState(state, sets, sessionVariant).workouts[0].exercises[0];
}

const three = (weight: number, reps: number) =>
  Array.from({ length: 3 }, () => ({ weight, reps }));

describe("the line lasts one session (Pgm7 A3)", () => {
  const stretched = raise({ reps: 16, stretched: STRETCHED });

  it("the finish where the target first climbs past the top leaves it", () => {
    const out = finish(stateWith(raise()), three(10, 15));
    expect(out.reps).toBe(16);
    expect(out.stretched).toEqual(STRETCHED);
  });

  it("the next session's finish says it, and the climb goes on", () => {
    const out = finish(stateWith(stretched), three(10, 16));
    expect(out.reps).toBe(17);
    expect(out.stretched).toBeUndefined();
  });

  it("so does an easier session's, which moves nothing else", () => {
    const out = finish(stateWith(stretched), three(8, 16), "easier_today");
    expect(out.weight).toBe(10);
    expect(out.reps).toBe(16);
    expect(out.stretched).toBeUndefined();
  });

  it("and one where the heavier pair was picked up, which the plan follows", () => {
    const out = finish(stateWith(stretched), three(12.5, 11));
    expect(out.weight).toBe(12.5);
    expect(out.reps).toBe(12);
    expect(out.stretched).toBeUndefined();
  });

  it("with auto-progression off, the finish still says it", () => {
    const out = finish(
      {
        ...stateWith(stretched),
        settings: { autoProgression: false, smallPlates: false },
      },
      three(10, 16)
    );
    expect(out.stretched).toBeUndefined();
  });

  it("stays while the lift waits to be done", () => {
    const next = applySessionProgression(stateWith(stretched), 0, {
      completionId: "session-1",
      date: "2026-10-05",
      prescription: { exercises: [], progressionBaseline: [] },
      setLogs: [],
    });
    expect(next.workouts[0].exercises[0].stretched).toEqual(STRETCHED);
  });

  it("a record a swap left behind goes at the next finish", () => {
    const swapped = raise({
      name: "Cable Lateral Raise",
      exerciseId: "cable-lateral-raise",
      stretched: STRETCHED,
    });
    expect(stretchOf(swapped)).toBeUndefined();
    expect(finish(stateWith(swapped), three(10, 12)).stretched).toBeUndefined();
  });

  it("survives the next load until then", () => {
    const next = finishState(stateWith(raise()), three(10, 15));
    const stored = {
      ...next,
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
    };
    const loaded = migrateProgramState(
      normalizeProgramState(stored, { primaryGoal: "hypertrophy" }),
      "2026-10-05"
    ).workouts[0].exercises[0];
    expect(loaded.stretched).toEqual(STRETCHED);
    expect(stretchOf(loaded)).toEqual(STRETCHED);
  });
});
