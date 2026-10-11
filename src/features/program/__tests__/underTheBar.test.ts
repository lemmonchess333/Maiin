/**
 * Pgm8 L15 (locked 2026-10-11): in a new plan, a barbell lift whose first
 * weight would be under the empty bar (20 kg) is built as its dumbbell
 * version where the exercise bank has one, and one with none starts at the
 * bar. Existing plans keep their lifts (Lift4 (2), Pgm5).
 *
 * The simulator found it (F10): new plans started barbell curls at
 * 5–17.5 kg, skull crushers at 15–17.5 kg and a weak lifter's press at
 * 12.5–15 kg, and the novice woman's 15 kg press then waited at a stretched
 * rep target for months (F2).
 *
 * A settings save is not a new plan. One that keeps the week keeps every
 * lift as it is; one that rebuilds it for new lift days keeps the lifts the
 * plan already has, and only a lift the rebuild adds is built by the rule,
 * as the generator's own pick.
 */
import { describe, expect, it } from "vitest";

import { getExerciseById } from "@/lib/exercises";
import type { OnboardingDraft } from "@/lib/onboardingDraft";
import { buildOnboardingPlan } from "@/lib/onboardingPlan";
import { loadGridFor } from "../loadSteps";
import { migrateProgramState } from "../migrations";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import {
  normalizeProgramState,
  type ProgramExercise,
  type ProgramState,
  type WorkoutDay,
} from "../programTypes";
import { represcribeWorkouts } from "../represcribe";
import { BAR_KG } from "../warmupRamp";

/** A Monday. */
const TODAY = "2026-10-12";

const DRAFT: OnboardingDraft = {
  step: 7,
  primaryGoal: "general",
  daysPerWeek: 3,
  equipment: "full_gym",
  runFrequency: "none",
  runMode: "freeform",
  weeklyRunDays: 0,
  raceDistance: "10k",
  raceTargetDate: "",
  injuries: ["none"],
  gender: "male",
  ageRange: "25-34",
  heightCm: 178,
  weightKg: 80,
  heightUnit: "cm",
  weightUnit: "kg",
  trainingWhy: "",
  experience: "beginner",
};

/** The simulator's novice woman: 62 kg, new to lifting, three days. */
const NOVICE_WOMAN: OnboardingDraft = {
  ...DRAFT,
  gender: "female",
  weightKg: 62,
  heightCm: 165,
};

const isBarbell = (exerciseId: string) =>
  getExerciseById(exerciseId)?.equipment === "Barbell";
const lifts = (workouts: readonly WorkoutDay[]) =>
  workouts.flatMap((d) => d.exercises);
const underTheBar = (workouts: readonly WorkoutDay[]) =>
  lifts(workouts).filter(
    (e) => isBarbell(e.exerciseId) && e.weight > 0 && e.weight < BAR_KG
  );

/**
 * The novice woman's plan as it was built before L15: a 15 kg barbell
 * press and a 5 kg barbell curl (her simulator trace), in the slots that
 * hold their dumbbell versions now.
 */
function builtBeforeL15(state: ProgramState): ProgramState {
  const back: Record<string, Pick<ProgramExercise, "exerciseId" | "name">> = {
    "db-shoulder-press": {
      exerciseId: "overhead-press",
      name: "Overhead Press",
    },
    "db-curl": { exerciseId: "barbell-curl", name: "Barbell Curl" },
  };
  const weight: Record<string, number> = {
    "overhead-press": 15,
    "barbell-curl": 5,
  };
  return {
    ...state,
    workouts: state.workouts.map((d) => ({
      ...d,
      exercises: d.exercises.map((e) => {
        const was = back[e.exerciseId];
        if (!was) return e;
        const w = weight[was.exerciseId];
        return {
          ...e,
          ...was,
          weight: w,
          lastSuccessfulWeight: w,
          lastAttemptedWeight: w,
        };
      }),
    })),
  };
}

function saveInput(
  existingState: ProgramState,
  over: Partial<PlanBuilderInput> = {}
): PlanBuilderInput {
  return {
    primaryGoal: "general",
    nutritionPhase: "recomp",
    experience: "beginner",
    previousExperience: "beginner",
    bodyweightKg: 62,
    sex: "female",
    liftDays: 3,
    sessionMinutes: 60,
    previousSessionMinutes: 60,
    preferredSplit: "full_body",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: TODAY,
    existingState,
    preserveHistory: true,
    ...over,
  };
}

