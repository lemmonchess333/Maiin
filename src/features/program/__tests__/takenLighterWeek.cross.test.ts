/**
 * A lighter week the person takes from Train is the server's
 * `applyDeloadWeek` command, and the week after it is the client's rollover
 * (`advanceWeek`), which reads the command's snapshot of the week to
 * restart the calendar's count (Lift4 (9)). Run here end to end, the
 * server's reducer feeding the client's rollover, so a change to either
 * side's half of the handshake shows.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { advanceWeek, generateProgram } from "../programEngine";
import type { ProgramState } from "../programTypes";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/programCommands") as {
  applyProgramCommand: (args: {
    state: unknown;
    profile: unknown;
    command: unknown;
    now: number;
  }) => { state: ProgramState };
};

const trained = (state: ProgramState): ProgramState => ({
  ...state,
  workouts: state.workouts.map((d) => ({ ...d, completed: true })),
});

describe("a lighter week taken from Train, then the rollovers", () => {
  it("brings the next calendar one four trained weeks later", () => {
    const { workouts } = generateProgram(3, undefined, "hypertrophy");
    const week2 = {
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 2,
      splitType: "full_body",
      workouts,
      weekHistory: [],
      fatigueScore: 0,
      updatedAt: 0,
    } as unknown as ProgramState;
    let state = server.applyProgramCommand({
      state: week2,
      profile: {},
      command: {
        kind: "applyDeloadWeek",
        commandId: "cross-taken-lighter-0001",
        expectedWeekNumber: 2,
      },
      now: 1_760_000_000_000,
    }).state;
    expect(state.currentPhase).toBe("deload");
    const lighter: number[] = [];
    for (let k = 1; k <= 8; k++) {
      state = advanceWeek(trained(state), "intermediate");
      if (state.currentPhase === "deload") lighter.push(k);
    }
    // Weeks 6 and 10 of the plan, counting the taken one as week 2.
    expect(lighter).toEqual([4, 8]);
  });
});
