import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

import { applyDeload } from "../programEngine";
import { deloadWeight } from "../easierToday";
import type { WorkoutDay } from "../programTypes";

/**
 * Parity guard (PROGRAM-DELOAD-01): the deload rule is triple-sited — the
 * client engine (`applyDeload`, runs the automatic week-4 path), the
 * easier-today session builder (`deloadWeight`), and the Cloud-Functions
 * command reducer's mirror (`functions/lib/deloadEngine.js`, runs the
 * user-invoked applyDeloadWeek command). These copies MUST agree; this
 * test is the lockstep pin (the sanctioned mitigation for the tested-copy-
 * vs-running-copy rule). Change the rule on one side and this fails until
 * every copy moves together.
 *
 * Backlog #8 split the rule by training age, so the engine↔mirror pin now
 * runs over EVERY experience value. `deloadWeight` is only the weight half
 * and stays novice-shaped on purpose: it powers the easier-today lever
 * ("make this session lighter"), which is a different concept from the
 * mesocycle step-back — so it is pinned against the beginner recipe only.
 */
const require = createRequire(import.meta.url);
const cf = require("../../../../functions/lib/deloadEngine") as {
  applyDeloadToWorkouts: (
    workouts: WorkoutDay[],
    experience?: string
  ) => WorkoutDay[];
};

const EXPERIENCES = [
  undefined,
  "beginner",
  "intermediate",
  "advanced",
  "nonsense",
] as const;

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

describe("deload rule parity (client engine ↔ CF mirror ↔ easierToday)", () => {
  it("the CF mirror equals programEngine.applyDeload for every experience", () => {
    for (const experience of EXPERIENCES) {
      expect(
        cf.applyDeloadToWorkouts(fixtureWeek(), experience),
        `mismatch for experience=${experience}`
      ).toEqual(
        applyDeload(
          fixtureWeek(),
          experience as Parameters<typeof applyDeload>[1]
        )
      );
    }
  });

  it("an unknown experience falls back to the novice recipe on both copies", () => {
    // Neither copy may treat a garbage value as post-novice — the fallback
    // has to be the load-cutting recipe both sides shipped before #8.
    const novice = applyDeload(fixtureWeek(), "beginner");
    expect(
      applyDeload(
        fixtureWeek(),
        "nonsense" as Parameters<typeof applyDeload>[1]
      )
    ).toEqual(novice);
    expect(cf.applyDeloadToWorkouts(fixtureWeek(), "nonsense")).toEqual(novice);
    expect(applyDeload(fixtureWeek())).toEqual(novice);
  });

  it("the weight rule equals easierToday.deloadWeight per exercise", () => {
    for (const w of [0, 2.5, 20, 60, 100, 140, 142.5, 7.5]) {
      const viaEngine = applyDeload([
        {
          dayName: "D",
          dayType: "push",
          completed: false,
          skipped: false,
          exercises: [mkEx("x", 3, 8, w)],
        } as WorkoutDay,
      ])[0].exercises[0].weight;
      expect(viaEngine).toBe(deloadWeight(w));
    }
  });

  it("reduces a post-novice timed hold by five seconds", () => {
    const out = applyDeload(fixtureWeek(), "advanced");
    const plank = out
      .flatMap((day) => day.exercises)
      .find((exercise) => exercise.exerciseId === "plank");
    expect(plank?.reps).toBe(25);
  });

  it("input is not mutated by either copy", () => {
    for (const experience of EXPERIENCES) {
      const a = fixtureWeek();
      const b = fixtureWeek();
      applyDeload(a, experience as Parameters<typeof applyDeload>[1]);
      cf.applyDeloadToWorkouts(b, experience);
      expect(a).toEqual(fixtureWeek());
      expect(b).toEqual(fixtureWeek());
    }
  });
});
