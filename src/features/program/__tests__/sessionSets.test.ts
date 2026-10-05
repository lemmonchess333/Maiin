import { describe, it, expect } from "vitest";
import {
  followedWeight,
  hardestEffort,
  readSessionSets,
  recordedReps,
  sessionOutcome,
  type SessionRead,
} from "../sessionSets";
import { applySessionSets } from "../programEngine";
import type { ProgramExercise } from "../programTypes";

const done = (
  weight: number,
  reps: number,
  type = "working",
  rpe?: number
) => ({
  completed: true,
  type,
  weight,
  reps,
  ...(rpe === undefined ? {} : { rpe }),
});

const read = (sets: ReturnType<typeof done>[], planned = 3): SessionRead => {
  const out = readSessionSets(sets, planned);
  if (!out) throw new Error("no working set");
  return out;
};

const plan = { weight: 60, reps: 8, sets: 3 };

describe("followedWeight", () => {
  it("is the weight most sets were lifted at", () => {
    expect(
      followedWeight([{ weight: 100 }, { weight: 90 }, { weight: 90 }])
    ).toBe(90);
  });

  it("takes the heavier on a tie", () => {
    expect(followedWeight([{ weight: 60 }, { weight: 62.5 }])).toBe(62.5);
  });

  it("is null for no sets", () => {
    expect(followedWeight([])).toBeNull();
  });
});

describe("readSessionSets — which sets count (Lift4)", () => {
  it("counts the working sets at the weight followed, best first", () => {
    expect(read([done(60, 8), done(60, 10), done(60, 9)])).toEqual({
      weight: 60,
      counted: [
        { weight: 60, reps: 10 },
        { weight: 60, reps: 9 },
        { weight: 60, reps: 8 },
      ],
    });
  });

  it("leaves a top set and a lighter last set out, as lifted", () => {
    const top = read([done(100, 5), done(90, 8), done(90, 8)]);
    expect(top.weight).toBe(90);
    expect(top.counted).toHaveLength(2);
    const lighterLast = read([done(60, 10), done(60, 10), done(50, 10)]);
    expect(lighterLast.weight).toBe(60);
    expect(lighterLast.counted).toHaveLength(2);
  });

  it("leaves out warm-ups, drop sets and rows not done", () => {
    const out = read([
      done(40, 5, "warmup"),
      done(60, 8),
      { ...done(60, 0), completed: false },
      done(40, 12, "dropset"),
    ]);
    expect(out).toEqual({ weight: 60, counted: [{ weight: 60, reps: 8 }] });
  });

  it("reads an untyped set as a working set", () => {
    expect(
      readSessionSets([{ completed: true, weight: 60, reps: 8 }], 3)?.counted
    ).toHaveLength(1);
  });

  it("counts the planned number at most, so an extra set can't block a step", () => {
    const out = read([done(60, 8), done(60, 8), done(60, 8), done(60, 4)]);
    expect(out.counted.map((s) => s.reps)).toEqual([8, 8, 8]);
    expect(sessionOutcome(out, plan, false)).toBe("step");
  });

  it("is null when no working set was done", () => {
    expect(readSessionSets([done(40, 5, "warmup")], 3)).toBeNull();
  });
});

describe("sessionOutcome — what the sets earned (Lift4)", () => {
  it("steps when two or more sets all reach the target", () => {
    expect(sessionOutcome(read([done(60, 8), done(60, 9)]), plan, false)).toBe(
      "step"
    );
  });

  it("holds on one set of a plan with more", () => {
    expect(sessionOutcome(read([done(60, 8)]), plan, false)).toBe("hold");
  });

  it("steps on the one set of a one-set plan", () => {
    expect(
      sessionOutcome(read([done(60, 8)], 1), { ...plan, sets: 1 }, false)
    ).toBe("step");
  });

  // The lock's own examples, on a 3 × 8 target.
  it("8, 7, 6 is a miss; 9, 8, 7 is not", () => {
    expect(
      sessionOutcome(read([done(60, 8), done(60, 7), done(60, 6)]), plan, false)
    ).toBe("miss");
    expect(
      sessionOutcome(read([done(60, 9), done(60, 8), done(60, 7)]), plan, false)
    ).toBe("hold");
  });

  it("judges a miss on the sets done", () => {
    expect(sessionOutcome(read([done(60, 6)]), plan, false)).toBe("miss");
  });

  it("never counts a miss at a weight other than the plan's", () => {
    expect(
      sessionOutcome(read([done(55, 6), done(55, 6), done(55, 6)]), plan, false)
    ).toBe("hold");
  });

  it("steps from a different weight when every set reaches the target", () => {
    expect(
      sessionOutcome(read([done(65, 8), done(65, 8), done(65, 8)]), plan, false)
    ).toBe("step");
  });

  it("steps a bodyweight lift only at the added load asked for or more", () => {
    const loaded = { weight: 10, reps: 8, sets: 3 };
    expect(sessionOutcome(read([done(0, 8), done(0, 8)]), loaded, true)).toBe(
      "hold"
    );
    expect(sessionOutcome(read([done(10, 8), done(10, 8)]), loaded, true)).toBe(
      "step"
    );
  });
});