describe("a new plan's barbell lifts start at the bar or over it (Pgm8 L15)", () => {
  it("starts no barbell lift under the bar, light lifters' included", () => {
    const found = new Set<string>();
    let barbellLifts = 0;
    for (const gender of ["female", "male"] as const)
      for (const weightKg of [50, 62, 80])
        for (const experience of [
          "beginner",
          "intermediate",
          "advanced",
        ] as const)
          for (const primaryGoal of [
            "hypertrophy",
            "strength",
            "general",
          ] as const)
            for (const daysPerWeek of [3, 4] as const) {
              const plan = buildOnboardingPlan(
                {
                  ...DRAFT,
                  gender,
                  weightKg,
                  experience,
                  primaryGoal,
                  daysPerWeek,
                },
                "recomp",
                TODAY
              );
              const workouts = plan.programState.workouts;
              barbellLifts += lifts(workouts).filter((e) =>
                isBarbell(e.exerciseId)
              ).length;
              for (const e of underTheBar(workouts))
                found.add(`${e.exerciseId} at ${String(e.weight)} kg`);
            }
    expect(barbellLifts).toBeGreaterThan(500); // the sweep has barbells in it
    expect([...found].sort()).toEqual([]);
  });

  it("builds the novice woman's press and curl as dumbbell lifts, on the rack", () => {
    const { workouts } = buildOnboardingPlan(
      NOVICE_WOMAN,
      "recomp",
      TODAY
    ).programState;
    const ids = lifts(workouts).map((e) => e.exerciseId);
    expect(ids).not.toContain("overhead-press");
    expect(ids).not.toContain("barbell-curl");
    const byId = (id: string) =>
      lifts(workouts).filter((e) => e.exerciseId === id);
    // A 15 kg barbell press and a 5 kg barbell curl before L15.
    expect(byId("db-shoulder-press").map((e) => e.weight)).toEqual([5]);
    expect(byId("db-curl").map((e) => e.weight)).toEqual([2]);
    for (const e of [...byId("db-shoulder-press"), ...byId("db-curl")]) {
      const rack = loadGridFor(e.exerciseId, false);
      expect(rack.nearest(e.weight)).toBe(e.weight);
    }
    // Her bench, squat, deadlift and row start on the bar or over it.
    for (const id of ["bench-press", "squat", "deadlift", "barbell-row"])
      expect(byId(id).length, id).toBeGreaterThan(0);
  });
});

describe("existing plans keep their lifts (Lift4 (2), Pgm5)", () => {
  const older = () =>
    builtBeforeL15(
      buildOnboardingPlan(NOVICE_WOMAN, "recomp", TODAY).programState
    );
  const atTheirWeights = (workouts: readonly WorkoutDay[]) =>
    underTheBar(workouts)
      .map((e) => `${e.exerciseId} ${String(e.weight)} kg`)
      .sort();

  it("keeps an older plan's lifts under the bar as they are when it loads", () => {
    const loaded = migrateProgramState(
      normalizeProgramState(older()),
      "2026-10-12"
    );
    expect(atTheirWeights(loaded.workouts)).toEqual([
      "barbell-curl 5 kg",
      "overhead-press 15 kg",
    ]);
  });

  it("keeps them through a settings save that keeps the week", () => {
    const saved = buildPlan(
      saveInput(older(), { nutritionPhase: "cut" })
    ).programState;
    expect(atTheirWeights(saved.workouts)).toEqual([
      "barbell-curl 5 kg",
      "overhead-press 15 kg",
    ]);
  });

  it("keeps their exercises through a save that re-prescribes the sessions", () => {
    // ProgrammeSettings' "update my sessions" (LIFT-EV-06): the save, then
    // the sessions re-aimed at the new focus.
    const saved = buildPlan(
      saveInput(older(), { primaryGoal: "hypertrophy" })
    ).programState;
    const represcribed = represcribeWorkouts(
      saved.workouts,
      "hypertrophy",
      "beginner"
    );
    const ids = lifts(represcribed).map((e) => e.exerciseId);
    expect(ids).toContain("overhead-press");
    expect(ids).toContain("barbell-curl");
    expect(ids).not.toContain("db-shoulder-press");
    expect(ids).not.toContain("db-curl");
  });

  it("keeps the plan's own lifts through a rebuild for new lift days, and builds only the lifts it adds by the rule", () => {
    const before = older();
    const own = new Set(lifts(before.workouts).map((e) => e.instanceId));
    const rebuilt = buildPlan(saveInput(before, { liftDays: 4 })).programState;
    expect(rebuilt.workouts).toHaveLength(4);
    // Under the bar only where the plan had the lift already.
    const added = underTheBar(rebuilt.workouts).filter(
      (e) => !own.has(e.instanceId)
    );
    expect(added.map((e) => `${e.exerciseId} ${String(e.weight)} kg`)).toEqual(
      []
    );
    // And a lift the plan had keeps its exercise.
    for (const e of lifts(rebuilt.workouts)) {
      const was = lifts(before.workouts).find(
        (b) => b.instanceId === e.instanceId
      );
      if (was) expect(e.exerciseId, e.instanceId).toBe(was.exerciseId);
    }
  });
});
