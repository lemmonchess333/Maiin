/**
 * The plan's retired keys (App1 Q24) are one list on both sides.
 *
 * The server deletes them on every write it makes
 * (`functions/lib/programStateSanitizer.js`), the week's rollover drops them
 * here (`withoutRetiredProgramKeys`), and the strip script removes the
 * stored copies. A key retired on one side only would either be written
 * back every week by the rollover, or kept by the server while the app
 * has forgotten it.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import {
  RETIRED_PROGRAM_STATE_KEYS,
  withoutRetiredProgramKeys,
  type ProgramState,
} from "../programTypes";

const require = createRequire(import.meta.url);
const server =
  require("../../../../functions/lib/programStateSanitizer.js") as {
    RETIRED_PROGRAM_STATE_KEYS: Set<string>;
    sanitizeProgramState: (state: unknown) => {
      value: Record<string, unknown>;
      dropped: string[];
    };
  };

const plan = {
  goal: "recomp",
  currentPhase: "progression",
  weekNumber: 2,
  splitType: "ppl",
  workouts: [],
  updatedAt: 0,
  runDays: [{ id: "r1", dayIndex: 1, templateId: "easy_30" }],
} as unknown as ProgramState;

describe("retired programme keys: client vs functions", () => {
  it("are the same top-level keys", () => {
    expect([...RETIRED_PROGRAM_STATE_KEYS].sort()).toEqual(
      [...server.RETIRED_PROGRAM_STATE_KEYS].sort()
    );
  });

  it("leave a stored plan the same on both sides", () => {
    const stored = {
      ...plan,
      fatigueScore: 3,
      plateauResponses: 1,
      templateId: "ppl_4day",
      recoveringMuscles: ["Chest"],
    } as unknown as ProgramState;
    expect(withoutRetiredProgramKeys(stored)).toEqual(
      server.sanitizeProgramState(stored).value
    );
  });

  it("hand back a plan without them as it was", () => {
    expect(withoutRetiredProgramKeys(plan)).toBe(plan);
  });
});
