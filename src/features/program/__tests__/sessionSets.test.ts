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
import { effortCueFor } from "../effortCue";
import { loadGridFor } from "../loadSteps";
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
    expect(sessionOutcome(out, plan)).toBe("step");
  });

  it("is null when no working set was done", () => {
    expect(readSessionSets([done(40, 5, "warmup")], 3)).toBeNull();
  });
});

describe("sessionOutcome — what the sets earned (Lift4)", () => {
  it("steps when two or more sets all reach the target", () => {
    expect(sessionOutcome(read([done(60, 8), done(60, 9)]), plan)).toBe("step");
  });

  it("holds on one set of a plan with more", () => {
    expect(sessionOutcome(read([done(60, 8)]), plan)).toBe("hold");
  });

  it("steps on the one set of a one-set plan", () => {
    expect(sessionOutcome(read([done(60, 8)], 1), { ...plan, sets: 1 })).toBe(
      "step"
    );
  });

  // The lock's own examples, on a 3 × 8 target.
  it("8, 7, 6 is a miss; 9, 8, 7 is not", () => {
    expect(
      sessionOutcome(read([done(60, 8), done(60, 7), done(60, 6)]), plan)
    ).toBe("miss");
    expect(
      sessionOutcome(read([done(60, 9), done(60, 8), done(60, 7)]), plan)
    ).toBe("hold");
  });

  it("judges a miss on the sets done", () => {
    expect(sessionOutcome(read([done(60, 6)]), plan)).toBe("miss");
  });

  it("never counts a miss at a weight other than the plan's", () => {
    expect(
      sessionOutcome(read([done(55, 6), done(55, 6), done(55, 6)]), plan)
    ).toBe("hold");
  });

  it("steps from a different weight when every set reaches the target", () => {
    expect(
      sessionOutcome(read([done(65, 8), done(65, 8), done(65, 8)]), plan)
    ).toBe("step");
  });

  it("judges a climbing lift at the bottom of its range", () => {
    // At 10 of an 8–12 range, 9s have not missed anything: the climb holds.
    const climbing = { weight: 60, reps: 10, sets: 3, baseReps: 8 };
    expect(
      sessionOutcome(read([done(60, 9), done(60, 9), done(60, 9)]), climbing)
    ).toBe("hold");
    expect(
      sessionOutcome(read([done(60, 7), done(60, 7), done(60, 7)]), climbing)
    ).toBe("miss");
  });

  it("judges a target climbed past its range at the range's bottom too", () => {
    // 3 × 18 on a 12–15 range: the next weight was too big a step, so the
    // reps past 15 are a climb, and 17s, or 14s, are not a miss.
    const stretched = { weight: 10, reps: 18, sets: 3, baseReps: 12 };
    expect(
      sessionOutcome(
        read([done(10, 17), done(10, 17), done(10, 17)]),
        stretched
      )
    ).toBe("hold");
    expect(
      sessionOutcome(
        read([done(10, 14), done(10, 14), done(10, 14)]),
        stretched
      )
    ).toBe("hold");
    expect(
      sessionOutcome(
        read([done(10, 11), done(10, 11), done(10, 11)]),
        stretched
      )
    ).toBe("miss");
    // A fixed target, stretched: judged at the target it was.
    const fixed = { weight: 15, reps: 8, sets: 3, baseReps: 5 };
    expect(
      sessionOutcome(read([done(15, 6), done(15, 6), done(15, 6)]), fixed)
    ).toBe("hold");
  });

  it("steps a bodyweight lift at any load added, none included, as any weight (Pgm8 L6)", () => {
    // The plan follows a bodyweight lift's added load like any weight, so
    // the target met at less of it is a step from what was lifted. It was a
    // hold: the plan didn't follow the load, so it asked for the plan's.
    const loaded = { weight: 10, reps: 8, sets: 3 };
    expect(sessionOutcome(read([done(0, 8), done(0, 8)]), loaded)).toBe("step");
    expect(sessionOutcome(read([done(5, 8), done(5, 8)]), loaded)).toBe("step");
    expect(sessionOutcome(read([done(10, 8), done(10, 8)]), loaded)).toBe(
      "step"
    );
    // A miss is at the load the plan asked for, as for any weight.
    expect(sessionOutcome(read([done(10, 6), done(10, 6)]), loaded)).toBe(
      "miss"
    );
    expect(sessionOutcome(read([done(0, 6), done(0, 6)]), loaded)).toBe("hold");
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
    applySessionSets(ex, read(sets, ex.sets), false);

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

  it("starts a heavier weight's reps from the bottom again", () => {
    // 10 reps was the target climbed at 60 kg; 65 kg starts from 8.
    const out = apply(bench({ reps: 10 }), [
      done(65, 9),
      done(65, 9),
      done(65, 8),
    ]);
    expect(out.weight).toBe(65);
    expect(out.reps).toBe(8);
    // A lighter one keeps the target: the climb is still the plan's.
    expect(apply(bench({ reps: 10 }), [done(55, 9), done(55, 9)]).reps).toBe(
      10
    );
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
    // Back at 100, the usual rules: every set at the target is a step.
    expect(seen[4]).toBe(102.5);
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
    // 6, 5, 4 is a hold: the usual rules keep 90, where a climb would step.
    const out = session(front, 90, [6, 5, 4]);
    expect(out.weight).toBe(90);
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
    expect(lowersTo({ ...curl, weight: 10 })).toBe(7.5);
  });
});

describe("RPE autoregulation — final push-set exemption and re-climb gate", () => {
  const makeEx = (over: Partial<ProgramExercise> = {}): ProgramExercise => ({
    name: "Dumbbell Curl",
    exerciseId: "db-curl",
    movementCategory: "arms_biceps",
    isAccessory: true,
    sets: 3,
    reps: 10,
    baseReps: 10,
    repRangeMax: 12,
    weight: 12,
    progressionType: "double",
    lastSuccessfulWeight: 12,
    lastAttemptedWeight: 12,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...over,
  });

  it("allows an isolation coached to push its final set to progress when only the last set hits RPE 10", () => {
    const curl = makeEx();
    const sets = read([
      done(12, 10, "working", 8),
      done(12, 10, "working", 8.5),
      done(12, 10, "working", 10),
    ]);
    expect(hardestEffort(sets)).toBe(10);
    expect(hardestEffort(sets, { exemptLastSet: true })).toBe(8.5);

    const next = applySessionSets(curl, sets, false);
    expect(next.reps).toBe(11);
  });

  /* Lift4 STATUS 2026-11-28 (owner): clause (6) gives way to clause (5).
     Every set at its target, effort 10 on the last set only, as the push
     cue invites: the weight goes up a step and the reps go back to the
     bottom of the range. The tests around this one pin the reps climbing;
     these pin the step itself, which a print showed frozen for six
     sessions before #3590. */
  it("puts the weight up when every set is at the top of the range and only the last set is at effort 10", () => {
    const curl = makeEx({ reps: 12 });
    const next = applySessionSets(
      curl,
      read([
        done(12, 12, "working", 8),
        done(12, 12, "working", 8),
        done(12, 12, "working", 10),
      ]),
      false
    );
    expect(next.weight).toBeGreaterThan(12);
    expect(next.weight).toBe(loadGridFor("db-curl", false).above(12));
    expect(next.reps).toBe(10);
  });

  it("walks a machine lift up its range, then up its stack, with effort 10 on every last set", () => {
    let pulldown = makeEx({
      name: "Lat Pulldown",
      exerciseId: "lat-pulldown",
      movementCategory: "vertical_pull",
      reps: 8,
      baseReps: 8,
      repRangeMax: 12,
      weight: 45,
      lastSuccessfulWeight: 45,
      lastAttemptedWeight: 45,
    });
    // The lift the screen tells to go to the limit on its last set.
    expect(
      effortCueFor(pulldown, { isLastSet: true, deloadWeek: false })?.kind
    ).toBe("push");
    const seen: string[] = [];
    for (let session = 0; session < 6; session += 1) {
      const { weight, reps } = pulldown;
      seen.push(`${String(weight)} x ${String(reps)}`);
      pulldown = applySessionSets(
        pulldown,
        read([
          done(weight, reps, "working", 8),
          done(weight, reps, "working", 8),
          done(weight, reps, "working", 10),
        ]),
        false
      );
    }
    const step = loadGridFor("lat-pulldown", false).above(45);
    expect(step).toBeGreaterThan(45);
    expect(seen).toEqual([
      "45 x 8",
      "45 x 9",
      "45 x 10",
      "45 x 11",
      "45 x 12",
      `${String(step)} x 8`,
    ]);
  });

  it("still holds a lift with the push cue when every set, the last included, is at 9.5", () => {
    const curl = makeEx({ reps: 12 });
    const next = applySessionSets(
      curl,
      read([
        done(12, 12, "working", 9.5),
        done(12, 12, "working", 9.5),
        done(12, 12, "working", 9.5),
      ]),
      false
    );
    expect(next.weight).toBe(12);
    expect(next.reps).toBe(12);
  });

  it("still holds an isolation when an earlier non-final set redlines at RPE 9.5+", () => {
    const curl = makeEx();
    const sets = read([
      done(12, 10, "working", 9.5),
      done(12, 10, "working", 9),
      done(12, 10, "working", 10),
    ]);
    const next = applySessionSets(curl, sets, false);
    expect(next.reps).toBe(10);
    expect(next.weight).toBe(12);
  });

  it("allows a machine compound accessory coached to push its final set to progress at RPE 10", () => {
    const legPress = makeEx({
      name: "Leg Press",
      exerciseId: "leg-press",
      movementCategory: "knee_dominant",
      isAccessory: true,
      weight: 100,
    });
    const sets = read([
      done(100, 10, "working", 8),
      done(100, 10, "working", 8.5),
      done(100, 10, "working", 10),
    ]);
    const next = applySessionSets(legPress, sets, false);
    expect(next.reps).toBe(11);
  });

  it("still holds a free-weight main compound when the final set hits RPE 9.5+", () => {
    const squat = makeEx({
      name: "Back Squat",
      exerciseId: "squat",
      movementCategory: "knee_dominant",
      isAccessory: false,
      weight: 100,
      reps: 5,
      baseReps: 5,
      repRangeMax: undefined,
      progressionType: "linear",
    });
    const sets = read([
      done(100, 5, "working", 8),
      done(100, 5, "working", 8.5),
      done(100, 5, "working", 9.5),
    ]);
    const next = applySessionSets(squat, sets, false);
    expect(next.weight).toBe(100);
  });

  it("gates lowered-lift re-climb on RPE so grinding RPE 9.5+ at a lowered weight holds instead of jumping up", () => {
    const loweredSquat = makeEx({
      name: "Back Squat",
      exerciseId: "squat",
      movementCategory: "knee_dominant",
      isAccessory: false,
      weight: 90,
      reps: 5,
      baseReps: 5,
      repRangeMax: undefined,
      progressionType: "linear",
      lowered: { exerciseId: "squat", from: 100, unit: "kg", target: 5 },
    });

    const grinding = applySessionSets(
      loweredSquat,
      read([
        done(90, 5, "working", 9),
        done(90, 5, "working", 9.5),
        done(90, 5, "working", 10),
      ]),
      false
    );
    expect(grinding.weight).toBe(90);
    expect(grinding.lowered).toMatchObject({ from: 100, shown: true });

    const clean = applySessionSets(
      grinding,
      read([
        done(90, 5, "working", 7.5),
        done(90, 5, "working", 8),
        done(90, 5, "working", 8),
      ]),
      false
    );
    expect(clean.weight).toBe(92.5);
  });
});
