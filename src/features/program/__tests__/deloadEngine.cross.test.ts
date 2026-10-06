import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { advanceWeek, applyDeload } from "../programEngine";
import type {
  ProgramState,
  WorkoutDay,
  ScheduledRunDay,
} from "../programTypes";
import { planDeloadWeek } from "@/lib/planDeloadWeek";

/**
 * Parity guard (PROGRAM-DELOAD-01): the lighter-week recipe is two-sited —
 * the client engine (`applyDeload`, runs the calendar's lighter week) and
 * the Cloud-Functions command reducer's mirror
 * (`functions/lib/deloadEngine.js`, runs the user-invoked applyDeloadWeek
 * command). The copies MUST agree; this test is the lockstep pin (the
 * sanctioned mitigation for the tested-copy-vs-running-copy rule). Change
 * the recipe on one side and this fails until both move together.
 *
 * One recipe for everyone (Lift4 (9)): half the working sets, rounded up,
 * at the same weights and reps.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/deloadEngine") as {
  applyDeloadToWorkouts: (workouts: WorkoutDay[]) => WorkoutDay[];
};

function fixtureWeek(): WorkoutDay[] {
  return [
    {
      dayName: "Push",
      dayType: "push",
      completed: false,
      skipped: false,
      exercises: [
        // On the 2.5 grid after ×0.85 (100 → 85).
        mkEx("bench", 3, 8, 100),
        // Off-grid after ×0.85 (60 → 51 → 50).
        mkEx("row", 4, 10, 60),
        // Bodyweight stays 0; sets floor at 2.
        mkEx("pullup", 2, 12, 0),
        // A timed hold steps down by five seconds, never by "two reps".
        { ...mkEx("plank", 3, 30, 0), repUnit: "seconds" },
      ],
    },
    {
      dayName: "Legs",
      dayType: "legs",
      completed: false,
      skipped: false,
      exercises: [
        // Rounds UP (140 → 119 → 120).
        mkEx("squat", 5, 5, 140),
        // Tiny weight collapses to the grid (2.5 → 2.125 → 2.5).
        mkEx("curl", 3, 15, 2.5),
      ],
    },
  ] as WorkoutDay[];
}

function mkEx(id: string, sets: number, reps: number, weight: number) {
  return {
    name: id,
    exerciseId: id,
    instanceId: `inst-${id}`,
    sets,
    reps,
    weight,
  };
}

describe("lighter-week recipe parity (client engine ↔ CF mirror)", () => {
  it("the CF mirror equals programEngine.applyDeload", () => {
    expect(cf.applyDeloadToWorkouts(fixtureWeek())).toEqual(
      applyDeload(fixtureWeek())
    );
  });

  it("halves the sets, rounded up, and keeps every weight, rep and second", () => {
    const before = fixtureWeek().flatMap((day) => day.exercises);
    const after = applyDeload(fixtureWeek()).flatMap((day) => day.exercises);
    expect(after.map((ex) => ex.sets)).toEqual(
      before.map((ex) => Math.ceil(ex.sets / 2))
    );
    expect(after.map((ex) => [ex.weight, ex.reps])).toEqual(
      before.map((ex) => [ex.weight, ex.reps])
    );
  });

  it("input is not mutated by either copy", () => {
    const a = fixtureWeek();
    const b = fixtureWeek();
    applyDeload(a);
    cf.applyDeloadToWorkouts(b);
    expect(a).toEqual(fixtureWeek());
    expect(b).toEqual(fixtureWeek());
  });
});

/* ─── D4 · a user-applied lighter week must give its sets back ──────────
   Not a unit test of either copy — the user story across both, because the
   defect once lived in the SEAM: the command's cut became permanent at the
   rollover. Only running the command and THEN the rollover shows it. ── */
describe("applyDeloadWeek command → week rollover (D4)", () => {
  const cmds = require("../../../../functions/lib/programCommands") as {
    applyProgramCommand: (a: {
      state: unknown;
      profile: unknown;
      command: unknown;
      now: number;
    }) => { state: ProgramState };
  };

  const stateAtWeek1 = (): ProgramState => ({
    goal: "recomp",
    currentPhase: "progression",
    weekNumber: 1,
    splitType: "upper_lower",
    fatigueScore: 0,
    updatedAt: 0,
    workouts: [
      {
        dayName: "Upper",
        dayType: "push",
        completed: false,
        exercises: [mkEx("bench-press", 4, 8, 100)],
      } as WorkoutDay,
    ],
  });

  const deload = (experience: string) =>
    cmds.applyProgramCommand({
      state: stateAtWeek1(),
      profile: { experience },
      command: {
        kind: "applyDeloadWeek",
        commandId: "aaaaaaaaaaaaaaaa",
        expectedWeekNumber: 1,
      },
      now: 1,
    }).state;

  it("halves the sets at the same weight and reps", () => {
    const ex = deload("beginner").workouts[0].exercises[0];
    expect(ex.sets).toBe(2); // half of 4
    expect(ex.weight).toBe(100);
    expect(ex.reps).toBe(8);
  });

  it("gives the sets back on the next week rollover", () => {
    const rolled = advanceWeek(deload("intermediate"), "intermediate");
    const ex = rolled.workouts[0].exercises[0];
    expect(ex.sets).toBe(4);
    expect(ex.weight).toBe(100);
    expect(ex.reps).toBe(8);
  });

  it("keeps anything the user progressed DURING the lighter week", () => {
    const after = deload("beginner");
    after.workouts[0].exercises[0].weight = 105;
    const rolled = advanceWeek(after, "beginner");
    expect(rolled.workouts[0].exercises[0].weight).toBe(105);
  });
});

