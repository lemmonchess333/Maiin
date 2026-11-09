/**
 * Two people with no equipment live 26 weeks through the app's own plan
 * code (`src/test/sim/liftSeason.ts`): every session they're offered is one
 * they can do, the app's rules hold, and the lifts climb in reps.
 *
 * Not in `LIFT_PERSONAS`, whose traces and measurements are pinned for the
 * personas they were measured on.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore");
vi.mock("@/lib/firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { NO_EQUIPMENT_EXERCISE_IDS } from "@/features/program/noEquipment";
import {
  describeFailure,
  simulateLiftSeason,
  type LiftPersona,
} from "@/test/sim/liftSeason";

const BEGINNER: LiftPersona = {
  name: "no-equipment-beginner",
  answers: {
    experience: "beginner",
    primaryGoal: "general",
    daysPerWeek: 3,
    sessionMinutes: 45,
    equipment: "no_equipment",
    gender: "female",
    weightKg: 65,
    heightCm: 165,
  },
  nutrition: "recomp",
  lifter: { trainingAge: "novice", start1RM: {}, seedRir: 4 },
  sessionShare: 0.9,
  calibrates: false,
  tracked: ["push-ups", "inverted-row", "bodyweight-squat", "glute-bridge"],
};

const INTERMEDIATE: LiftPersona = {
  ...BEGINNER,
  name: "no-equipment-intermediate",
  answers: {
    ...BEGINNER.answers,
    experience: "intermediate",
    primaryGoal: "hypertrophy",
    daysPerWeek: 4,
    gender: "male",
    weightKg: 80,
    heightCm: 180,
  },
  lifter: { trainingAge: "intermediate", start1RM: {}, seedRir: 3 },
};

describe.each([BEGINNER, INTERMEDIATE].map((p) => [p.name, p] as const))(
  "%s",
  (_name, persona) => {
    const season = simulateLiftSeason(persona, { weeks: 26, seed: 1 });

    it("keeps the app's rules", () => {
      expect(season.failures.map((f) => describeFailure(season, f))).toEqual(
        []
      );
    });

    it("is offered only what it can do, for 26 weeks", () => {
      const lifts = season.sessions.flatMap((s) => s.lifts);
      expect(lifts.length).toBeGreaterThan(0);
      expect(
        lifts
          .map((l) => l.exerciseId)
          .filter((id) => !NO_EQUIPMENT_EXERCISE_IDS.has(id))
      ).toEqual([]);
      expect(lifts.some((l) => l.exerciseId === "inverted-row")).toBe(true);
    });

    it("climbs in reps on the lifts it does every week", () => {
      for (const id of persona.tracked) {
        const targets = season.sessions.flatMap((s) =>
          s.lifts.filter((l) => l.exerciseId === id).map((l) => l.targetReps)
        );
        expect(targets.length, id).toBeGreaterThan(0);
        expect(Math.max(...targets), id).toBeGreaterThan(targets[0]);
      }
    });
  }
);
