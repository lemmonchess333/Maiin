/**
 * The plan follows the load lifted (owner, 2026-10-05). It reverses Lift2,
 * under which a lighter session HELD the prescription and a heavier one
 * re-anchored it at most four load steps up, so a lifter seeded at 57.5 kg
 * who benched 82.5 kg × 6 four sessions running saw the plan go
 * 57.5 → 57.5 → 57.5 → 54.5.
 *
 * Independent literals for what the parity matrix can only mirror:
 *   - a loaded lift's prescription moves to the weight lifted, heavier or
 *     lighter, by any margin; success is the target reps at that weight,
 *     and every step runs from it, its size keyed on that weight;
 *   - reps missed still move it there and count the miss; the third miss in
 *     a row keeps the load and puts the rep target (a hold's duration) back
 *     to its base, while bodyweight movements still step their target down;
 *   - no load logged holds; bodyweight and uncalibrated lifts are as they
 *     were;
 *   - at the finish (`applySessionProgression`), auto-progression off moves
 *     the prescription to the load lifted with no step and no success or
 *     failure accounting, while a held week, an easier session and a
 *     shortened one keep it;
 *   - the next app load (`migrateProgramState`) keeps a plan these lowered.
 * Both engine copies are driven on every `applyProgression` case, so a rule
 * that lands in one and not the other fails here, not in production.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { applyProgression, liftedLoad } from "@/features/program/programEngine";
import { applySessionProgression } from "@/features/program/sessionCompletion";
import { migrateProgramState } from "@/features/program/migrations";
import {
  CURRENT_PROGRAM_SCHEMA_VERSION,
  normalizeProgramState,
} from "@/features/program/programTypes";
import type {
  ActiveTrainingBlock,
  Goal,
  ProgramExercise,
  ProgramState,
} from "@/features/program/programTypes";
import type { LoggedSet } from "@/features/program/workoutSetRecord";

const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/progressionEngine") as {
  applyProgression: typeof applyProgression;
  liftedLoad: typeof liftedLoad;
};

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

/** Run both copies and assert they agree before returning the client's. */
function both(
  ex: ProgramExercise,
  reps: number,
  weight: number,
  options: { microloading?: boolean; goal?: Goal; rpe?: number } = {}
): ProgramExercise {
  const { microloading = false, goal = "recomp", rpe } = options;
  const client = applyProgression(ex, reps, weight, goal, microloading, rpe);
  const server = cf.applyProgression(ex, reps, weight, goal, microloading, rpe);
  const strip = (e: ProgramExercise) => {
    const { performanceHistory: _h, ...rest } = e;
    return rest;
  };
  expect(strip(server)).toEqual(strip(client));
  return client;
}

describe("heavier: the plan moves to the load lifted, by any margin", () => {
  it("57.5 kg planned, 82.5 kg × 6 lifted: the plan is 82.5 kg", () => {
    const out = both(bench({ weight: 57.5 }), 6, 82.5);
    expect(out.weight).toBe(82.5); // Lift2 kept 57.5: 25 kg is ten steps
    expect(out.reps).toBe(7); // the range climb runs from there
    expect(out.consecutiveFailures).toBe(0);
    expect(out.lastSuccessfulWeight).toBe(82.5);
  });

  it("the measured case: four sessions of 82.5 kg × 6 on a 57.5 kg seed", () => {
    let ex = bench({ weight: 57.5 });
    const plan: number[] = [];
    for (let session = 0; session < 4; session++) {
      ex = both(ex, 6, 82.5);
      plan.push(ex.weight);
    }
    // Was 57.5 → 57.5 → 57.5 → 54.5. The first session moves the plan to
    // 82.5 and climbs the target to 7; 6 then misses it three times, and the
    // third miss puts the target back to 6 with the load where it was lifted.
    expect(plan).toEqual([82.5, 82.5, 82.5, 82.5]);
    expect(ex.reps).toBe(6);
    expect(ex.consecutiveFailures).toBe(0);
    expect(ex.plateauCount).toBe(1); // the stall is still recorded
  });

  it("a 200 kg entry on a 50 kg lift is taken as lifted — no typo guard", () => {
    expect(both(bench({ weight: 50 }), 6, 200).weight).toBe(200);
  });
});