/* ──────────────────────────────────────────────────────────────────────
   The RUN half of a deload, end to end (P1d pin 1).

   The client plans it and the server applies it, because the template
   ladders live in RUN_TEMPLATES and `functions/` cannot import that —
   `raceTemplateIds.js` states as much. That split is exactly the shape
   ADR-0008 warns about, so the contract is pinned by running the REAL
   server reducer against the REAL client planner rather than by
   asserting each side against its own fixture.

   What the mechanism is NOT, and why (both settled by stress test):
     - not a flat 25%, which the running evidence handoff's non-adoptions
       forbid as "a universal taper duration/percentage";
     - not the ease-week's quality → easy_30 swap, which strips the
       week's intensity family and, mid-build, its specificity.
   ─────────────────────────────────────────────────────────────────── */
describe("deload run half — client planner → server reducer", () => {
  const cmds2 = require("../../../../functions/lib/programCommands") as {
    applyProgramCommand: (a: {
      state: unknown;
      profile: unknown;
      command: unknown;
      now: number;
    }) => { state: ProgramState & { runDays?: unknown[] } };
  };

  const TODAY = "2026-08-10";
  const runDay = (over: Record<string, unknown>) => ({
    id: `rd-${over.templateId}`,
    dayIndex: 2,
    status: "planned",
    completed: false,
    date: "2026-08-12",
    ...over,
  });

  const raceWeekState = () =>
    ({
      goal: "recomp",
      currentPhase: "progression",
      weekNumber: 1,
      splitType: "upper_lower",
      fatigueScore: 0,
      updatedAt: 0,
      workouts: [
        {
          dayName: "Upper",
          dayType: "push",
          completed: false,
          exercises: [mkEx("bench-press", 4, 8, 100)],
        } as WorkoutDay,
      ],
      runDays: [
        runDay({ templateId: "tempo_40", type: "tempo" }),
        runDay({ templateId: "6x1k", type: "intervals", dayIndex: 4 }),
        runDay({ templateId: "long_20k", type: "long", dayIndex: 6 }),
        runDay({ templateId: "marathon_race", type: "race", dayIndex: 0 }),
      ],
    }) as unknown as ProgramState & { runDays: ScheduledRunDay[] };

  const applyWithRuns = (
    state: ProgramState & { runDays: ScheduledRunDay[] }
  ) =>
    cmds2.applyProgramCommand({
      state,
      profile: { experience: "intermediate" },
      command: {
        kind: "applyDeloadWeek",
        commandId: "bbbbbbbbbbbbbbbb",
        expectedWeekNumber: 1,
        runSwaps: planDeloadWeek(state.runDays, TODAY).map((s) => ({
          runDayId: String(s.key),
          templateId: s.toTemplateId,
        })),
      },
      now: 1,
    }).state;

  it("steps each run down a rung and keeps what the session IS", () => {
    const after = applyWithRuns(raceWeekState()) as ProgramState & {
      runDays: ScheduledRunDay[];
    };
    const byId = Object.fromEntries(
      after.runDays.map((rd) => [rd.id as string, rd.templateId])
    );
    expect(byId["rd-tempo_40"]).toBe("tempo_30");
    expect(byId["rd-6x1k"]).toBe("5x1k");
    expect(byId["rd-long_20k"]).toBe("long_15k");
    // Never the ease-week's destination — that is the rejected mechanism.
    expect(Object.values(byId)).not.toContain("easy_30");
  });

  it("leaves the race alone across the whole round trip", () => {
    const after = applyWithRuns(raceWeekState()) as ProgramState & {
      runDays: ScheduledRunDay[];
    };
    const race = after.runDays.find((rd) => rd.id === "rd-marathon_race")!;
    expect(race.templateId).toBe("marathon_race");
    expect(race.userOverride).toBeUndefined();
  });

  it("undo puts every run back", () => {
    const before = raceWeekState();
    const originals = before.runDays.map((rd) => rd.templateId);
    const after = applyWithRuns(before);
    const reverted = cmds2.applyProgramCommand({
      state: after,
      profile: {},
      command: {
        kind: "revertDeloadWeek",
        commandId: "cccccccccccccccc",
        expectedWeekNumber: 1,
      },
      now: 2,
    }).state as ProgramState & { runDays: ScheduledRunDay[] };
    expect(reverted.runDays.map((rd) => rd.templateId)).toEqual(originals);
  });

  it("a lift-only user sends no swaps and is completely unaffected", () => {
    const state = raceWeekState();
    state.runDays = [];
    const swaps = planDeloadWeek(state.runDays, TODAY);
    expect(swaps).toEqual([]);
    const after = cmds2.applyProgramCommand({
      state,
      profile: { experience: "intermediate" },
      command: {
        kind: "applyDeloadWeek",
        commandId: "dddddddddddddddd",
        expectedWeekNumber: 1,
      },
      now: 1,
    }).state;
    expect(after.currentPhase).toBe("deload");
    // The lift half still ran. The exact recipe is pinned by the tests
    // above; all this needs to show is that adding a run half did not
    // cost a lift-only user their deload.
    expect(after.workouts[0].exercises[0].sets).toBeLessThan(4);
  });
});
