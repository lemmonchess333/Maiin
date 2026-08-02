import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { projectWorkoutSets, type LoggedSet } from "../workoutSetRecord";

/**
 * Parity guard (D2): the per-set projection is DOUBLE-sited — the client
 * (`workoutSetRecord.ts`, used by both the programme path in `useProgram` and
 * the routine path in `Routine`) and the Cloud-Functions mirror
 * (`functions/lib/workoutSetRecord.js`, used by the `completeWorkoutDay`
 * command reducer). This is the lockstep pin.
 *
 * It exists because the projection was TRIPLICATED before this change — the
 * two client copies plus the server one, each an independent
 * filter-then-renumber. Widening one and missing another is precisely
 * CLAUDE.md's "the tested copy does not prove the running copy", and the
 * server copy is the easy one to miss: it is latent today, since the client
 * only sends applyDeloadWeek / revertDeloadWeek over the command boundary.
 * Latent is not dead — `completeWorkoutDay` is in the frozen command
 * vocabulary, so the drift would surface the day someone routes completion
 * through it.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/workoutSetRecord") as {
  projectWorkoutSets: (
    logs: LoggedSet[] | undefined,
    planned: { sets: number; reps: number; weightKg: number }
  ) => unknown[];
};

const PLANNED = { sets: 4, reps: 8, weightKg: 100 };

const CASES: Array<{ name: string; logs: LoggedSet[] | undefined }> = [
  { name: "no logs — the planned fallback", logs: undefined },
  { name: "empty log array", logs: [] },
  {
    name: "a normal session",
    logs: [
      { weight: 100, reps: 8, completed: true, type: "working", rpe: 7 },
      { weight: 100, reps: 8, completed: true, type: "working", rpe: 8.5 },
      { weight: 100, reps: 7, completed: true, type: "failure", rpe: 10 },
    ],
  },
  {
    name: "incomplete sets are dropped and survivors renumbered",
    logs: [
      { weight: 100, reps: 8, completed: true, type: "working" },
      { weight: 100, reps: 0, completed: false, type: "working" },
      { weight: 100, reps: 6, completed: true, type: "working" },
    ],
  },
  {
    name: "a trailing drop set is persisted, not filtered",
    logs: [
      { weight: 100, reps: 8, completed: true, type: "working" },
      { weight: 60, reps: 12, completed: true, type: "dropset" },
    ],
  },
  {
    name: "an absent set type falls back to working",
    logs: [{ weight: 100, reps: 8, completed: true }],
  },
  {
    name: "an unknown set type falls back to working",
    logs: [{ weight: 100, reps: 8, completed: true, type: "nonsense" }],
  },
  {
    name: "rpe of 0 is a value, not an absence",
    logs: [{ weight: 100, reps: 8, completed: true, type: "working", rpe: 0 }],
  },
];

describe("per-set projection parity (client ↔ CF mirror)", () => {
  for (const c of CASES) {
    it(`agrees on ${c.name}`, () => {
      expect(cf.projectWorkoutSets(c.logs, PLANNED)).toEqual(
        projectWorkoutSets(c.logs, PLANNED)
      );
    });
  }

  it("both omit the rpe KEY when there is no rpe", () => {
    // Firestore rejects `undefined` outright, so "absent" has to mean the key
    // is gone — `toEqual` would treat `{rpe: undefined}` as equal to `{}` and
    // hide a real write failure.
    const logs: LoggedSet[] = [
      { weight: 100, reps: 8, completed: true, type: "working" },
    ];
    expect("rpe" in (projectWorkoutSets(logs, PLANNED)[0] as object)).toBe(
      false
    );
    expect("rpe" in (cf.projectWorkoutSets(logs, PLANNED)[0] as object)).toBe(
      false
    );
  });
});

describe("what the projection records (D2)", () => {
  it("records the PRESCRIPTION alongside the actual, per set", () => {
    // The pairing that cannot be reconstructed later: `applyProgression`
    // overwrites `exercise.reps` / `exercise.weight` right after the session,
    // so the target the lifter was actually chasing is gone by the next read.
    const [set] = projectWorkoutSets(
      [{ weight: 92.5, reps: 6, completed: true, type: "working" }],
      PLANNED
    );
    expect(set).toMatchObject({
      reps: 6,
      weightKg: 92.5,
      plannedReps: 8,
      plannedWeightKg: 100,
    });
  });

  it("keeps the RPE the session captured", () => {
    const [set] = projectWorkoutSets(
      [{ weight: 100, reps: 8, completed: true, type: "working", rpe: 9.5 }],
      PLANNED
    );
    expect(set.rpe).toBe(9.5);
  });

  it("still emits completed-only sets, so tonnage and PR readers do not move", () => {
    const out = projectWorkoutSets(
      [
        { weight: 100, reps: 8, completed: true, type: "working" },
        { weight: 100, reps: 0, completed: false, type: "working" },
      ],
      PLANNED
    );
    expect(out).toHaveLength(1);
    expect(out[0].setNumber).toBe(1);
  });
});
