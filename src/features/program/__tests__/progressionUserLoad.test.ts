/**
 * The plan follows the load lifted (owner, 2026-10-05). It reverses Lift2,
 * under which a lighter session HELD the prescription and a heavier one
 * re-anchored it at most four load steps up, so a lifter seeded at 57.5 kg
 * who benched 82.5 kg × 6 four sessions running saw the plan go
 * 57.5 → 57.5 → 57.5 → 54.5.
 *
 * Independent literals for the engine's rules:
 *   - a loaded lift's prescription moves to the weight lifted, heavier or
 *     lighter, by any margin; success is the target reps at that weight,
 *     and every step runs from it on its equipment's grid, never more than
 *     about 15% of it on its own (Lift4 (6));
 *   - reps missed still move it there and count the miss; the second miss
 *     in a row lowers a loaded lift 10% with its target as it was (Lift4
 *     (7); `sessionSets.test.ts` has the climb back), and a bodyweight one
 *     a rep, or a hold five seconds;
 *   - no load logged holds; bodyweight and uncalibrated lifts are as they
 *     were;
 *   - at the finish (`applySessionProgression`), auto-progression off moves
 *     the prescription to the load lifted with no step and no success or
 *     failure accounting, a held week keeps it, and an easier session can
 *     only raise it;
 *   - the next app load (`migrateProgramState`) keeps a plan these lowered.
 */
import { describe, it, expect } from "vitest";
import { applyProgression, liftedLoad } from "@/features/program/programEngine";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import { migrateProgramState } from "@/features/program/migrations";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  normalizeProgramState,
} from "@/features/program/programTypes";
import type {
  ActiveTrainingBlock,
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import type { LoggedSet } from "@/features/program/workoutSetRecord";

/** Bench, 3 × 6 on double progression. With no authored range the climb
 *  tops out at 8 (`impliedDoubleRangeMax`), and at 60 kg the step is a
 *  2.5 kg plate pair. */
function bench(overrides: Partial<ProgramExercise> = {}): ProgramExercise {
  return {
    name: "Bench Press",
    exerciseId: "bench-press",
    instanceId: "i-bench",
    movementCategory: "horizontal_push",
    sets: 3,
    reps: 6,
    baseReps: 6,
    weight: 60,
    progressionType: "double",
    lastSuccessfulWeight: 60,
    lastAttemptedWeight: 60,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  };
}

/** One session's progression, without small plates unless asked for. */
function progressed(
  ex: ProgramExercise,
  reps: number,
  weight: number,
  options: { smallPlates?: boolean; rpe?: number } = {}
): ProgramExercise {
  const { smallPlates = false, rpe } = options;
  return applyProgression(ex, reps, weight, smallPlates, rpe);
}

describe("heavier: the plan moves to the load lifted, by any margin", () => {
  it("57.5 kg planned, 82.5 kg × 6 lifted: the plan is 82.5 kg", () => {
    const out = progressed(bench({ weight: 57.5 }), 6, 82.5);
    expect(out.weight).toBe(82.5); // Lift2 kept 57.5: 25 kg is ten steps
    expect(out.reps).toBe(7); // the range climb runs from there
    expect(out.consecutiveFailures).toBe(0);
    expect(out.lastSuccessfulWeight).toBe(82.5);
  });

  it("the measured case: three sessions of 82.5 kg × 6 on a 57.5 kg seed", () => {
    let ex = bench({ weight: 57.5 });
    const plan: number[] = [];
    for (let session = 0; session < 3; session++) {
      ex = progressed(ex, 6, 82.5);
      plan.push(ex.weight);
    }
    // Lift2 read 57.5 → 57.5 → 57.5. The first session moves the plan to
    // 82.5 and climbs the target to 7; 6 then misses it twice, and the
    // second miss lowers the lift 10% with the target kept.
    expect(plan).toEqual([82.5, 82.5, 75]);
    expect(ex.reps).toBe(7);
    expect(ex.lowered).toMatchObject({ from: 82.5, target: 7 });
    expect(ex.consecutiveFailures).toBe(0);
    expect(ex.plateauCount).toBe(1); // the stall is still recorded
  });

  it("a 200 kg entry on a 50 kg lift is taken as lifted — no typo guard", () => {
    expect(progressed(bench({ weight: 50 }), 6, 200).weight).toBe(200);
  });
});

describe("lighter: the plan moves down to the load lifted", () => {
  it("reps hit is a success at that load: no miss, the climb runs from it", () => {
    const out = progressed(bench({ consecutiveFailures: 2 }), 6, 50);
    expect(out.weight).toBe(50); // Lift2 held 60
    expect(out.reps).toBe(7);
    expect(out.consecutiveFailures).toBe(0); // a success clears the count
    expect(out.plateauCount).toBe(0);
    expect(out.lastSuccessfulWeight).toBe(50);
    expect(out.lastAttemptedWeight).toBe(50);
    expect(out.notes).toBeUndefined(); // notes is the injury-warning slot
  });

  it("the top of the range steps from the lighter load", () => {
    const out = progressed(bench(), 8, 50);
    expect(out.weight).toBe(52.5); // 50 + 2.5, not 60 + 2.5
    expect(out.reps).toBe(6);
  });

  it("reps missed: the plan still moves to the load lifted, and the miss counts", () => {
    const out = progressed(bench(), 4, 50);
    expect(out.weight).toBe(50);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.lastSuccessfulWeight).toBe(60); // the last success stands
  });
});