describe("recordedReps and hardestEffort", () => {
  it("records the average set, rounded down: under target exactly on a miss", () => {
    expect(recordedReps(read([done(60, 8), done(60, 7), done(60, 6)]))).toBe(7);
    expect(recordedReps(read([done(60, 9), done(60, 8), done(60, 7)]))).toBe(8);
  });

  it("is the hardest effort logged on a counted set", () => {
    expect(
      hardestEffort(
        read([done(60, 8, "working", 8), done(60, 8, "working", 9.5)])
      )
    ).toBe(9.5);
    expect(hardestEffort(read([done(60, 8)]))).toBeUndefined();
  });
});

describe("applySessionSets — the engine on a whole session", () => {
  function bench(over: Partial<ProgramExercise> = {}): ProgramExercise {
    return {
      name: "Bench Press",
      exerciseId: "bench-press",
      movementCategory: "horizontal_push",
      sets: 3,
      reps: 8,
      baseReps: 8,
      repRangeMax: 12,
      weight: 60,
      progressionType: "double",
      lastSuccessfulWeight: 60,
      lastAttemptedWeight: 60,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: null,
      ...over,
    };
  }
  const apply = (ex: ProgramExercise, sets: ReturnType<typeof done>[]) =>
    applySessionSets(ex, read(sets, ex.sets), "recomp", false);

  it("climbs to one past the weakest set", () => {
    const out = apply(bench(), [done(60, 10), done(60, 10), done(60, 9)]);
    expect(out.reps).toBe(10);
    expect(out.weight).toBe(60);
  });

  it("no longer reads a strong session as a miss for its last set", () => {
    // 10, 10, 7: the last set alone was a miss; the session is a hold.
    const out = apply(bench({ consecutiveFailures: 1 }), [
      done(60, 10),
      done(60, 10),
      done(60, 7),
    ]);
    expect(out.reps).toBe(8);
    expect(out.consecutiveFailures).toBe(0);
  });

  it("no longer reads a weak session as a success for its last set", () => {
    // 6, 6, 8: the last set alone hit the target; the session is a miss.
    const out = apply(bench(), [done(60, 6), done(60, 6), done(60, 8)]);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.reps).toBe(8);
  });

  it("holds the step on a set logged at 9.5 or more", () => {
    const out = apply(bench(), [
      done(60, 10),
      done(60, 10, "working", 9.5),
      done(60, 10),
    ]);
    expect(out.reps).toBe(8);
    expect(out.consecutiveFailures).toBe(0);
  });

  it("records the session's average set", () => {
    const out = apply(bench(), [done(60, 9), done(60, 8), done(60, 7)]);
    expect(out.performanceHistory.at(-1)).toMatchObject({
      weight: 60,
      repsCompleted: 8,
      repsTarget: 8,
    });
  });

  it("follows the weight of a hold at another weight", () => {
    const out = apply(bench(), [done(55, 7), done(55, 7), done(55, 7)]);
    expect(out.weight).toBe(55);
    expect(out.consecutiveFailures).toBe(0);
  });
});

/* ─── Lift4 release 2: two misses lower a lift, and it climbs back ────── */

