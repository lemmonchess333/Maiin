/**
 * The no-equipment setup: someone who owns nothing is never given an
 * exercise they can't do, and still gets a whole plan, pulling included
 * (`noEquipment.ts`).
 *
 * The plans are built end to end through `buildPlan`, so every pass that
 * picks an exercise runs: the generator, the twice-a-week cap, the level
 * gate, the injury swaps, the equipment swaps and the drop. A new
 * exercise, a new bank entry or a new pass that hands a dumbbell back
 * fails here, whichever it is.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { EXERCISES, getExerciseById } from "@/lib/exercises";
import { getReleasedFormArtwork } from "@/lib/formArtwork";
import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { applyProgression } from "../programEngine";
import {
  BODYWEIGHT_EXERCISES_NEEDING_KIT,
  NO_EQUIPMENT_EXERCISE_IDS,
  NO_EQUIPMENT_LAST_RESORT,
  NO_EQUIPMENT_STAND_INS,
} from "../noEquipment";
import type { PrimaryGoal, ProgramExercise, WorkoutDay } from "../programTypes";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);

const GOALS: PrimaryGoal[] = [
  "general",
  "hypertrophy",
  "strength",
  "fat_loss",
  "running",
];
const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const DAYS = [2, 3, 4, 5, 6];

function plan(
  primaryGoal: PrimaryGoal,
  experience: string,
  liftDays: number,
  injuries: string[] = [],
  sessionMinutes?: number
) {
  return buildPlan({
    primaryGoal,
    nutritionPhase: "recomp",
    experience,
    bodyweightKg: 80,
    sex: "male",
    liftDays,
    sessionMinutes,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "no_equipment",
    injuries,
    currentDate: "2026-07-28",
  } as PlanBuilderInput);
}

const lifts = (workouts: readonly WorkoutDay[]) =>
  workouts.flatMap((day) => day.exercises);

/** Every lift in the week the setup can't do, by name. */
const needsKit = (workouts: readonly WorkoutDay[]) =>
  lifts(workouts)
    .filter((ex) => !NO_EQUIPMENT_EXERCISE_IDS.has(ex.exerciseId))
    .map((ex) => `${ex.name} (${getExerciseById(ex.exerciseId)?.equipment})`);

describe("what the setup allows", () => {
  const bodyweight = EXERCISES.filter((ex) => ex.equipment === "Bodyweight");

  it("decides every bodyweight exercise in the catalogue, one way or the other", () => {
    for (const ex of bodyweight) {
      const allowed = NO_EQUIPMENT_EXERCISE_IDS.has(ex.id);
      const needs = ex.id in BODYWEIGHT_EXERCISES_NEEDING_KIT;
      expect(allowed !== needs, ex.id).toBe(true);
    }
  });

  it("allows only bodyweight exercises the catalogue has", () => {
    for (const id of [
      ...NO_EQUIPMENT_EXERCISE_IDS,
      ...Object.keys(BODYWEIGHT_EXERCISES_NEEDING_KIT),
    ]) {
      expect(getExerciseById(id)?.equipment, id).toBe("Bodyweight");
    }
  });

  it("leaves out what hangs from a bar, dips on bars or lies on a bench", () => {
    for (const id of [
      "pull-ups",
      "chin-ups",
      "leg-raise",
      "dips",
      "tricep-dips",
      "bench-dips",
      "weighted-push-ups",
    ]) {
      expect(NO_EQUIPMENT_EXERCISE_IDS.has(id), id).toBe(false);
    }
  });

  it("stands in only with what it allows", () => {
    const standIns = [
      ...Object.values(NO_EQUIPMENT_STAND_INS).flatMap((list) =>
        list.map((o) => o.id)
      ),
      ...NO_EQUIPMENT_LAST_RESORT,
    ];
    for (const id of standIns)
      expect(NO_EQUIPMENT_EXERCISE_IDS.has(id), id).toBe(true);
  });

  it("gives a plan only exercises with released form art", () => {
    const given = new Set<string>();
    for (const goal of GOALS)
      for (const level of LEVELS)
        for (const days of DAYS)
          for (const ex of lifts(plan(goal, level, days).programState.workouts))
            given.add(ex.exerciseId);
    for (const id of given)
      expect(getReleasedFormArtwork(id), id).not.toBeNull();
  });
});

