import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { EXERCISES } from "@/lib/exercises";
import { exerciseRole, type ExerciseRole } from "../exerciseRole";
import { toExperience, type Experience } from "../experienceModel";
import { isHighRepIsolation, roleReps, roleRepsFor } from "../roleTable";
import type { PrimaryGoal } from "../programTypes";

/**
 * Parity guard (Lift4 (5)): the role table is double-sited. A training block
 * re-prescribes the week on the server (`represcribe.js`), so the server
 * reads each lift's sets and reps from its own copy
 * (`functions/lib/roleTable.js`). That copy can't require the catalogue, so
 * it keeps the two id lists the client reads from it: the isolations, and
 * the calf, side-delt and ab exercises Build muscle gives 12–20.
 *
 * Drift would hand a block's lifts different numbers from a plan's, with
 * nothing thrown. So this derives both lists from EXERCISES and walks every
 * goal × role × level, and every catalogue exercise in every slot.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/roleTable") as {
  HIGH_REP_EXERCISE_IDS: readonly string[];
  ISOLATION_EXERCISE_IDS: readonly string[];
  exerciseRole: (ex: unknown) => ExerciseRole;
  roleReps: (
    goal: string | undefined,
    role: ExerciseRole,
    experience: string | undefined,
    highRep: boolean
  ) => { sets: number; bottom: number; top?: number };
  roleRepsFor: (
    goal: string | undefined,
    ex: unknown,
    experience: string | undefined
  ) => { sets: number; bottom: number; top?: number };
  toExperience: (v: string | undefined) => string;
};

const GOALS: (PrimaryGoal | undefined)[] = [
  undefined,
  "strength",
  "hypertrophy",
  "fat_loss",
  "general",
  "running",
];
const EXPERIENCES: (Experience | undefined)[] = [
  undefined,
  "beginner",
  "intermediate",
  "advanced",
];
const ROLES: ExerciseRole[] = ["main", "compound", "isolation"];

describe("role table — client vs functions mirror", () => {
  it("the isolation list is the catalogue's isolations", () => {
    expect([...cf.ISOLATION_EXERCISE_IDS].sort()).toEqual(
      EXERCISES.filter((e) => e.mechanic === "isolation")
        .map((e) => e.id)
        .sort()
    );
  });

  it("the 12–20 list is the catalogue's calf, side-delt and ab exercises", () => {
    expect([...cf.HIGH_REP_EXERCISE_IDS].sort()).toEqual(
      EXERCISES.filter((e) => isHighRepIsolation(e.id))
        .map((e) => e.id)
        .sort()
    );
  });

  it("roleReps agrees for every goal, role and level", () => {
    for (const goal of GOALS) {
      for (const role of ROLES) {
        for (const experience of EXPERIENCES) {
          for (const highRep of [false, true]) {
            expect(
              cf.roleReps(goal, role, experience, highRep),
              `${goal}/${role}/${experience}/${highRep}`
            ).toEqual(roleReps(goal, role, experience, highRep));
          }
        }
      }
    }
  });

  it("every catalogue exercise gets the same role and row in every slot", () => {
    for (const e of EXERCISES) {
      for (const isAccessory of [undefined, false, true]) {
        const slot = { exerciseId: e.id, isAccessory };
        expect(cf.exerciseRole(slot), e.id).toBe(exerciseRole(slot));
        for (const goal of GOALS) {
          for (const experience of EXPERIENCES) {
            expect(
              cf.roleRepsFor(goal, slot, experience),
              `${e.id}/${goal}/${experience}`
            ).toEqual(roleRepsFor(goal, slot, experience));
          }
        }
      }
    }
    // An id the catalogue doesn't know is a compound on both sides.
    const custom = { exerciseId: "my-own-lift", isAccessory: true };
    expect(cf.exerciseRole(custom)).toBe(exerciseRole(custom));
  });

  it("toExperience agrees, an unknown level included", () => {
    for (const v of [...EXPERIENCES, "expert", ""]) {
      expect(cf.toExperience(v), String(v)).toBe(toExperience(v));
    }
  });
});
