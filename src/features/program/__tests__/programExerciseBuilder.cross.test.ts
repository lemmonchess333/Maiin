import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { normalizeExercise } from "@/features/program/programTypes";

/**
 * ProgramExercise builder parity pin (packet 18): functions/lib/
 * programExerciseBuilder.js mirrors the client normalizeExercise (the CF
 * reducer builds added/replaced exercises with it). With a fixed instanceId
 * passed to both, output MUST be identical. Runs a matrix of names + optional
 * prescription fields.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/programExerciseBuilder") as {
  buildProgramExercise: (
    ex: Record<string, unknown>
  ) => Record<string, unknown>;
};

describe("buildProgramExercise CF ↔ client normalizeExercise parity", () => {
  it("produces identical output with a fixed instanceId", () => {
    const names: Array<[string, string]> = [
      ["Bench Press", "bench-press"],
      ["Romanian Deadlift", "romanian-deadlift"],
      ["Weighted Pull-Up", "pull-ups"],
      ["Cable Row", "cable-row"],
      ["Tricep Pushdown", "tricep-pushdown"],
      ["Unknown Thing", "mystery-move"],
    ];
    const setsSet = [undefined, 3, 4];
    const repsSet = [undefined, 8, 10];
    const weightSet = [undefined, 0, 60];
    const notesSet = [undefined, "keep chest up"];

    let compared = 0;
    for (const [name, exerciseId] of names) {
      for (const sets of setsSet) {
        for (const reps of repsSet) {
          for (const weight of weightSet) {
            for (const notes of notesSet) {
              const input: Record<string, unknown> = {
                name,
                exerciseId,
                instanceId: "fixed-inst-1",
              };
              if (sets !== undefined) input.sets = sets;
              if (reps !== undefined) input.reps = reps;
              if (weight !== undefined) input.weight = weight;
              if (notes !== undefined) input.notes = notes;

              const clientOut = normalizeExercise(
                input as Parameters<typeof normalizeExercise>[0]
              );
              const cfOut = cf.buildProgramExercise({ ...input });
              expect(cfOut, `mismatch for ${JSON.stringify(input)}`).toEqual(
                clientOut as unknown as Record<string, unknown>
              );
              compared += 1;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it("requires a stable instanceId (server never invents one)", () => {
    expect(() =>
      cf.buildProgramExercise({ name: "Bench", exerciseId: "bench-press" })
    ).toThrow(/instanceId/);
  });
});
