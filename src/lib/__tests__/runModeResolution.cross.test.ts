/**
 * Cross-consistency test for the TS + JS copies of the Run9 run-mode / race-goal
 * / recovery state resolution.
 *
 * `runModeResolution` encodes a LOCKED materialization invariant — every write
 * that sets or clears `profile.raceGoal` MUST co-write
 * `profile.runMode = deriveRunMode(raceGoal)` — and it exists as two physical
 * copies: the client `src/features/program/runModeResolution.ts` (the React
 * state machine) and the server `functions/lib/runModeResolution.js` (so the
 * recovery-exit sweep + non-React clients reach the SAME materialized state).
 * Both were tested in isolation; nothing pinned them EQUAL. This closes that
 * gap: identical fixtures through both copies, asserting byte-identical output.
 * Drift fails CI.
 *
 * Same mirror+parity discipline as `performanceEngineParity.cross.test.ts` and
 * `scheduledRunCompletion.cross.test.ts`. If a future refactor adopts a single
 * shared CommonJS source, this test can be deleted in favour of importing it
 * directly.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import * as ts from "@/features/program/runModeResolution";
import type {
  RaceGoal,
  RecoveryContext,
  StarterGoal,
} from "@/features/program/runModeResolution";

const require = createRequire(import.meta.url);
const js = require("../../../functions/lib/runModeResolution") as typeof ts;

// ── Fixtures ─────────────────────────────────
const raceA: RaceGoal = { distance: "marathon", targetDate: "2026-09-01" };
const raceA2: RaceGoal = { distance: "marathon", targetDate: "2026-09-01" }; // same race, distinct object
const raceB: RaceGoal = { distance: "half", targetDate: "2026-07-15" }; // different race, future
const racePast: RaceGoal = { distance: "5k", targetDate: "2026-01-01" }; // different race, past
const TODAY = "2026-06-04";

const raceGoals: (RaceGoal | null | undefined)[] = [
  raceA,
  raceB,
  null,
  undefined,
];

// Run9's starter goal: running, finished, ended by a race, and none.
const starterRunning: StarterGoal = { startedOn: "2026-05-04" };
const starterFinished: StarterGoal = {
  startedOn: "2026-03-02",
  finishedOn: "2026-05-07",
};
const starterEnded: StarterGoal = {
  startedOn: "2026-04-06",
  endedOn: "2026-05-13",
  stage: 4,
};
const starterGoals: (StarterGoal | null | undefined)[] = [
  starterRunning,
  starterFinished,
  starterEnded,
  null,
  undefined,
];

function ctx(
  currentRaceGoal: RaceGoal | null | undefined,
  completedRaceGoal: RaceGoal | null | undefined
): RecoveryContext {
  return { currentRaceGoal, completedRaceGoal };
}

const recoveryContexts: RecoveryContext[] = [
  ctx(raceA, raceA2), // same race → safe to clear
  ctx(raceB, raceA), // newer race set during recovery → keep
  ctx(racePast, raceA), // different (past) race set → keep
  ctx(null, raceA), // raceGoal already gone → freeform
  ctx(undefined, raceA),
  ctx(raceA, null),
  ctx(null, null),
];

describe("runModeResolution — client (.ts) ↔ server (.js) parity", () => {
  it("exposes the same function surface on both copies", () => {
    const names = [
      "deriveRunMode",
      "isSameRace",
      "raceGoalIsCompletedRace",
      "resolveRecoveryExit",
      "newRaceSupersedesRecovery",
      "setRaceGoalPatch",
      "starterGoalIsActive",
      "setStarterGoalPatch",
      "finishStarterGoalPatch",
      "endStarterGoalPatch",
    ] as const;
    for (const n of names) {
      expect(typeof ts[n]).toBe("function");
      expect(typeof js[n]).toBe("function");
    }
  });

  it("deriveRunMode agrees for every race goal", () => {
    for (const g of raceGoals) {
      expect(js.deriveRunMode(g)).toBe(ts.deriveRunMode(g));
    }
  });

  it("deriveRunMode agrees for every race goal beside every starter goal", () => {
    for (const g of raceGoals) {
      for (const starter of starterGoals) {
        expect(js.deriveRunMode(g, starter)).toBe(ts.deriveRunMode(g, starter));
      }
    }
  });

  it("starterGoalIsActive agrees for every starter goal", () => {
    for (const starter of starterGoals) {
      expect(js.starterGoalIsActive(starter)).toBe(
        ts.starterGoalIsActive(starter)
      );
    }
  });

  it("the starter goal's patches are byte-identical", () => {
    expect(js.setStarterGoalPatch(TODAY)).toEqual(
      ts.setStarterGoalPatch(TODAY)
    );
    for (const starter of [starterRunning, starterFinished, starterEnded]) {
      expect(js.finishStarterGoalPatch(starter, TODAY)).toEqual(
        ts.finishStarterGoalPatch(starter, TODAY)
      );
      expect(js.endStarterGoalPatch(starter, TODAY, 6)).toEqual(
        ts.endStarterGoalPatch(starter, TODAY, 6)
      );
    }
  });

  it("isSameRace agrees across the pairwise matrix", () => {
    const all = [raceA, raceA2, raceB, racePast, null, undefined];
    for (const a of all) {
      for (const b of all) {
        expect(js.isSameRace(a, b)).toBe(ts.isSameRace(a, b));
      }
    }
  });

  it("raceGoalIsCompletedRace agrees for every recovery context", () => {
    for (const c of recoveryContexts) {
      expect(js.raceGoalIsCompletedRace(c)).toBe(ts.raceGoalIsCompletedRace(c));
    }
  });

  it("resolveRecoveryExit produces byte-identical patches", () => {
    for (const c of recoveryContexts) {
      expect(js.resolveRecoveryExit(c)).toEqual(ts.resolveRecoveryExit(c));
    }
  });

  it("newRaceSupersedesRecovery agrees across contexts and the date boundary", () => {
    const days = ["2026-06-04", "2026-07-15", "2026-09-01", "2027-01-01"];
    for (const c of recoveryContexts) {
      for (const today of days) {
        expect(js.newRaceSupersedesRecovery(c, today)).toBe(
          ts.newRaceSupersedesRecovery(c, today)
        );
      }
    }
  });

  it("setRaceGoalPatch produces byte-identical patches", () => {
    for (const g of [raceA, raceB, null]) {
      expect(js.setRaceGoalPatch(g)).toEqual(ts.setRaceGoalPatch(g));
    }
  });

  // The locked invariant itself, asserted on values (not just cross-equality)
  // so the test also documents the rule and catches BOTH copies drifting together.
  describe("locked materialization invariant", () => {
    it("every patch carries a materialized runMode", () => {
      for (const c of recoveryContexts) {
        expect(ts.resolveRecoveryExit(c).runMode).toMatch(
          /^(race_prep|freeform)$/
        );
      }
      expect(ts.setRaceGoalPatch(raceA).runMode).toBe("race_prep");
      expect(ts.setRaceGoalPatch(null).runMode).toBe("freeform");
    });

    it("a race goal makes race prep, and without one a running starter makes a starter", () => {
      for (const starter of starterGoals) {
        expect(ts.deriveRunMode(raceA, starter)).toBe("race_prep");
      }
      expect(ts.deriveRunMode(null, starterRunning)).toBe("starter");
      expect(ts.deriveRunMode(undefined, starterFinished)).toBe("freeform");
      expect(ts.deriveRunMode(null, starterEnded)).toBe("freeform");
      expect(ts.deriveRunMode(null)).toBe("freeform");
    });

    it("every starter patch's runMode is the one its goals derive", () => {
      const begun = ts.setStarterGoalPatch(TODAY);
      expect(ts.deriveRunMode(begun.raceGoal, begun.starterGoal)).toBe(
        begun.runMode
      );
      const finished = ts.finishStarterGoalPatch(starterRunning, TODAY);
      expect(ts.deriveRunMode(null, finished.starterGoal)).toBe(
        finished.runMode
      );
      // Ended for a race: the race goal's patch, spread after, sets race prep.
      const replaced = {
        ...ts.endStarterGoalPatch(starterRunning, TODAY, 5),
        ...ts.setRaceGoalPatch(raceB),
      };
      expect(replaced.runMode).toBe(
        ts.deriveRunMode(replaced.raceGoal, replaced.starterGoal)
      );
      expect(replaced.starterGoal).toEqual({
        startedOn: starterRunning.startedOn,
        endedOn: TODAY,
        stage: 5,
      });
    });

    it("recovery exit clears raceGoal ONLY when it still equals the completed race", () => {
      // same race → cleared to freeform
      expect(ts.resolveRecoveryExit(ctx(raceA, raceA2))).toEqual({
        raceGoal: null,
        runMode: "freeform",
      });
      // newer race set during recovery → raceGoal preserved (key omitted), stays race_prep
      const newer = ts.resolveRecoveryExit(ctx(raceB, raceA));
      expect(newer).toEqual({ runMode: "race_prep" });
      expect("raceGoal" in newer).toBe(false);
    });

    it("a new FUTURE race supersedes recovery; the completed race and past races do not", () => {
      expect(ts.newRaceSupersedesRecovery(ctx(raceB, raceA), TODAY)).toBe(true); // future, different
      expect(ts.newRaceSupersedesRecovery(ctx(raceA, raceA2), TODAY)).toBe(
        false
      ); // same race
      expect(ts.newRaceSupersedesRecovery(ctx(racePast, raceA), TODAY)).toBe(
        false
      ); // past race
      expect(ts.newRaceSupersedesRecovery(ctx(null, raceA), TODAY)).toBe(false); // no current race
    });
  });
});
