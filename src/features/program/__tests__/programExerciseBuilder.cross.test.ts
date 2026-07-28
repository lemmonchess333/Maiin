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
    // The optional prescription fields, added client-side by P1 (repRangeMax /
    // restSeconds / isAccessory) and #5 (baseSets / preDeloadWeight). Both
    // copies rebuild the object field-by-field, so an un-mirrored carry is a
    // SILENT strip — and this matrix not varying them is why the drift sat
    // unpinned. Backlog #7 made it consequential: isAccessory now picks the
    // load step, so dropping it re-prices every isolation as a compound.
    const extrasSet: Array<Record<string, unknown>> = [
      {},
      { repRangeMax: 12 },
      { baseSets: 4 },
      { preDeloadWeight: 55 },
      { preDeloadReps: 10 },
      { restSeconds: 90 },
      { isAccessory: true },
      { isAccessory: false },
      {
        repRangeMax: 15,
        baseSets: 3,
        preDeloadWeight: 40,
        restSeconds: 60,
        isAccessory: true,
      },
    ];

    let compared = 0;
    for (const [name, exerciseId] of names) {
      for (const sets of setsSet) {
        for (const reps of repsSet) {
          for (const weight of weightSet) {
            for (const notes of notesSet) {
              for (const extras of extrasSet) {
                const input: Record<string, unknown> = {
                  name,
                  exerciseId,
                  instanceId: "fixed-inst-1",
                  ...extras,
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
    }
    expect(compared).toBeGreaterThan(100);
  });

  it("requires a stable instanceId (server never invents one)", () => {
    expect(() =>
      cf.buildProgramExercise({ name: "Bench", exerciseId: "bench-press" })
    ).toThrow(/instanceId/);
  });
});
