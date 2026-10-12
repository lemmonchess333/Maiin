import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

/* The server's race-day decisions, required from outside functions/ the way
   the training simulator reads them: functions/index.js needs firebase-admin
   initialised to load, functions/lib/raceReconciliation.js needs nothing.
   The rules themselves are pinned in functions/__tests__/. */

const require = createRequire(import.meta.url);
const server = require("../../../../functions/lib/raceReconciliation") as {
  decideRecoveryEntry: (
    profile: unknown,
    programState: unknown,
    savedRun: unknown
  ) => { write: boolean; recoveryEndDate?: string };
  decideReconciliationActions: (
    profile: unknown,
    programState: unknown,
    savedRunsForRaceDate: unknown[],
    nowMs: number
  ) => { noShowWritten: boolean };
};

const profile = { runMode: "race_prep" };
const programState = {
  runPlan: {
    mode: "race_prep",
    raceGoal: { distance: "5k", targetDate: "2026-11-01" },
  },
  runDays: [
    {
      id: "runday_race",
      date: "2026-11-01",
      dayIndex: 0,
      templateId: "5k_race",
      type: "race",
      status: "planned",
    },
  ],
};

describe("the server's race-day decisions, outside functions/", () => {
  it("enter recovery on a race-distance run on race day", () => {
    expect(
      server.decideRecoveryEntry(profile, programState, {
        date: "2026-11-01",
        distance: 5000,
      })
    ).toMatchObject({ write: true, recoveryEndDate: "2026-11-08" });
  });

  it("mark a race with no run a no-show four days on", () => {
    expect(
      server.decideReconciliationActions(
        profile,
        programState,
        [],
        Date.UTC(2026, 10, 5, 4)
      ).noShowWritten
    ).toBe(true);
  });
});