describe("the second miss in a row: 10% lighter, the target as it was", () => {
  it("double path: the lift comes down 10% and records where it came from", () => {
    const out = progressed(bench({ reps: 7, consecutiveFailures: 1 }), 4, 60);
    expect(out.weight).toBe(55); // 54 on the 2.5 kg grid
    expect(out.reps).toBe(7);
    expect(out.lowered).toEqual({
      exerciseId: "bench-press",
      from: 60,
      unit: "kg",
      target: 7,
    });
    expect(out.consecutiveFailures).toBe(0);
    expect(out.plateauCount).toBe(1);
  });

  it("linear path: the same", () => {
    const linear = bench({
      progressionType: "linear",
      weight: 82.5,
      reps: 8,
      consecutiveFailures: 1,
    });
    const out = progressed(linear, 7, 82.5);
    expect(out.weight).toBe(75);
    expect(out.reps).toBe(8);
    expect(out.lowered).toMatchObject({ from: 82.5, target: 8 });
  });

  it("the first miss holds, silently", () => {
    const out = progressed(bench({ reps: 7 }), 4, 60);
    expect(out.weight).toBe(60);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.lowered).toBeUndefined();
  });

  it("a weighted hold comes down in load and keeps its duration", () => {
    const carry = bench({
      name: "Farmer's Carry",
      exerciseId: "farmers-carry",
      movementCategory: "core",
      repUnit: "seconds",
      reps: 40,
      baseReps: 30,
      repRangeMax: 45,
      weight: 24,
      consecutiveFailures: 1,
    });
    const out = progressed(carry, 35, 24);
    expect(out.weight).toBe(22.5); // 21.6 is nearest the 22.5 kg pair
    expect(out.reps).toBe(40);
    expect(out.lowered).toEqual({
      exerciseId: "farmers-carry",
      from: 24,
      unit: "kg",
      target: 40,
    });
    expect(out.plateauCount).toBe(1);
  });

  it("bodyweight movements still step their target down", () => {
    const pullUps = bench({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      reps: 8,
      weight: 0,
      consecutiveFailures: 1,
    });
    const reps = progressed(pullUps, 5, 0);
    expect(reps.reps).toBe(7); // one rep down, not back to the base of 6
    expect(reps.weight).toBe(0);
    expect(reps.plateauCount).toBe(1);
    const plank = bench({
      name: "Plank",
      exerciseId: "plank",
      movementCategory: "core",
      repUnit: "seconds",
      reps: 40,
      baseReps: 30,
      weight: 0,
      consecutiveFailures: 1,
    });
    expect(progressed(plank, 20, 0).reps).toBe(35); // five seconds down, not 30
    const dips = bench({
      exerciseId: "weighted-chest-dip",
      movementCategory: "vertical_push",
      reps: 8,
      weight: 10,
      consecutiveFailures: 1,
    });
    const dipped = progressed(dips, 5, 10);
    expect(dipped.reps).toBe(7);
    expect(dipped.weight).toBe(10);
  });
});

