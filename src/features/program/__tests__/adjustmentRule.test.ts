import { describe, it, expect } from "vitest";

import {
  countPlateauedExercises,
  recoveryStateFrom,
  resolveAdjustment,
  MIN_WEEKS_FOR_RECOVERY_READ,
  PROGRAMME_PLATEAU_MIN,
  type AdjustmentSignals,
} from "../adjustmentRule";
import type { ProgramExercise, WorkoutDay } from "../programTypes";

/**
 * Backlog #9 (Helms H5) — the joint plateau × recovery rule. Before this,
 * plateau and recovery were both tracked and used INDEPENDENTLY: a plateau
 * rotated a variation, a weak week rendered advisory copy. Nothing connected
 * them, and nothing remembered what had already been tried.
 */

const signals = (o: Partial<AdjustmentSignals> = {}): AdjustmentSignals => ({
  plateauedExercises: PROGRAMME_PLATEAU_MIN,
  recovery: "recovered",
  priorReductions: 0,
  ...o,
});

const day = (plateauCounts: number[]): WorkoutDay =>
  ({
    dayName: "D",
    dayType: "push",
    completed: false,
    skipped: false,
    exercises: plateauCounts.map(
      (plateauCount) => ({ plateauCount }) as ProgramExercise
    ),
  }) as WorkoutDay;

describe("countPlateauedExercises", () => {
  it("counts lifts sitting on a backed-off stall, across days", () => {
    expect(countPlateauedExercises([day([0, 1, 2]), day([0, 0, 3])])).toBe(3);
  });

  it("treats a missing plateauCount as not plateaued", () => {
    const d = { ...day([]), exercises: [{} as ProgramExercise] };
    expect(countPlateauedExercises([d])).toBe(0);
  });

  it("is zero for an empty programme", () => {
    expect(countPlateauedExercises([])).toBe(0);
  });
});

describe("resolveAdjustment — Helms's flowchart", () => {
  it("holds when the programme isn't plateaued", () => {
    for (const recovery of ["recovered", "strained", "unknown"] as const) {
      expect(
        resolveAdjustment(
          signals({ plateauedExercises: PROGRAMME_PLATEAU_MIN - 1, recovery })
        )
      ).toBe("hold");
    }
  });

  it("one stalled lift is noise, not a programme problem", () => {
    // A single stall is already handled by the variation rotation; the
    // flowchart is about a stalled CYCLE.
    expect(resolveAdjustment(signals({ plateauedExercises: 1 }))).toBe("hold");
    expect(resolveAdjustment(signals({ plateauedExercises: 2 }))).not.toBe(
      "hold"
    );
  });

  it("plateaued + recovered → add volume", () => {
    expect(resolveAdjustment(signals({ recovery: "recovered" }))).toBe(
      "add_volume"
    );
  });

  it("plateaued + strained → cut volume the first time", () => {
    expect(
      resolveAdjustment(signals({ recovery: "strained", priorReductions: 0 }))
    ).toBe("reduce_volume");
  });

  it("plateaued + strained AGAIN → reorganize, not another cut", () => {
    // The second-order branch: if a light week didn't fix it, the problem
    // isn't fatigue.
    for (const priorReductions of [1, 2, 5]) {
      expect(
        resolveAdjustment(signals({ recovery: "strained", priorReductions }))
      ).toBe("reorganize");
    }
  });

  it("HOLDS on unknown recovery even when plateaued", () => {
    // The whole reason RecoveryState is three-valued. Adding volume to a
    // lifter we know nothing about is the harmful error, and `unknown` is
    // exactly the cold-start user — the most common state across the user
    // base, not a rare one.
    expect(
      resolveAdjustment(signals({ recovery: "unknown", plateauedExercises: 9 }))
    ).toBe("hold");
    expect(
      resolveAdjustment(signals({ recovery: "unknown", priorReductions: 3 }))
    ).toBe("hold");
  });

  it("is total — every combination maps to exactly one action", () => {
    const actions = new Set<string>();
    for (const plateauedExercises of [0, 1, 2, 7]) {
      for (const recovery of ["recovered", "strained", "unknown"] as const) {
        for (const priorReductions of [0, 1, 4]) {
          const a = resolveAdjustment({
            plateauedExercises,
            recovery,
            priorReductions,
          });
          expect(a).toMatch(/^(hold|add_volume|reduce_volume|reorganize)$/);
          actions.add(a);
        }
      }
    }
    // and every arm of the flowchart is actually reachable
    expect([...actions].sort()).toEqual([
      "add_volume",
      "hold",
      "reduce_volume",
      "reorganize",
    ]);
  });
});

describe("recoveryStateFrom", () => {
  const deep = { lifetimeWeeks: MIN_WEEKS_FOR_RECOVERY_READ };

  it("is unknown with no performance doc at all", () => {
    expect(recoveryStateFrom(null)).toBe("unknown");
    expect(recoveryStateFrom(undefined)).toBe("unknown");
  });

  it("is unknown until the engine has enough baseline to judge", () => {
    // Mirrors performanceEngine's own `bl.weeksUsed >= 3` gate — below it,
    // `deloadRecommended` is hardcoded false, which would otherwise read as
    // "recovered" and ADD volume to a brand-new lifter.
    for (let w = 0; w < MIN_WEEKS_FOR_RECOVERY_READ; w += 1) {
      expect(recoveryStateFrom({ lifetimeWeeks: w, deloadFlag: false })).toBe(
        "unknown"
      );
    }
    expect(recoveryStateFrom({ ...deep, deloadFlag: false })).toBe("recovered");
  });

  it("treats a missing lifetimeWeeks as unknown, not as zero-but-fine", () => {
    expect(recoveryStateFrom({ deloadFlag: false })).toBe("unknown");
  });

  it("either the deload flag or a weak recovery sub-score means strained", () => {
    expect(recoveryStateFrom({ ...deep, deloadFlag: true })).toBe("strained");
    expect(recoveryStateFrom({ ...deep, recoveryWeak: true })).toBe("strained");
    expect(
      recoveryStateFrom({ ...deep, deloadFlag: false, recoveryWeak: false })
    ).toBe("recovered");
  });
});
