import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import {
  estimateLiftBurn as clientEstimate,
  selectLiftMET as clientSelectMET,
} from "@/lib/workoutBurn";

/**
 * Calorie-engine parity pin (packet 18): functions/lib/workoutBurn.js mirrors
 * src/lib/workoutBurn.ts (estimateLiftBurn / selectLiftMET). completeWorkoutDay
 * computes the saved workout's totalCalories server-side, so it must equal what
 * the client would have written. Runs both over an input matrix and asserts
 * identical output.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/workoutBurn") as {
  estimateLiftBurn: (p: {
    durationMinutes: number;
    tonnageKg: number;
    bodyweightKg: number;
    completedSetCount: number;
  }) => number;
  selectLiftMET: (tonnageKg: number, durationMinutes: number) => number;
};

describe("workoutBurn CF ↔ client parity", () => {
  it("selectLiftMET agrees across densities", () => {
    const tonnages = [0, 100, 3600, 9000, 20000];
    const durations = [0, 10, 45, 60, 120];
    for (const t of tonnages) {
      for (const d of durations) {
        expect(cf.selectLiftMET(t, d)).toBe(clientSelectMET(t, d));
      }
    }
  });

  it("estimateLiftBurn agrees across the input matrix", () => {
    const durations = [0, 20, 45, 90];
    const tonnages = [0, 500, 2200, 12000];
    const bodyweights = [0, 60, 80, 110];
    const setCounts = [0, 3, 12, 30];
    let compared = 0;
    for (const durationMinutes of durations) {
      for (const tonnageKg of tonnages) {
        for (const bodyweightKg of bodyweights) {
          for (const completedSetCount of setCounts) {
            const params = {
              durationMinutes,
              tonnageKg,
              bodyweightKg,
              completedSetCount,
            };
            expect(
              cf.estimateLiftBurn(params),
              `mismatch for ${JSON.stringify(params)}`
            ).toBe(clientEstimate(params));
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });
});
