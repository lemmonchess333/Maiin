/**
 * Cross-consistency test for the TS + JS copies of v7 plan-payload validation.
 *
 *   - client preflight `src/features/program/planBuilder.ts:validatePlanOutput`
 *     (throws on the first problem — fast inline UX error before the round-trip)
 *   - server gate `functions/lib/validatePlanPayload.js:validatePlanPayload`
 *     (returns an error[]; authoritative — rejects before any Firestore write)
 *
 * The file headers promise "two callers, one contract", but nothing pinned the
 * two. A drift means the client preflight passes a payload the server then
 * rejects — the user hits a confusing server error instead of a fast inline one.
 *
 * SHARED CONTRACT (both must agree — pinned here): weekSchedule shape + type
 * vocabulary + day===i, runDays field presence + date format + status
 * vocabulary + no-UTC-`T` leakage, and the race_prep invariant (requires BOTH
 * profile.raceGoal AND programState.runPlan.raceGoal). The runPlan.raceGoal arm
 * was a genuine client gap until planBuilder.ts was aligned alongside this test.
 *
 * JUSTIFIED ASYMMETRY (NOT drift — asserted as server-only, documented): the
 * server also validates `runMode` vocabulary, `weekScheduleVersion` is a
 * number, and the object-shape of profileData/programState. The client receives
 * a *typed* `PlanBuilderOutput` (runMode: RunMode, weekScheduleVersion: number,
 * objects guaranteed), so re-checking those would be re-validating what the
 * compiler already proves — the server checks them only because it validates
 * untyped wire JSON. Same shape as the runEligibility server-only null-guard.
 *
 * Adapter note: the two copies take different argument shapes (client
 * `{ programState, weekSchedule, profileUpdates }` vs server
 * `{ profileData, programState, weekSchedule }`) and different return contracts
 * (throw vs error[]); the helpers below normalise both to a boolean `rejects`.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { validatePlanOutput } from "@/features/program/planBuilder";
import type { PlanBuilderOutput } from "@/features/program/planBuilder";
import { CURRENT_PROGRAM_SCHEMA_VERSION } from "@/features/program/programTypes";

const require = createRequire(import.meta.url);
const js = require("../../../../functions/lib/validatePlanPayload") as {
  validatePlanPayload: (a: {
    profileData: unknown;
    programState: unknown;
    weekSchedule: unknown;
  }) => string[];
};

// A "scenario" is the logical payload; the adapters fan it out to each copy's
// argument shape (client reads profileUpdates, server reads profileData — same
// object).
interface Scenario {
  profile: Record<string, unknown>;
  programState: Record<string, unknown>;
  weekSchedule: unknown;
}

function clientRejects(s: Scenario): boolean {
  try {
    validatePlanOutput({
      programState: s.programState,
      weekSchedule: s.weekSchedule,
      profileUpdates: s.profile,
    } as unknown as PlanBuilderOutput);
    return false;
  } catch {
    return true;
  }
}

function serverRejects(s: Scenario): boolean {
  return (
    js.validatePlanPayload({
      profileData: s.profile,
      programState: s.programState,
      weekSchedule: s.weekSchedule,
    }).length > 0
  );
}

const validWeekSchedule = Array.from({ length: 7 }, (_, i) => ({
  day: i,
  type: "rest" as const,
}));
const validRunDay = {
  id: "rd1",
  date: "2026-06-15",
  weekKey: "2026-06-15",
  templateId: "easy_30",
  status: "planned",
};
const raceGoal = { distance: "marathon", targetDate: "2026-09-01" };

function freeformBase(): Scenario {
  return {
    profile: { weekScheduleVersion: 1, runMode: "freeform" },
    programState: {
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [],
    },
    weekSchedule: validWeekSchedule,
  };
}
function racePrepBase(): Scenario {
  return {
    profile: { weekScheduleVersion: 1, runMode: "race_prep", raceGoal },
    programState: {
      programSchemaVersion: CURRENT_PROGRAM_SCHEMA_VERSION,
      runDays: [validRunDay],
      runPlan: { raceGoal },
    },
    weekSchedule: validWeekSchedule,
  };
}

// Deep clone so per-scenario mutations don't leak between cases.
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

// Each scenario should produce the SAME accept/reject verdict on both copies.
const PARITY: Array<{ name: string; build: () => Scenario }> = [
  { name: "valid freeform plan", build: freeformBase },
  { name: "valid race-prep plan", build: racePrepBase },
  {
    name: "weekSchedule wrong length",
    build: () => {
      const s = freeformBase();
      s.weekSchedule = validWeekSchedule.slice(0, 6);
      return s;
    },
  },
  {
    name: "weekSchedule invalid type",
    build: () => {
      const s = clone(freeformBase());
      (s.weekSchedule as { type: string }[])[2].type = "yoga";
      return s;
    },
  },
  {
    name: "weekSchedule day mismatch",
    build: () => {
      const s = clone(freeformBase());
      (s.weekSchedule as { day: number }[])[3].day = 5;
      return s;
    },
  },
  {
    name: "runDay missing id",
    build: () => {
      const s = racePrepBase();
      const rd = clone(validRunDay) as Record<string, unknown>;
      delete rd.id;
      s.programState.runDays = [rd];
      return s;
    },
  },
  {
    name: "runDay bad date format",
    build: () => {
      const s = racePrepBase();
      s.programState.runDays = [{ ...validRunDay, date: "2026/06/15" }];
      return s;
    },
  },
  {
    name: "runDay invalid status",
    build: () => {
      const s = racePrepBase();
      s.programState.runDays = [{ ...validRunDay, status: "moved" }];
      return s;
    },
  },
  {
    name: "runDay weekKey has UTC T",
    build: () => {
      const s = racePrepBase();
      s.programState.runDays = [
        { ...validRunDay, weekKey: "2026-06-15T00:00" },
      ];
      return s;
    },
  },
  {
    name: "race_prep missing profile.raceGoal",
    build: () => {
      const s = racePrepBase();
      delete s.profile.raceGoal;
      return s;
    },
  },
  {
    name: "race_prep missing runPlan.raceGoal (the newly-aligned arm)",
    build: () => {
      const s = racePrepBase();
      s.programState.runPlan = {}; // runPlan present but no raceGoal
      return s;
    },
  },
  {
    name: "race_prep missing runPlan entirely",
    build: () => {
      const s = racePrepBase();
      delete s.programState.runPlan;
      return s;
    },
  },
];

describe("plan-payload validation — client (.ts) ↔ server (.js) parity", () => {
  it("both copies expose the validator", () => {
    expect(typeof validatePlanOutput).toBe("function");
    expect(typeof js.validatePlanPayload).toBe("function");
  });

  it("agrees on accept/reject for every shared-contract scenario", () => {
    for (const { name, build } of PARITY) {
      const s = build();
      const c = clientRejects(s);
      const v = serverRejects(s);
      expect(
        c,
        `divergence on "${name}": client rejects=${c} server rejects=${v}`
      ).toBe(v);
    }
  });

  it("the bases are genuinely accepted by both (not vacuously equal)", () => {
    expect(clientRejects(freeformBase())).toBe(false);
    expect(serverRejects(freeformBase())).toBe(false);
    expect(clientRejects(racePrepBase())).toBe(false);
    expect(serverRejects(racePrepBase())).toBe(false);
  });

  // Server-only checks — JUSTIFIED by the type boundary, not drift. The server
  // validates untyped wire JSON; the client's typed PlanBuilderOutput already
  // guarantees these, so it intentionally doesn't re-check them.
  describe("server-only checks (client relies on the type system)", () => {
    it("server rejects an invalid runMode vocabulary", () => {
      const s = freeformBase();
      s.profile.runMode = "banana";
      expect(serverRejects(s)).toBe(true);
    });
    it("server rejects a missing/non-number weekScheduleVersion", () => {
      const s = freeformBase();
      delete s.profile.weekScheduleVersion;
      expect(serverRejects(s)).toBe(true);
    });
    it("server rejects a non-object programState (shape gate)", () => {
      expect(
        js.validatePlanPayload({
          profileData: { weekScheduleVersion: 1, runMode: "freeform" },
          programState: null,
          weekSchedule: validWeekSchedule,
        }).length
      ).toBeGreaterThan(0);
    });
  });
});
