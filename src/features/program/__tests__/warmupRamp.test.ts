import { describe, it, expect } from "vitest";

import {
  buildInitialSetLogs,
  warmupRamp,
  warmupTargets,
  toCompletionSetLogs,
  BAR_KG,
} from "../warmupRamp";
import type { ProgramExercise } from "../programTypes";

/**
 * Backlog #12 (P5, spec N7, pattern N11) — the warm-up ramp. Tropos
 * prescribed zero lifting warm-up; the `"warmup"` SetType existed only as a
 * tag a user could apply after the fact.
 */

const ex = (exerciseId: string, weight: number): ProgramExercise =>
  ({
    exerciseId,
    name: exerciseId,
    weight,
    movementCategory: "horizontal_push",
  }) as ProgramExercise;

describe("warmupRamp", () => {
  it("ramps a heavy lift bar → 50% → 70%, descending reps", () => {
    expect(warmupRamp(140)).toEqual([
      { weight: BAR_KG, reps: 10 },
      { weight: 70, reps: 5 },
      { weight: 97.5, reps: 3 },
    ]);
  });

  it("rounds every step to the plate grid", () => {
    for (const w of [63, 87, 112, 145]) {
      for (const s of warmupRamp(w)) {
        expect(s.weight % 2.5, `working ${w}`).toBe(0);
      }
    }
  });

  it("self-scales — a light lift gets fewer rows than a heavy one", () => {
    expect(warmupRamp(30).length).toBeLessThan(warmupRamp(140).length);
  });

  it("gives a light-but-loaded lift the bar rather than nothing", () => {
    // 30kg: no dedicated bar set (below the threshold), and both percentage
    // steps round to at-or-below the bar. It still deserves one warm-up.
    expect(warmupRamp(30)).toEqual([{ weight: BAR_KG, reps: 10 }]);
  });

  it("never emits a step at or above the working weight", () => {
    for (const w of [25, 30, 45, 60, 100, 200]) {
      for (const s of warmupRamp(w)) {
        expect(s.weight, `working ${w}`).toBeLessThan(w);
      }
    }
  });

  it("never emits a step below the bar", () => {
    for (const w of [25, 30, 45, 60, 100, 200]) {
      for (const s of warmupRamp(w)) {
        expect(s.weight, `working ${w}`).toBeGreaterThanOrEqual(BAR_KG);
      }
    }
  });

  it("has nothing to ramp for bodyweight, uncalibrated, or bar-weight lifts", () => {
    expect(warmupRamp(0)).toEqual([]); // bodyweight / uncalibrated
    expect(warmupRamp(BAR_KG)).toEqual([]); // already at the bar
    expect(warmupRamp(15)).toEqual([]); // below the bar
    expect(warmupRamp(Number.NaN)).toEqual([]);
  });

  it("does not impose a 20 kg bar on dumbbell or machine work", () => {
    expect(warmupRamp(22.5, "Dumbbells")).toEqual([
      { weight: 12.5, reps: 5 },
      { weight: 15, reps: 3 },
    ]);
    expect(warmupRamp(22.5, "Machine").some((set) => set.weight === 20)).toBe(
      false
    );
  });

  it("does not ramp a bodyweight movement even if a bad carried load exists", () => {
    expect(warmupRamp(60, "Bodyweight")).toEqual([]);
  });
});

describe("warmupTargets — N7's scoping rule", () => {
  it("ramps the first loaded exercise for a body part, not the later ones", () => {
    // bench and incline-bench are both Chest — only the first warms up.
    expect(
      warmupTargets([ex("bench-press", 100), ex("incline-bench", 60)])
    ).toEqual([true, false]);
  });

  it("ramps each body part independently", () => {
    const out = warmupTargets([
      ex("bench-press", 100), // Chest
      ex("squat", 120), // Quads
      ex("incline-bench", 60), // Chest again
      ex("barbell-row", 70), // Back
    ]);
    expect(out).toEqual([true, true, false, true]);
  });

  it("never ramps a bodyweight or uncalibrated lift", () => {
    expect(warmupTargets([ex("pull-ups", 0), ex("lat-pulldown", 60)])).toEqual([
      false,
      true,
    ]);
  });

  it("a skipped light lift does not consume its body part's ramp", () => {
    // pull-ups (bodyweight) can't ramp, so the lat pulldown after it — same
    // body part — must still get one, or the whole back gets no warm-up.
    const out = warmupTargets([ex("pull-ups", 0), ex("lat-pulldown", 60)]);
    expect(out[1]).toBe(true);
  });

  it("is empty for an empty day", () => {
    expect(warmupTargets([])).toEqual([]);
  });
});

describe("toCompletionSetLogs", () => {
  const s = (type: string, weight: number, completed = true) => ({
    weight,
    reps: 5,
    completed,
    type,
  });

  it("strips warm-ups but keeps every working set", () => {
    expect(
      toCompletionSetLogs([
        [s("warmup", 20), s("warmup", 60), s("working", 100)],
        [s("working", 40), s("failure", 40)],
      ])
    ).toEqual([
      [{ weight: 100, reps: 5, completed: true }],
      [
        { weight: 40, reps: 5, completed: true },
        { weight: 40, reps: 5, completed: true },
      ],
    ]);
  });

  it("strips a COMPLETED warm-up — the case that would corrupt the record", () => {
    // The server sees only {weight, reps, completed} and builds the workout
    // from logs.filter(l => l.completed). A completed warm-up reaching it is
    // indistinguishable from a working set.
    const out = toCompletionSetLogs([
      [s("warmup", 20, true), s("working", 100)],
    ]);
    expect(out[0]).toHaveLength(1);
    expect(out[0][0].weight).toBe(100);
  });

  it("keeps the outer index aligned with day.exercises", () => {
    // The server maps setLogs[i] to day.exercises[i] positionally, so an
    // exercise whose rows are ALL warm-ups must leave an empty array behind,
    // not vanish.
    const out = toCompletionSetLogs([
      [s("warmup", 20)],
      [s("working", 60)],
      [s("working", 80)],
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual([]);
    expect(out[1][0].weight).toBe(60);
  });

  it("drops the type field — it is not part of the command contract", () => {
    const out = toCompletionSetLogs([[s("working", 60)]]);
    expect(Object.keys(out[0][0]).sort()).toEqual([
      "completed",
      "reps",
      "weight",
    ]);
  });
});

describe("buildInitialSetLogs", () => {
  it("restores the same warm-up and working rows when a session starts fresh", () => {
    const bench = {
      ...ex("bench-press", 100),
      sets: 3,
      reps: 5,
    };
    const logs = buildInitialSetLogs([bench]);
    expect(logs[0].filter((set) => set.type === "warmup")).toHaveLength(3);
    expect(logs[0].filter((set) => set.type === "working")).toHaveLength(3);
  });
});
