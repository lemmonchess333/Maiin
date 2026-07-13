import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { applyProgression as clientApplyProgression } from "@/features/program/programEngine";
import type { Goal, ProgramExercise } from "@/features/program/programTypes";

/**
 * Progression parity pin (packet 18): functions/lib/progressionEngine.js is a
 * TS↔JS equality mirror of programEngine.ts applyProgression (the CF reducer
 * runs logExercise server-side). This runs BOTH engines over a broad input
 * matrix and asserts identical output, excluding only the informational
 * performanceHistory[].date stamp (clock-derived on each side). Any divergence
 * — a rule changed on one side and not the other — fails CI.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/progressionEngine") as {
  applyProgression: (
    exercise: ProgramExercise,
    actualReps: number,
    actualWeight: number,
    goal: Goal,
    microloading: boolean,
    actualRpe?: number,
    now?: number
  ) => ProgramExercise;
};

const NOW = Date.parse("2026-07-13T12:00:00Z");

function makeExercise(overrides: Record<string, unknown>): ProgramExercise {
  return {
    name: "X",
    exerciseId: "barbell-bench-press",
    instanceId: "i1",
    movementCategory: "horizontalPush",
    sets: 3,
    reps: 8,
    baseReps: 8,
    weight: 100,
    progressionType: "linear",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    ...overrides,
  } as unknown as ProgramExercise;
}

// Strip the clock-derived date so client(local) vs server(UTC) don't flake.
function strip(e: ProgramExercise): ProgramExercise {
  return {
    ...e,
    performanceHistory: (e.performanceHistory || []).map((r) => {
      const rec = r as unknown as Record<string, unknown>;
      const { date: _date, ...rest } = rec;
      void _date;
      return rest;
    }),
  } as unknown as ProgramExercise;
}

describe("applyProgression CF ↔ client parity", () => {
  it("produces identical output across the input matrix", () => {
    const ids = ["barbell-bench-press", "pull-ups"]; // weighted + bodyweight
    const progressionTypes = ["linear", "double"] as const;
    const weights = [0, 100];
    const failures = [0, 2];
    const goals: Goal[] = ["lean bulk", "cut"];
    const actualRepsSet = [6, 8, 10];
    const actualWeightSet = [95, 100, 105];
    const micros = [true, false];
    const rpes: Array<number | undefined> = [undefined, 8, 9.5];

    let compared = 0;
    for (const exerciseId of ids) {
      for (const progressionType of progressionTypes) {
        for (const weight of weights) {
          for (const consecutiveFailures of failures) {
            for (const goal of goals) {
              for (const actualReps of actualRepsSet) {
                for (const actualWeight of actualWeightSet) {
                  for (const microloading of micros) {
                    for (const actualRpe of rpes) {
                      const base = makeExercise({
                        exerciseId,
                        progressionType,
                        weight,
                        consecutiveFailures,
                      });
                      const clientOut = clientApplyProgression(
                        makeExercise({
                          exerciseId,
                          progressionType,
                          weight,
                          consecutiveFailures,
                        }),
                        actualReps,
                        actualWeight,
                        goal,
                        microloading,
                        actualRpe
                      );
                      const cfOut = cf.applyProgression(
                        base,
                        actualReps,
                        actualWeight,
                        goal,
                        microloading,
                        actualRpe,
                        NOW
                      );
                      expect(
                        strip(cfOut),
                        `mismatch for ${JSON.stringify({
                          exerciseId,
                          progressionType,
                          weight,
                          consecutiveFailures,
                          goal,
                          actualReps,
                          actualWeight,
                          microloading,
                          actualRpe,
                        })}`
                      ).toEqual(strip(clientOut));
                      compared += 1;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it("stamps a valid UTC yyyy-MM-dd date on the CF record", () => {
    const out = cf.applyProgression(
      makeExercise({}),
      8,
      100,
      "cut",
      true,
      undefined,
      NOW
    );
    const last = out.performanceHistory[out.performanceHistory.length - 1] as {
      date: string;
    };
    expect(last.date).toBe("2026-07-13");
  });
});
