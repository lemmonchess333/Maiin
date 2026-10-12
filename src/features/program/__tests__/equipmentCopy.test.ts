/**
 * The home-gym option says what a home-gym plan uses (Lift4).
 *
 * Onboarding offered the home gym as a "Barbell and dumbbell setup" while the
 * equipment filter (`matchTemplate.ts`) lets a home gym train with dumbbells,
 * bodyweight and kettlebells only, and swapped every barbell lift out. The
 * copy is held from both sides: the words name nothing the plan leaves out,
 * and a plan built for a home gym uses nothing the words leave out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { getExerciseById } from "@/lib/exercises";
import type { PrimaryGoal } from "../programTypes";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

/** The `desc` beside `id: "home_gym"` in a source file's option list. */
function homeGymCopy(path: string): string {
  const source = readFileSync(resolve(repoRoot, path), "utf8");
  const match = source.match(/id: "home_gym",[\s\S]*?desc: "([^"]+)"/);
  if (!match) throw new Error(`no home_gym option in ${path}`);
  return match[1];
}

const SURFACES = [
  "src/pages/Onboarding.tsx",
  "src/components/program/ProgrammeSettings.tsx",
];

describe("the home-gym option", () => {
  it.each(SURFACES)(
    "names no equipment a home gym is not given: %s",
    (path) => {
      expect(homeGymCopy(path)).not.toMatch(/barbell|cable|machine/i);
    }
  );

  it("builds plans with barbell lifts too when there's a barbell and a rack (Lift4 (11))", () => {
    const used = new Set<string>();
    for (const liftDays of [2, 3, 4, 5, 6]) {
      const { programState, profileUpdates } = buildPlan({
        primaryGoal: "strength",
        nutritionPhase: "recomp",
        experience: "intermediate",
        bodyweightKg: 80,
        sex: "male",
        liftDays,
        preferredSplit: "auto",
        runMode: "freeform",
        weeklyRunDays: 0,
        equipment: "home_gym",
        barbellAtHome: true,
        injuries: [],
        currentDate: "2026-03-08",
      } as PlanBuilderInput);
      expect(profileUpdates.barbellAtHome).toBe(true);
      for (const day of programState.workouts)
        for (const ex of day.exercises)
          used.add(getExerciseById(ex.exerciseId)?.equipment ?? "unknown");
    }
    expect(used.has("Barbell")).toBe(true);
    for (const equipment of used)
      expect(["Barbell", "Bodyweight", "Dumbbells", "Kettlebell"]).toContain(
        equipment
      );
  });

  it("builds plans with dumbbells, bodyweight and kettlebells only", () => {
    const goals: PrimaryGoal[] = [
      "strength",
      "hypertrophy",
      "fat_loss",
      "general",
      "running",
    ];
    const used = new Set<string>();
    for (const primaryGoal of goals) {
      for (const liftDays of [2, 3, 4, 5, 6]) {
        const { programState } = buildPlan({
          primaryGoal,
          nutritionPhase: "recomp",
          experience: "intermediate",
          bodyweightKg: 80,
          sex: "male",
          liftDays,
          preferredSplit: "auto",
          runMode: "freeform",
          weeklyRunDays: 0,
          equipment: "home_gym",
          injuries: [],
          currentDate: "2026-03-08",
        } as PlanBuilderInput);
        for (const day of programState.workouts)
          for (const ex of day.exercises)
            used.add(getExerciseById(ex.exerciseId)?.equipment ?? "unknown");
      }
    }
    expect([...used].sort()).toEqual(
      expect.arrayContaining(["Bodyweight", "Dumbbells"])
    );
    for (const equipment of used)
      expect(["Bodyweight", "Dumbbells", "Kettlebell"]).toContain(equipment);
  });
});