describe("every step runs from the load lifted", () => {
  it("small plates step a barbell 1.25 kg, heavier and lighter", () => {
    const linear = bench({ progressionType: "linear", weight: 57.5 });
    expect(progressed(linear, 6, 82.5, { smallPlates: true }).weight).toBe(
      83.75
    );
    expect(progressed(linear, 6, 50, { smallPlates: true }).weight).toBe(51.25);
  });

  it("a fixed target met on every set steps, from the load lifted", () => {
    const linear = bench({ progressionType: "linear", weight: 57.5 });
    const met = progressed(linear, 6, 82.5);
    expect(met.weight).toBe(85);
    expect(met.reps).toBe(6);
    expect(progressed(linear, 8, 82.5).weight).toBe(85); // no overshoot needed
  });

  it("the RPE hold keeps the plan AT the load lifted, with no step", () => {
    const heavier = progressed(bench({ weight: 57.5 }), 8, 82.5, { rpe: 10 });
    expect(heavier.weight).toBe(82.5);
    expect(heavier.reps).toBe(6);
    expect(progressed(bench(), 8, 50, { rpe: 10 }).weight).toBe(50);
  });

  it("the 15% cap keys on the load lifted", () => {
    // 30 kg planned and 82.5 kg lifted: 2.5 kg is 3% of what was lifted.
    expect(progressed(bench({ weight: 30 }), 8, 82.5).weight).toBe(85);
    // 60 kg planned and 15 kg lifted: 2.5 kg is 17% of it, so the target
    // climbs a rep past the range instead.
    const light = progressed(bench(), 8, 15);
    expect(light.weight).toBe(15);
    expect(light.reps).toBe(9);
  });
});

describe("no load logged: nothing to follow, so the plan holds", () => {
  it.each([0, -5, Number.NaN])(
    "%s kg on a loaded lift records the session and changes nothing else",
    (weight) => {
      for (const reps of [6, 4]) {
        const out = progressed(
          bench({ consecutiveFailures: 2, plateauCount: 1 }),
          reps,
          weight
        );
        expect(out.weight).toBe(60);
        expect(out.reps).toBe(6);
        expect(out.consecutiveFailures).toBe(2); // no miss counted, none cleared
        expect(out.plateauCount).toBe(1);
        expect(out.lastSuccessfulWeight).toBe(60);
        expect(out.performanceHistory).toHaveLength(1); // the session is kept
      }
    }
  );
});

describe("controls: what the change leaves alone", () => {
  it("a bodyweight movement progresses by reps and never follows a load", () => {
    const pullUps = bench({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      weight: 0,
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
    });
    const out = progressed(pullUps, 8, 0);
    expect(out.weight).toBe(0);
    expect(out.reps).toBe(9); // the bodyweight climb, as before
  });

  it("a bodyweight movement with load added keeps its load and its old success test", () => {
    const dips = bench({
      name: "Weighted Chest Dip",
      exerciseId: "weighted-chest-dip",
      movementCategory: "vertical_push",
      reps: 8,
      baseReps: 8,
      weight: 10,
    });
    const lighter = progressed(dips, 8, 5);
    expect(lighter.weight).toBe(10);
    expect(lighter.consecutiveFailures).toBe(1); // under the plan's load: a miss
    const heavier = progressed(dips, 8, 20);
    expect(heavier.weight).toBe(10);
    expect(heavier.reps).toBe(9);
  });

  it("an uncalibrated lift still takes the load lifted, with no step", () => {
    const out = progressed(bench({ weight: 0, consecutiveFailures: 2 }), 8, 40);
    expect(out.weight).toBe(40);
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(0);
    expect(progressed(bench({ weight: 0 }), 8, 0).weight).toBe(0);
  });

  it("the prescribed load at the prescribed reps climbs as before", () => {
    const out = progressed(bench(), 6, 60);
    expect(out.weight).toBe(60);
    expect(out.reps).toBe(7);
    expect(out.consecutiveFailures).toBe(0);
  });
});

describe("liftedLoad", () => {
  it("names the load to follow, or none", () => {
    expect(liftedLoad("bench-press", 82.5)).toBe(82.5);
    expect(liftedLoad("farmers-carry", 24)).toBe(24); // a loaded hold follows too
    expect(liftedLoad("pull-ups", 20)).toBeNull();
    expect(liftedLoad("bench-press", 0)).toBeNull();
  });
});

/* ─── At the finish: applySessionProgression ───────────────────────────── */

function stateWith(
  ex: ProgramExercise,
  extra: Partial<ProgramState> = {}
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 3,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 1,
    settings: { autoProgression: true, smallPlates: false },
    workouts: [
      { dayName: "Push", dayType: "push", completed: false, exercises: [ex] },
    ],
    ...extra,
  } as ProgramState;
}