describe("the drop: two misses in a row lower a lift (Lift4 (7))", () => {
  function squat(over: Partial<ProgramExercise> = {}): ProgramExercise {
    return {
      name: "Barbell Squat",
      exerciseId: "squat",
      movementCategory: "knee_dominant",
      sets: 3,
      reps: 5,
      baseReps: 5,
      weight: 100,
      progressionType: "linear",
      lastSuccessfulWeight: 100,
      lastAttemptedWeight: 100,
      consecutiveFailures: 0,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: null,
      ...over,
    };
  }
  const session = (ex: ProgramExercise, weight: number, reps: number[]) =>
    applySessionSets(
      ex,
      read(
        reps.map((r) => done(weight, r)),
        ex.sets
      ),
      "recomp",
      false
    );

  it("holds the first miss, silently", () => {
    const out = session(squat(), 100, [5, 4, 4]);
    expect(out.weight).toBe(100);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.lowered).toBeUndefined();
  });

  it("lowers the second miss in a row 10%, with one line, and keeps the target", () => {
    const out = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    expect(out.weight).toBe(90);
    expect(out.reps).toBe(5);
    expect(out.lowered).toEqual({
      exerciseId: "squat",
      from: 100,
      unit: "kg",
      target: 5,
    });
    expect(out.consecutiveFailures).toBe(0);
    expect(out.plateauCount).toBe(1);
  });

  it("does not lower after a miss and a hold", () => {
    // 6, 5, 4 at 3 × 5 makes the 15 reps asked for: a hold, which ends the run.
    const held = session(squat({ consecutiveFailures: 1 }), 100, [6, 5, 4]);
    expect(held.consecutiveFailures).toBe(0);
    expect(held.weight).toBe(100);
  });

  it("brings a bodyweight lift down a rep, and a hold five seconds", () => {
    const pullUps = squat({
      name: "Pull-Ups",
      exerciseId: "pull-ups",
      movementCategory: "vertical_pull",
      weight: 0,
      reps: 8,
      baseReps: 8,
      consecutiveFailures: 1,
    });
    const out = session(pullUps, 0, [7, 6, 6]);
    expect(out.reps).toBe(7);
    expect(out.lowered).toEqual({
      exerciseId: "pull-ups",
      from: 8,
      unit: "reps",
      target: 8,
    });

    const plank = squat({
      name: "Plank",
      exerciseId: "plank",
      movementCategory: "core",
      weight: 0,
      reps: 45,
      baseReps: 45,
      repUnit: "seconds",
      progressionType: "double",
      consecutiveFailures: 1,
    });
    const held = session(plank, 0, [40, 35, 30]);
    expect(held.reps).toBe(40);
    expect(held.lowered).toEqual({
      exerciseId: "plank",
      from: 45,
      unit: "s",
      target: 45,
    });
  });

  it("climbs back a step a session to where it was, then the usual rules", () => {
    let ex = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      ex = session(ex, ex.weight, [5, 5, 5]);
      seen.push(ex.weight);
      expect(ex.reps).toBe(5);
    }
    expect(seen.slice(0, 4)).toEqual([92.5, 95, 97.5, 100]);
    expect(ex.lowered).toBeUndefined();
    // Back at 100, the usual rules: without microloading a linear lift steps
    // on two reps over, so 5, 5, 5 holds.
    expect(seen[4]).toBe(100);
  });

  it("climbs back on a session that is not a miss, even short of a step", () => {
    const lowered = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    const out = session(lowered, 90, [6, 5, 4]);
    expect(out.weight).toBe(92.5);
    // The line was that session's: the record goes on as the way back.
    expect(out.lowered).toMatchObject({ from: 100, shown: true });
  });

  it("counts a miss on the way back, and does not climb", () => {
    const lowered = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    const out = session(lowered, 90, [4, 4, 4]);
    expect(out.weight).toBe(90);
    expect(out.consecutiveFailures).toBe(1);
    expect(out.lowered).toMatchObject({ from: 100, shown: true });
  });

  it("drops the way back once the lift is lifted at or past it", () => {
    const lowered = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    const out = session(lowered, 102.5, [5, 5, 5]);
    expect(out.lowered).toBeUndefined();
    expect(out.weight).toBeGreaterThanOrEqual(102.5);
  });

  it("never climbs past the weight it came down from", () => {
    const lowered = session(squat({ consecutiveFailures: 1 }), 100, [5, 4, 4]);
    const out = session(lowered, 99, [5, 5, 5]);
    expect(out.weight).toBe(100); // not 101.5
    expect(out.lowered).toBeUndefined();
  });

  it("never reads a record a swap left behind", () => {
    const front = squat({
      exerciseId: "front-squat",
      weight: 90,
      lowered: { exerciseId: "squat", from: 100, unit: "kg", target: 5 },
    });
    const out = session(front, 90, [5, 5, 5]);
    expect(out.weight).toBe(90); // the usual rules, not a climb to 100
    expect(out.lowered).toBeUndefined();
  });
});

describe("how far a lift comes down: 10% on its step grid, at least a step", () => {
  const lowersTo = (over: Partial<ProgramExercise>) => {
    const ex: ProgramExercise = {
      name: "Lift",
      exerciseId: "squat",
      movementCategory: "knee_dominant",
      sets: 3,
      reps: 8,
      baseReps: 8,
      weight: 100,
      progressionType: "linear",
      lastSuccessfulWeight: 0,
      lastAttemptedWeight: 0,
      consecutiveFailures: 1,
      plateauCount: 0,
      performanceHistory: [],
      lastPerformance: null,
      ...over,
    };
    const out = applySessionSets(
      ex,
      read([done(ex.weight, 6), done(ex.weight, 6), done(ex.weight, 6)]),
      "recomp",
      false
    );
    return out.weight;
  };
  const curl = {
    exerciseId: "barbell-curl",
    movementCategory: "arms_biceps" as const,
  };

  it("rounds 10% to the lift's step", () => {
    expect(lowersTo({ weight: 100 })).toBe(90);
    expect(lowersTo({ weight: 60 })).toBe(55);
    expect(lowersTo({ ...curl, weight: 20 })).toBe(17.5);
  });

  it("comes down a whole step when 10% rounds to nothing", () => {
    expect(lowersTo({ ...curl, weight: 5 })).toBe(3.75);
  });
});
