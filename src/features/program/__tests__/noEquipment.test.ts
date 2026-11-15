/**
 * The no-equipment setup: someone who owns nothing is given floor moves
 * only, and still gets a whole plan: push, squat, hinge, the trunk and the
 * superman hold for the back. With nothing to pull on it has no pull
 * (`noEquipment.ts`); a doorway pull-up bar, when the person has one, adds
 * pull-ups, chin-ups and the hanging leg raise.
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
import {
  applyProgression,
  chooseSplit,
  splitRationale,
} from "../programEngine";
import {
  BODYWEIGHT_EXERCISES_NEEDING_KIT,
  NO_EQUIPMENT_EXERCISE_IDS,
  NO_EQUIPMENT_LAST_RESORT,
  NO_EQUIPMENT_BEGINNER_BAR_NOTE,
  NO_EQUIPMENT_PULL_NOTE,
  NO_EQUIPMENT_STAND_INS,
  SUPERMAN_SETS_PER_SESSION,
  SUPERMAN_SETS_PER_WEEK,
  capSupermanVolume,
  noEquipmentPullNote,
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

  it("leaves out what hangs from a bar, dips on bars, lies on a bench or leans on a wall", () => {
    for (const id of [
      "pull-ups",
      "chin-ups",
      "leg-raise",
      "inverted-row",
      "dips",
      "tricep-dips",
      "bench-dips",
      "weighted-push-ups",
      "handstand-push-ups",
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

  it("pushes, squats, hinges, holds the back and trains the trunk every week", () => {
    for (const { goal, level, days } of matrix) {
      const week = lifts(plan(goal, level, days).programState.workouts);
      const at = `${goal}/${level}/${days}d`;
      const has = (...categories: string[]) =>
        week.some((ex) => categories.includes(ex.movementCategory));
      expect(has("horizontal_push", "vertical_push"), `${at} push`).toBe(true);
      expect(has("knee_dominant"), `${at} squat or lunge`).toBe(true);
      expect(
        week.some((ex) => ex.exerciseId === "glute-bridge"),
        `${at} hinge`
      ).toBe(true);
      expect(has("core"), `${at} core`).toBe(true);
      // The back work the floor allows: there is nothing to pull on.
      expect(
        week.some((ex) => ex.exerciseId === "superman-hold"),
        `${at} back`
      ).toBe(true);
    }
  });

  it("has no pull, and no day named for one", () => {
    // Insanity, T25 and Nike Training Club's no-equipment workouts have
    // none either: pulling needs something to pull on.
    for (const { goal, level, days } of matrix) {
      const { workouts } = plan(goal, level, days).programState;
      const at = `${goal}/${level}/${days}d`;
      expect(
        lifts(workouts)
          .filter((ex) =>
            ["horizontal_pull", "vertical_pull", "arms_biceps"].includes(
              ex.movementCategory
            )
          )
          .map((ex) => ex.name),
        at
      ).toEqual([]);
      expect(
        workouts.map((day) => day.dayName).filter((n) => /^Pull\b/.test(n)),
        at
      ).toEqual([]);
    }
  });

  it("covers every pattern in each session of a full-body week", () => {
    // Two and three days are full-body weeks: each session is the whole
    // body, so each has a push, a squat and a hinge.
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

  it("says what each swap replaced in the plan the person has, and nothing in a new one", () => {
    const swapNotes = (w: readonly WorkoutDay[]) =>
      lifts(w).filter((ex) =>
        /not available with your equipment/.test(ex.notes ?? "")
      );
    for (const days of DAYS) {
      // A new plan's lifts were chosen for the kit: no "Swapped from".
      expect(
        swapNotes(build(days, "no_equipment").programState.workouts),
        `${days}d new`
      ).toEqual([]);
      // A plan the person has: each lift that moved says what it was.
      const moved = build(days, "no_equipment", build(days, "full_gym"))
        .programState.workouts;
      expect(swapNotes(moved).length, `${days}d moved`).toBeGreaterThan(0);
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

  it("gives the supermen a swap brings in a hold's sets, in their slots", () => {
    for (const days of DAYS) {
      const none = build(days, "no_equipment", build(days, "full_gym"))
        .programState.workouts;
      const holds = supermen(none);
      expect(holds.length, `${days}d`).toBeGreaterThan(0);
      for (const ex of holds) {
        expect(ex.sets, `${days}d`).toBeLessThanOrEqual(3);
        expect(ex.baseSets ?? ex.sets, `${days}d`).toBe(ex.sets);
      }
      expect(weekSets(none), `${days}d`).toBeLessThanOrEqual(6);
    }
  });

  it("leaves the sets the person gave their own superman", () => {
    const mine = build(4, "no_equipment");
    const workouts = mine.programState.workouts.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) =>
        ex.exerciseId === "superman-hold" ? { ...ex, sets: 5, baseSets: 5 } : ex
      ),
    }));
    const saved = build(4, "no_equipment", {
      ...mine,
      programState: { ...mine.programState, workouts },
    });
    expect(supermen(workouts).length).toBeGreaterThan(0);
    expect(supermen(saved.programState.workouts).map((ex) => ex.sets)).toEqual(
      supermen(workouts).map(() => 5)
    );
  });
});

const supermen = (workouts: readonly WorkoutDay[]) =>
  lifts(workouts).filter((ex) => ex.exerciseId === "superman-hold");
const weekSets = (workouts: readonly WorkoutDay[]) =>
  supermen(workouts).reduce((sum, ex) => sum + ex.sets, 0);

describe("the superman hold's sets", () => {
  it("are 3 at most in a session and about 6 in a week, bar or no bar", () => {
    for (const goal of GOALS)
      for (const level of LEVELS)
        for (const days of DAYS)
          for (const pullUpBar of [false, true]) {
            const { workouts } = buildPlan({
              primaryGoal: goal,
              nutritionPhase: "recomp",
              experience: level,
              bodyweightKg: 80,
              sex: "male",
              liftDays: days,
              preferredSplit: "auto",
              runMode: "freeform",
              weeklyRunDays: 0,
              equipment: "no_equipment",
              pullUpBar,
              injuries: [],
              currentDate: "2026-07-28",
            } as PlanBuilderInput).programState;
            const at = `${goal}/${level}/${days}d/bar ${pullUpBar}`;
            for (const day of workouts)
              expect(
                weekSets([day]),
                `${at} ${day.dayName}`
              ).toBeLessThanOrEqual(SUPERMAN_SETS_PER_SESSION);
            expect(weekSets(workouts), at).toBeLessThanOrEqual(
              SUPERMAN_SETS_PER_WEEK
            );
          }
  });

  it("keeps the hold where it's the day's back work, two sets each, in a new plan", () => {
    const day = (
      name: string,
      ...ids: [string, string, number][]
    ): WorkoutDay =>
      ({
        dayName: name,
        exercises: ids.map(([exerciseId, movementCategory, sets]) => ({
          exerciseId,
          movementCategory,
          sets,
          baseSets: sets,
        })),
      }) as unknown as WorkoutDay;
    const week = [
      day(
        "Lower",
        ["glute-bridge", "hip_dominant", 3],
        ["superman-hold", "core", 2]
      ),
      day(
        "Upper A",
        ["push-ups", "horizontal_push", 3],
        ["superman-hold", "core", 4]
      ),
      day(
        "Full",
        ["glute-bridge", "hip_dominant", 2],
        ["superman-hold", "core", 2]
      ),
      day(
        "Upper B",
        ["pike-push-up", "vertical_push", 3],
        ["superman-hold", "core", 4]
      ),
      day("Hold", ["superman-hold", "core", 3]),
    ];
    const capped = capSupermanVolume(week, { drop: true });
    // Where it's the day's back work it stays, two sets each; a day with a
    // glute bridge has its hinge and loses the hold.
    expect(capped.map((d) => supermen([d]).map((ex) => ex.sets))).toEqual([
      [],
      [2],
      [],
      [2],
      [2],
    ]);
    expect(capped[0].exercises.map((ex) => ex.exerciseId)).toEqual([
      "glute-bridge",
    ]);
    // In the plan the person has, every slot stays.
    const kept = capSupermanVolume(week, { drop: false });
    expect(kept.map((d) => supermen([d]).map((ex) => ex.sets))).toEqual([
      [1],
      [2],
      [1],
      [1],
      [1],
    ]);
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
  ])("says bodyweight on the floor, and names no kit: %s", (path) => {
    expect(copy(path)).toMatch(/bodyweight/i);
    expect(copy(path)).toMatch(/floor/);
    expect(copy(path)).not.toMatch(
      /barbell|dumbbell|kettlebell|cable|machine|band|bench|table|chair|\bbar\b/i
    );
  });

  it("says under the bar switch that there's no pulling, and that the switch adds it", () => {
    expect(NO_EQUIPMENT_PULL_NOTE).toBe(
      "No pulling without something to pull on. Have a doorway pull-up bar? Turn it on above."
    );
    expect(noEquipmentPullNote("no_equipment", false, "intermediate")).toBe(
      NO_EQUIPMENT_PULL_NOTE
    );
    expect(noEquipmentPullNote("no_equipment", undefined, undefined)).toBe(
      NO_EQUIPMENT_PULL_NOTE
    );
  });

  it("says nothing once the bar gives the plan its pull", () => {
    expect(
      noEquipmentPullNote("no_equipment", true, "intermediate")
    ).toBeNull();
    expect(noEquipmentPullNote("no_equipment", true, "advanced")).toBeNull();
    for (const equipment of ["full_gym", "home_gym", "minimal"])
      expect(
        noEquipmentPullNote(equipment, false, "beginner"),
        equipment
      ).toBeNull();
  });

  it("tells a beginner with a bar why it has no pull-ups, once the level is chosen", () => {
    expect(noEquipmentPullNote("no_equipment", true, "beginner")).toBe(
      NO_EQUIPMENT_BEGINNER_BAR_NOTE
    );
    // Setup asks the level after the kit: until it's chosen, nothing.
    expect(noEquipmentPullNote("no_equipment", true, undefined)).toBeNull();
  });
});

describe("a no-equipment plan with a doorway pull-up bar", () => {
  const withBar = (
    primaryGoal: PrimaryGoal,
    experience: string,
    days: number
  ) =>
    buildPlan({
      primaryGoal,
      nutritionPhase: "recomp",
      experience,
      bodyweightKg: 80,
      sex: "male",
      liftDays: days,
      preferredSplit: "auto",
      runMode: "freeform",
      weeklyRunDays: 0,
      equipment: "no_equipment",
      pullUpBar: true,
      injuries: [],
      currentDate: "2026-07-28",
    } as PlanBuilderInput).programState;
  const BAR = new Set(["pull-ups", "chin-ups", "leg-raise"]);

  it("adds the bar's three lifts and nothing else that needs kit", () => {
    for (const goal of GOALS)
      for (const level of LEVELS)
        for (const days of DAYS) {
          const { workouts } = withBar(goal, level, days);
          expect(
            lifts(workouts)
              .map((ex) => ex.exerciseId)
              .filter(
                (id) => !NO_EQUIPMENT_EXERCISE_IDS.has(id) && !BAR.has(id)
              ),
            `${goal}/${level}/${days}d`
          ).toEqual([]);
        }
  });

  it("pulls past beginner, and five or six days get their Pull days back", () => {
    for (const goal of GOALS)
      for (const level of ["intermediate", "advanced"])
        for (const days of DAYS) {
          const { splitType, workouts } = withBar(goal, level, days);
          const at = `${goal}/${level}/${days}d`;
          expect(
            lifts(workouts).some(
              (ex) =>
                ex.exerciseId === "pull-ups" || ex.exerciseId === "chin-ups"
            ),
            at
          ).toBe(true);
          if (days >= 5) {
            expect(splitType, at).not.toBe("upper_lower_fb");
            expect(
              workouts.some((day) => /^Pull\b/.test(day.dayName)),
              at
            ).toBe(true);
          }
        }
  });

  it("gives a beginner the plan without a bar: no pull-ups, and the superman", () => {
    for (const goal of GOALS)
      for (const days of DAYS) {
        const bar = withBar(goal, "beginner", days);
        const none = plan(goal, "beginner", days).programState;
        const at = `${goal}/${days}d`;
        expect(bar.splitType, at).toBe(none.splitType);
        expect(
          lifts(bar.workouts).filter(
            (ex) => ex.exerciseId === "pull-ups" || ex.exerciseId === "chin-ups"
          ),
          at
        ).toEqual([]);
        expect(
          lifts(bar.workouts).some((ex) => ex.exerciseId === "superman-hold"),
          at
        ).toBe(true);
      }
  });

  it("runs the floor split only for a week with nothing to pull with", () => {
    expect(chooseSplit(5, true)).toBe("upper_lower_fb");
    expect(chooseSplit(6, true)).toBe("upper_lower_fb");
    expect(chooseSplit(4, true)).toBe("upper_lower");
    expect(chooseSplit(5, false)).toBe("ppl_ul");
    expect(chooseSplit(6, false)).toBe("ppl_x2");
    expect(splitRationale(6, true)).toMatch(/upper \/ lower twice/);
    expect(splitRationale(6, false)).toBe(splitRationale(6));
  });

  it("keeps the floor list floor moves, so a circuit drawn from it stays on the floor", () => {
    // Circ1: a circuit's lifts are the kit tier's, and with no equipment
    // that's the floor, bar or no bar.
    for (const id of BAR)
      expect(NO_EQUIPMENT_EXERCISE_IDS.has(id), id).toBe(false);
  });
});