function finishState(
  state: ProgramState,
  sets: Array<Pick<LoggedSet, "weight" | "reps">>,
  sessionVariant?: "easier_today" | "time_budget"
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
  sessionVariant?: "easier_today" | "time_budget"
): ProgramExercise {
  return finishState(state, sets, sessionVariant).workouts[0].exercises[0];
}

/** The next app load, read as useProgram's loader reads the stored
 *  programme. A live document is at the current schema version. */
function reload(state: ProgramState): ProgramExercise {
  const stored = {
    ...state,
    programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
  };
  return migrateProgramState(
    normalizeProgramState(stored, { primaryGoal: "hypertrophy" }),
    "2026-10-05"
  ).workouts[0].exercises[0];
}

const three = (weight: number, reps: number) =>
  Array.from({ length: 3 }, () => ({ weight, reps }));

const autoOff = { settings: { autoProgression: false, smallPlates: false } };

/** An easing block in its first week: progression is held. */
const heldWeek: Partial<ProgramState> = {
  trainingBlock: {
    id: "2026-10-05-1",
    owned: true,
    focus: "hypertrophy",
    pace: "easing",
    durationWeeks: 8,
    startDate: "2026-10-05",
    goalBefore: "hypertrophy",
    amnestyWeeksLeft: 3,
  } as ActiveTrainingBlock,
};

describe("at the finish (applySessionProgression)", () => {
  it("auto-progression on: the saved session moves the plan to the load lifted", () => {
    const out = finish(stateWith(bench({ weight: 57.5 })), three(82.5, 6));
    expect(out.weight).toBe(82.5);
  });

  it("auto-progression off: the plan takes the load lifted, lighter, with no miss counted", () => {
    const out = finish(
      stateWith(bench({ consecutiveFailures: 1 }), autoOff),
      three(50, 4)
    );
    expect(out.weight).toBe(50);
    expect(out.consecutiveFailures).toBe(1); // no failure accounting
    expect(out.lastSuccessfulWeight).toBe(60); // no success accounting
    expect(out.lastAttemptedWeight).toBe(50);
    expect(out.lastPerformance).toEqual({
      sets: 3,
      reps: 4,
      weight: 50,
      completed: false,
    });
    expect(out.performanceHistory).toEqual([]); // off writes no history, as before
  });

  it("auto-progression off: heavier, with no step on top", () => {
    // An overshoot would step the plan with auto-progression on.
    const out = finish(
      stateWith(bench({ weight: 57.5 }), autoOff),
      three(82.5, 8)
    );
    expect(out.weight).toBe(82.5);
    expect(out.reps).toBe(6);
  });

  it("auto-progression off: an uncalibrated lift takes its first load too", () => {
    const out = finish(stateWith(bench({ weight: 0 }), autoOff), three(40, 6));
    expect(out.weight).toBe(40);
  });

  it("auto-progression off: no load logged, or a bodyweight movement, keeps the plan", () => {
    expect(finish(stateWith(bench(), autoOff), three(0, 6)).weight).toBe(60);
    const dips = bench({
      exerciseId: "weighted-chest-dip",
      movementCategory: "vertical_push",
      weight: 10,
    });
    expect(finish(stateWith(dips, autoOff), three(20, 6)).weight).toBe(10);
  });

  it("small plates reach the finish: a barbell steps 1.25 kg", () => {
    const linear = bench({ progressionType: "linear" });
    const plates = { settings: { autoProgression: true, smallPlates: true } };
    expect(finish(stateWith(linear, plates), three(60, 6)).weight).toBe(61.25);
    expect(finish(stateWith(linear), three(60, 6)).weight).toBe(62.5);
  });

  it("a held week keeps the prescription, auto-progression on or off", () => {
    for (const settings of [
      { autoProgression: true, smallPlates: false },
      { autoProgression: false, smallPlates: false },
    ]) {
      const out = finish(
        stateWith(bench(), { ...heldWeek, settings }),
        three(50, 6)
      );
      expect(out.weight).toBe(60);
      expect(out.performanceHistory).toHaveLength(1); // recorded, as before
    }
  });

  // Lift4 (8): an easier session's weights are lighter by design, so it can
  // move a weight up, never down; a shortened session's sets count like any
  // others, and one set is not enough for a step.
  it("an easier session can move a weight up, never down", () => {
    const state = stateWith(bench());
    const stored = state.workouts[0].exercises[0];
    expect(finish(state, three(50, 6), "easier_today")).toBe(stored);
    expect(finish(state, three(65, 6), "easier_today")).toMatchObject({
      weight: 65,
      reps: stored.reps,
    });
  });

  it("a lighter week's session can move a weight up, never down", () => {
    // Lift4 (8): a lighter week is easy by design; a session in it is no
    // miss, and only a heavier weight moves the plan.
    const state = stateWith(bench(), { currentPhase: "deload" });
    const stored = state.workouts[0].exercises[0];
    expect(finish(state, three(50, 3))).toBe(stored);
    expect(finish(state, three(65, 6))).toMatchObject({
      weight: 65,
      reps: stored.reps,
    });
  });

  it("a shortened session's sets count: one set follows the weight and holds", () => {
    const out = finish(
      stateWith(bench()),
      [{ weight: 50, reps: 6 }],
      "time_budget"
    );
    expect(out.weight).toBe(50);
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(0);
  });
});