describe("a no-equipment plan", () => {
  const matrix = GOALS.flatMap((goal) =>
    LEVELS.flatMap((level) => DAYS.map((days) => ({ goal, level, days })))
  );

  it("has nothing that needs kit, on any goal, level or number of days", () => {
    for (const { goal, level, days } of matrix) {
      for (const minutes of [undefined, 30, 60]) {
        const { workouts } = plan(goal, level, days, [], minutes).programState;
        expect(
          needsKit(workouts),
          `${goal}/${level}/${days}d/${minutes}`
        ).toEqual([]);
      }
    }
  });

  it("has nothing that needs kit with an injury, and no empty day", () => {
    const injuries = [
      ["knee"],
      ["shoulder"],
      ["lower_back"],
      ["elbow"],
      ["wrist"],
      ["knee", "lower_back"],
      ["shoulder", "elbow", "wrist"],
      ["knee", "shoulder", "lower_back", "elbow", "wrist"],
    ];
    for (const { goal, level, days } of matrix) {
      for (const injury of injuries) {
        const { workouts } = plan(goal, level, days, injury).programState;
        const at = `${goal}/${level}/${days}d/${injury.join("+")}`;
        expect(needsKit(workouts), at).toEqual([]);
        for (const day of workouts)
          expect(day.exercises.length, `${at} ${day.dayName}`).toBeGreaterThan(
            0
          );
      }
    }
  }, 60_000);

  it("pushes, pulls, squats, hinges and trains the trunk every week", () => {
    for (const { goal, level, days } of matrix) {
      const week = lifts(plan(goal, level, days).programState.workouts);
      const at = `${goal}/${level}/${days}d`;
      const has = (...categories: string[]) =>
        week.some((ex) => categories.includes(ex.movementCategory));
      expect(has("horizontal_push", "vertical_push"), `${at} push`).toBe(true);
      // The pull is the inverted row: the one the floor allows, under a table.
      expect(
        week.some((ex) => ex.exerciseId === "inverted-row"),
        `${at} pull`
      ).toBe(true);
      expect(has("knee_dominant"), `${at} knee`).toBe(true);
      expect(has("hip_dominant"), `${at} hip`).toBe(true);
      expect(has("core"), `${at} core`).toBe(true);
    }
  });

  it("covers every pattern in each session of a full-body week", () => {
    // Two and three days are full-body weeks: each session is the whole
    // body, so each has a push, the row, a squat and a hinge.
    for (const goal of GOALS)
      for (const level of LEVELS)
        for (const days of [2, 3]) {
          for (const day of plan(goal, level, days).programState.workouts) {
            const at = `${goal}/${level}/${days}d ${day.dayName}`;
            const has = (...categories: string[]) =>
              day.exercises.some((ex) =>
                categories.includes(ex.movementCategory)
              );
            expect(has("horizontal_push", "vertical_push"), at).toBe(true);
            expect(has("horizontal_pull", "vertical_pull"), at).toBe(true);
            expect(has("knee_dominant"), at).toBe(true);
            expect(has("hip_dominant"), at).toBe(true);
          }
        }
  });

  it("climbs in reps, and a hold in seconds, when every set is done", () => {
    let holds = 0;
    for (const { goal, level, days } of matrix) {
      for (const ex of lifts(plan(goal, level, days).programState.workouts)) {
        const at = `${goal}/${level}/${days}d ${ex.name}`;
        // No load: the body is the weight.
        expect(ex.weight, at).toBe(0);
        const next = applyProgression(
          ex as ProgramExercise,
          ex.reps,
          0,
          false,
          undefined,
          1,
          "2026-07-29"
        );
        expect(next.weight, at).toBe(0);
        if (ex.repUnit === "seconds") {
          holds += 1;
          expect(ex.reps, at).toBe(30);
          expect(next.reps, at).toBe(35);
        } else {
          expect(next.reps, at).toBe(ex.reps + 1);
        }
      }
    }
    // The superman and the plank are held, not counted.
    expect(holds).toBeGreaterThan(0);
  });

  it("holds the superman and the plank for time", () => {
    const week = GOALS.flatMap((goal) =>
      lifts(plan(goal, "intermediate", 6).programState.workouts)
    );
    const timed = week.filter((ex) =>
      ["superman-hold", "plank", "side-plank"].includes(ex.exerciseId)
    );
    expect(timed.length).toBeGreaterThan(0);
    for (const ex of timed) {
      expect(ex.repUnit, ex.name).toBe("seconds");
      expect(ex.repRangeMax, ex.name).toBe(60);
    }
  });
});

describe("changing a plan to no equipment and back", () => {
  const answers = {
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "intermediate",
    bodyweightKg: 80,
    sex: "male",
    liftDays: 4,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    injuries: [],
    currentDate: "2026-07-28",
  } as const;
  const build = (
    liftDays: number,
    equipment: PlanBuilderInput["equipment"],
    from?: ReturnType<typeof buildPlan>
  ) =>
    buildPlan({
      ...answers,
      liftDays,
      equipment,
      ...(from
        ? { existingState: from.programState, preserveHistory: true }
        : {}),
    } as unknown as PlanBuilderInput);
  const ids = (w: readonly WorkoutDay[]) =>
    w.map((d) => d.exercises.map((ex) => ex.exerciseId));

  it("keeps every slot, each one a lift the person can do", () => {
    // A gym plan's curl or lateral raise has nothing in its movement the
    // floor allows, so it takes a hold in its slot rather than staying as a
    // lift the person can't do, or going for good.
    for (const days of DAYS) {
      const gym = build(days, "full_gym").programState.workouts;
      const none = build(days, "no_equipment", build(days, "full_gym"))
        .programState.workouts;
      expect(needsKit(none), `${days}d`).toEqual([]);
      expect(
        none.map((d) => d.exercises.length),
        `${days}d`
      ).toEqual(gym.map((d) => d.exercises.length));
    }
  });

  it("brings the gym's lifts back when the kit comes back", () => {
    for (const days of DAYS) {
      const gym = build(days, "full_gym");
      const back = build(days, "full_gym", build(days, "no_equipment", gym));
      expect(ids(back.programState.workouts), `${days}d`).toEqual(
        ids(gym.programState.workouts)
      );
    }
  });
});

describe("the no-equipment option", () => {
  /** The `desc` beside `id: "no_equipment"` in a source file's option list. */
  const copy = (path: string) => {
    const source = readFileSync(resolve(repoRoot, path), "utf8");
    const match = source.match(/id: "no_equipment",[\s\S]*?desc: "([^"]+)"/);
    if (!match) throw new Error(`no no_equipment option in ${path}`);
    return match[1];
  };

  it.each([
    "src/pages/Onboarding.tsx",
    "src/components/program/ProgrammeSettings.tsx",
  ])("names the table and no kit: %s", (path) => {
    expect(copy(path)).toMatch(/table/);
    expect(copy(path)).not.toMatch(
      /barbell|dumbbell|kettlebell|cable|machine|band|bench|\bbar\b/i
    );
  });
});
