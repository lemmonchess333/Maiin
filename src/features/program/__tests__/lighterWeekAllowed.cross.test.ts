/**
 * Train offers "Take a lighter week" from its menu and from the
 * Performance Index's banner (`shouldSuggestDeload`) only where
 * `lighterWeekAllowed` says one can be taken, and either tap sends
 * `applyDeloadWeek`. Here the client's gate is pinned to the server's
 * preconditions: an offer the server refuses tells the person no to the
 * app's own suggestion, which the banner did until it asked the gate.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import type { ProgramState } from "../programTypes";
import { lighterWeekAllowed } from "../weekPrescription";

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/programCommands") as {
  applyProgramCommand: (args: {
    state: unknown;
    profile: unknown;
    command: unknown;
    now: number;
  }) => unknown;
};

const WEEK: ProgramState = {
  weekNumber: 5,
  currentPhase: "progression",
  workouts: [{ dayName: "Upper", exercises: [] }],
  weekHistory: [],
} as unknown as ProgramState;

const STATES: [string, ProgramState][] = [
  ["an ordinary week", WEEK],
  ["a lighter week", { ...WEEK, currentPhase: "deload" }],
  [
    "the week straight after one",
    {
      ...WEEK,
      weekHistory: [{ weekNumber: 4, workouts: [], lighter: true }],
    },
  ],
  ["a first week back", { ...WEEK, easingBack: { weeksLeft: 2 } }],
  ["the second week back", { ...WEEK, easingBack: { weeksLeft: 1 } }],
];

function serverTakes(state: ProgramState): boolean {
  try {
    server.applyProgramCommand({
      state,
      profile: {},
      command: {
        kind: "applyDeloadWeek",
        commandId: "cross-lighter-week-0001",
        expectedWeekNumber: state.weekNumber,
      },
      now: 1_760_000_000_000,
    });
    return true;
  } catch {
    return false;
  }
}

describe("a lighter week is offered exactly where the server takes one", () => {
  it.each(STATES)("%s", (_, state) => {
    expect(lighterWeekAllowed(state)).toBe(serverTakes(state));
  });

  it("holds both answers, so it can't pass by agreeing on one", () => {
    const answers = new Set(STATES.map(([, state]) => serverTakes(state)));
    expect([...answers].sort()).toEqual([false, true]);
  });
});