describe("the lowered line lasts one session (Lift4 (3))", () => {
  const lowered = bench({
    weight: 55,
    lowered: { exerciseId: "bench-press", from: 60, unit: "kg", target: 6 },
  });

  it("the next session's finish says it, and the climb back starts", () => {
    const out = finish(stateWith(lowered), three(55, 6));
    expect(out.weight).toBe(57.5);
    expect(out.lowered).toEqual({ ...lowered.lowered, shown: true });
  });

  it("so does an easier session's, which moves nothing else", () => {
    const out = finish(stateWith(lowered), three(45, 6), "easier_today");
    expect(out.weight).toBe(55);
    expect(out.lowered).toEqual({ ...lowered.lowered, shown: true });
  });

  it("a second drop writes a new line, from where it came down this time", () => {
    const out = finish(
      stateWith({ ...lowered, consecutiveFailures: 1 }),
      three(55, 4)
    );
    expect(out.weight).toBe(50);
    expect(out.lowered).toEqual({
      exerciseId: "bench-press",
      from: 55,
      unit: "kg",
      target: 6,
    });
  });

  it("a bodyweight lift's record goes with the session that showed it", () => {
    const pullUps = bench({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      weight: 0,
      reps: 7,
      lowered: { exerciseId: "pull-ups", from: 8, unit: "reps", target: 8 },
    });
    expect(finish(stateWith(pullUps), three(0, 7)).lowered).toBeUndefined();
  });

  it("stays while the lift waits to be done", () => {
    const state = stateWith(lowered);
    const next = applySessionProgression(state, 0, {
      completionId: "session-1",
      date: "2026-10-05",
      prescription: { exercises: [], progressionBaseline: [] },
      setLogs: [],
    });
    expect(next.workouts[0].exercises[0].lowered).toEqual(lowered.lowered);
  });
});

/* ─── The next load: what the person sees next session ─────────────────────
   Each case leaves the plan below the last success (60 kg). The loader's
   decay repair raised a load to `lastSuccessfulWeight` on every load, so all
   three were undone the next time the app opened while every test above
   stayed green. It now runs once per document (migrations.ts). */
describe("after the next load, a lowered plan stays lowered", () => {
  it("a lighter session with the reps missed", () => {
    const next = finishState(stateWith(bench()), three(50, 4));
    expect(reload(next).weight).toBe(50);
  });

  it("auto-progression off, lighter", () => {
    const next = finishState(stateWith(bench(), autoOff), three(50, 6));
    expect(reload(next).weight).toBe(50);
  });

  // Lift4 (7): a miss counts only at the weight the plan asked for. Short
  // of the reps at a weight of the person's own choosing, the plan follows
  // the weight and the run of misses ends.
  it("a lighter session short of its reps: the load lifted, not a miss", () => {
    const next = finishState(
      stateWith(bench({ reps: 7, consecutiveFailures: 2 })),
      three(50, 4)
    );
    const ex = reload(next);
    expect(ex.weight).toBe(50);
    expect(ex.reps).toBe(7);
    expect(ex.consecutiveFailures).toBe(0);
  });

  it("a heavier session keeps its load too", () => {
    const next = finishState(
      stateWith(bench({ weight: 57.5 })),
      three(82.5, 6)
    );
    expect(reload(next).weight).toBe(82.5);
  });
});