describe("lighter: the plan moves down to the load lifted", () => {
  it("reps hit is a success at that load: no miss, the climb runs from it", () => {
    const out = both(bench({ consecutiveFailures: 2 }), 6, 50);
    expect(out.weight).toBe(50); // Lift2 held 60
    expect(out.reps).toBe(7);
    expect(out.consecutiveFailures).toBe(0); // a success clears the count
    expect(out.plateauCount).toBe(0);
    expect(out.lastSuccessfulWeight).toBe(50);
    expect(out.lastAttemptedWeight).toBe(50);
    expect(out.notes).toBeUndefined(); // notes is the injury-warning slot
  });

  it("the top of the range steps from the lighter load", () => {
    const out = both(bench(), 8, 50);
    expect(out.weight).toBe(52.5); // 50 + 2.5, not 60 + 2.5
    expect(out.reps).toBe(6);
  });

  it("reps missed: the plan still moves to the load lifted, and the miss counts", () => {
    const out = both(bench(), 4, 50);
    expect(out.weight).toBe(50);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.lastSuccessfulWeight).toBe(60); // the last success stands
  });
});

describe("the third miss in a row: the target resets, the load stays", () => {
  it("double path: the load lifted stays and the target goes back to its base", () => {
    const out = both(bench({ reps: 7, consecutiveFailures: 2 }), 4, 50);
    expect(out.weight).toBe(50); // no 5% cut: was 47.5
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(0);
    expect(out.plateauCount).toBe(1);
  });

  it("linear path: four sessions of 82.5 kg × 5 against 6 reps on a 57.5 kg seed", () => {
    let ex = bench({ progressionType: "linear", weight: 57.5 });
    const plan: number[] = [];
    for (let session = 0; session < 4; session++) {
      ex = both(ex, 5, 82.5);
      plan.push(ex.weight);
    }
    // The 1 kg cut on the third miss went too: it read 82.5, 82.5, 81.5, 82.5.
    expect(plan).toEqual([82.5, 82.5, 82.5, 82.5]);
    expect(ex.plateauCount).toBe(1);
  });

  it("linear path: a target above its base goes back to it", () => {
    const linear = bench({
      progressionType: "linear",
      reps: 8,
      consecutiveFailures: 2,
    });
    const out = both(linear, 7, 82.5);
    expect(out.weight).toBe(82.5);
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(0);
  });

  it("a weighted hold keeps its load and goes back to its base duration", () => {
    const carry = bench({
      name: "Farmer's Carry",
      exerciseId: "farmers-carry",
      movementCategory: "core",
      repUnit: "seconds",
      reps: 40,
      baseReps: 30,
      repRangeMax: 45,
      weight: 24,
      consecutiveFailures: 2,
    });
    const same = both(carry, 35, 24);
    expect(same.weight).toBe(24); // not cut, not held at a shorter time
    expect(same.reps).toBe(30);
    expect(same.plateauCount).toBe(1);
    expect(both(carry, 35, 20).weight).toBe(20); // the load lifted
  });

  it("bodyweight movements still step their target down", () => {
    const pullUps = bench({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      reps: 8,
      weight: 0,
      consecutiveFailures: 2,
    });
    const reps = both(pullUps, 5, 0);
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
      consecutiveFailures: 2,
    });
    expect(both(plank, 20, 0).reps).toBe(35); // five seconds down, not 30
    const dips = bench({
      exerciseId: "weighted-chest-dip",
      movementCategory: "vertical_push",
      reps: 8,
      weight: 10,
      consecutiveFailures: 2,
    });
    const dipped = both(dips, 5, 10);
    expect(dipped.reps).toBe(7);
    expect(dipped.weight).toBe(10);
  });
});

describe("every step runs from the load lifted", () => {
  it("microloading's +1 kg (linear path), heavier and lighter", () => {
    const linear = bench({ progressionType: "linear", weight: 57.5 });
    expect(both(linear, 6, 82.5, { microloading: true }).weight).toBe(83.5);
    expect(both(linear, 6, 50, { microloading: true }).weight).toBe(51);
  });

  it("the linear step needs the 2-rep overshoot, as before", () => {
    const linear = bench({ progressionType: "linear", weight: 57.5 });
    const overshoot = both(linear, 8, 82.5);
    expect(overshoot.weight).toBe(85);
    expect(overshoot.reps).toBe(6);
    expect(both(linear, 6, 82.5).weight).toBe(82.5); // no overshoot, no step
  });

  it("the lean-bulk bonus rides on it", () => {
    const out = both(bench({ weight: 57.5 }), 8, 82.5, { goal: "lean bulk" });
    expect(out.weight).toBe(86.25); // 82.5 + 2.5 + 1.25
  });

  it("the RPE hold keeps the plan AT the load lifted, with no step", () => {
    const heavier = both(bench({ weight: 57.5 }), 8, 82.5, { rpe: 10 });
    expect(heavier.weight).toBe(82.5);
    expect(heavier.reps).toBe(6);
    expect(both(bench(), 8, 50, { rpe: 10 }).weight).toBe(50);
  });

  it("the step's size keys on the load lifted", () => {
    // 30 kg planned is under HEAVY_LOAD_KG, but 82.5 kg was lifted, so the
    // step is a 2.5 kg plate pair (was a 1.25 kg microplate: 83.75), and on
    // lean bulk the bonus rides on it.
    expect(both(bench({ weight: 30 }), 8, 82.5).weight).toBe(85);
    expect(
      both(bench({ weight: 30 }), 8, 82.5, { goal: "lean bulk" }).weight
    ).toBe(86.25);
    // The other way: 60 kg planned, 30 kg lifted steps by a microplate, with
    // no bonus on a lift too light for a full plate.
    expect(both(bench(), 8, 30, { goal: "lean bulk" }).weight).toBe(31.25);
  });
});

describe("no load logged: nothing to follow, so the plan holds", () => {
  it.each([0, -5, Number.NaN])(
    "%s kg on a loaded lift records the session and changes nothing else",
    (weight) => {
      for (const reps of [6, 4]) {
        const out = both(
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
    const out = both(pullUps, 8, 0);
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
    const lighter = both(dips, 8, 5);
    expect(lighter.weight).toBe(10);
    expect(lighter.consecutiveFailures).toBe(1); // under the plan's load: a miss
    const heavier = both(dips, 8, 20);
    expect(heavier.weight).toBe(10);
    expect(heavier.reps).toBe(9);
  });

  it("an uncalibrated lift still takes the load lifted, with no step", () => {
    const out = both(bench({ weight: 0, consecutiveFailures: 2 }), 8, 40);
    expect(out.weight).toBe(40);
    expect(out.reps).toBe(6);
    expect(out.consecutiveFailures).toBe(0);
    expect(both(bench({ weight: 0 }), 8, 0).weight).toBe(0);
  });

  it("the prescribed load at the prescribed reps climbs as before", () => {
    const out = both(bench(), 6, 60);
    expect(out.weight).toBe(60);
    expect(out.reps).toBe(7);
    expect(out.consecutiveFailures).toBe(0);
  });
});

describe("liftedLoad — client ↔ functions mirror", () => {
  it("names the load to follow, or none", () => {
    expect(liftedLoad("bench-press", 82.5)).toBe(82.5);
    expect(liftedLoad("farmers-carry", 24)).toBe(24); // a loaded hold follows too
    expect(liftedLoad("pull-ups", 20)).toBeNull();
    expect(liftedLoad("bench-press", 0)).toBeNull();
  });

  it("agrees across ids and weights", () => {
    const ids = [
      "bench-press",
      "farmers-carry",
      "pull-ups",
      "plank",
      "weighted-chest-dip",
      "not-in-the-catalogue",
      undefined,
    ];
    const weights = [-5, 0, 0.5, 57.5, 82.5, 200, Number.NaN, Infinity];
    for (const id of ids) {
      for (const weight of weights) {
        expect(cf.liftedLoad(id, weight), `${id} @ ${weight}`).toBe(
          liftedLoad(id, weight)
        );
      }
    }
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
    settings: { autoProgression: true, microloading: false },
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

const autoOff = { settings: { autoProgression: false, microloading: true } };

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

  it("a held week keeps the prescription, auto-progression on or off", () => {
    for (const settings of [
      { autoProgression: true, microloading: false },
      { autoProgression: false, microloading: false },
    ]) {
      const out = finish(
        stateWith(bench(), { ...heldWeek, settings }),
        three(50, 6)
      );
      expect(out.weight).toBe(60);
      expect(out.performanceHistory).toHaveLength(1); // recorded, as before
    }
  });

  it("an easier session and a shortened one keep the prescription", () => {
    const state = stateWith(bench());
    const stored = state.workouts[0].exercises[0];
    expect(finish(state, three(50, 6), "easier_today")).toBe(stored);
    expect(finish(state, [{ weight: 50, reps: 6 }], "time_budget")).toBe(
      stored
    );
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

  it("a lighter third miss: the load lifted, the target back at its base", () => {
    const next = finishState(
      stateWith(bench({ reps: 7, consecutiveFailures: 2 })),
      three(50, 4)
    );
    const ex = reload(next);
    expect(ex.weight).toBe(50);
    expect(ex.reps).toBe(6);
  });

  it("a heavier session keeps its load too", () => {
    const next = finishState(
      stateWith(bench({ weight: 57.5 })),
      three(82.5, 6)
    );
    expect(reload(next).weight).toBe(82.5);
  });
});
