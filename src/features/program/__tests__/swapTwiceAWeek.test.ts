/**
 * No lift more than twice a week (`MAX_WEEKLY_LIFT_EXPOSURES`), the swaps for
 * a person's kit and injuries included.
 *
 * `capRepeatedLifts` holds the cap in `generateProgram`, and the injury and
 * equipment filters (Lift4 (11)) run after it. Their pickers chose a
 * replacement by the bank's order alone, so a three-day full body at home
 * swapped the squat day's machine leg curl for a third deadlift (with a
 * barbell) or a third dumbbell RDL (without one), and the posterior day's leg
 * press for a third squat or goblet squat. An injury's swaps did the same in
 * a full gym: a sore knee's leg press became a third Bulgarian split squat.
 *
 * The cap can't simply run again after the filters: its picker doesn't know
 * the person's kit or injuries, so it would hand back lifts they can't do.
 * The filters' pickers keep the cap themselves.
 *
 * End to end through `buildPlan`, as the person gets the plan.
 */
import { describe, it, expect } from "vitest";

import { buildPlan, type PlanBuilderInput } from "../planBuilder";
import { MAX_WEEKLY_LIFT_EXPOSURES } from "../overlapModel";
import type { PrimaryGoal, WorkoutDay } from "../programTypes";

function input(over: Partial<PlanBuilderInput> = {}): PlanBuilderInput {
  return {
    primaryGoal: "hypertrophy",
    nutritionPhase: "recomp",
    experience: "beginner",
    sessionMinutes: 60,
    bodyweightKg: 80,
    sex: "male",
    liftDays: 3,
    preferredSplit: "auto",
    runMode: "freeform",
    weeklyRunDays: 0,
    equipment: "full_gym",
    injuries: [],
    currentDate: "2026-03-09",
    ...over,
  } as PlanBuilderInput;
}

const workoutsFor = (over: Partial<PlanBuilderInput> = {}) =>
  buildPlan(input(over)).programState.workouts;

const timesAWeek = (workouts: readonly WorkoutDay[]) => {
  const times = new Map<string, number>();
  for (const ex of workouts.flatMap((d) => d.exercises)) {
    times.set(ex.exerciseId, (times.get(ex.exerciseId) ?? 0) + 1);
  }
  return times;
};

/** Each lift the week has more than twice, as `id ×n`. */
const pastTheCap = (workouts: readonly WorkoutDay[]) =>
  [...timesAWeek(workouts)]
    .filter(([, n]) => n > MAX_WEEKLY_LIFT_EXPOSURES)
    .map(([id, n]) => `${id} ×${n}`);

/** The lifts of a day, `id` for a main lift and `id~` for a supporting
 *  one. */
const liftsOn = (workouts: readonly WorkoutDay[], dayName: string) =>
  workouts
    .find((d) => d.dayName === dayName)
    ?.exercises.map((e) => `${e.exerciseId}${e.isAccessory ? "~" : ""}`);

const daysWith = (workouts: readonly WorkoutDay[], exerciseId: string) =>
  workouts
    .filter((d) => d.exercises.some((e) => e.exerciseId === exerciseId))
    .map((d) => d.dayName);

const SQUAT_DAY = "Full Body — Squat Focus";
const DEADLIFT_DAY = "Full Body — Deadlift Focus";
const POSTERIOR_DAY = "Full Body — Posterior Focus";

describe("the swaps for a home gym keep every lift to two days a week", () => {
  it("without a barbell: the dumbbell RDL and the goblet squat twice each", () => {
    const workouts = workoutsFor({ equipment: "home_gym" });
    expect(pastTheCap(workouts)).toEqual([]);
    // The main lifts keep the swap's first choice; the supporting slots
    // take the next lift the person can do once the week has it twice.
    expect(daysWith(workouts, "db-rdl")).toEqual([DEADLIFT_DAY, POSTERIOR_DAY]);
    expect(liftsOn(workouts, DEADLIFT_DAY)).toContain("db-rdl");
    expect(liftsOn(workouts, POSTERIOR_DAY)).toContain("db-rdl");
    expect(liftsOn(workouts, SQUAT_DAY)).toContain("glute-bridge~");
    expect(daysWith(workouts, "goblet-squat")).toEqual([
      SQUAT_DAY,
      DEADLIFT_DAY,
    ]);
    expect(liftsOn(workouts, POSTERIOR_DAY)).toContain("bodyweight-squat~");
  });

  it("with a barbell: the deadlift and the squat keep their two days", () => {
    const workouts = workoutsFor({
      equipment: "home_gym",
      barbellAtHome: true,
    });
    expect(pastTheCap(workouts)).toEqual([]);
    expect(daysWith(workouts, "deadlift")).toEqual([
      DEADLIFT_DAY,
      POSTERIOR_DAY,
    ]);
    expect(daysWith(workouts, "squat")).toEqual([SQUAT_DAY, DEADLIFT_DAY]);
    // The leg curl becomes a hip thrust and the leg press a goblet squat,
    // where they were a third deadlift and a third squat.
    expect(liftsOn(workouts, SQUAT_DAY)).toContain("hip-thrust~");
    expect(liftsOn(workouts, POSTERIOR_DAY)).toContain("goblet-squat~");
  });

  it("with minimal kit, as at home", () => {
    const noBarbell = workoutsFor({ equipment: "minimal" });
    expect(pastTheCap(noBarbell)).toEqual([]);
    expect(daysWith(noBarbell, "db-rdl")).toEqual([
      DEADLIFT_DAY,
      POSTERIOR_DAY,
    ]);
    const barbell = workoutsFor({ equipment: "minimal", barbellAtHome: true });
    expect(pastTheCap(barbell)).toEqual([]);
    expect(daysWith(barbell, "deadlift")).toEqual([
      DEADLIFT_DAY,
      POSTERIOR_DAY,
    ]);
  });

  it("at every level", () => {
    for (const experience of ["intermediate", "advanced"] as const) {
      const noBarbell = workoutsFor({ experience, equipment: "home_gym" });
      expect(pastTheCap(noBarbell), experience).toEqual([]);
      // The Bulgarian split squat twice, and the front squat a goblet squat.
      expect(daysWith(noBarbell, "bulgarian-split"), experience).toEqual([
        SQUAT_DAY,
        DEADLIFT_DAY,
      ]);
      expect(liftsOn(noBarbell, POSTERIOR_DAY), experience).toContain(
        "goblet-squat~"
      );

      const barbell = workoutsFor({
        experience,
        equipment: "home_gym",
        barbellAtHome: true,
      });
      expect(pastTheCap(barbell), experience).toEqual([]);
      expect(daysWith(barbell, "deadlift"), experience).toEqual([
        DEADLIFT_DAY,
        POSTERIOR_DAY,
      ]);
    }
  });

  it("when a plan the person has moves to a home gym", () => {
    // A save that changes the kit keeps the plan and swaps what the kit
    // can't do, here the squats and the leg press.
    const built = buildPlan(input()).programState;
    const moved = buildPlan(
      input({
        equipment: "home_gym",
        existingState: built,
        previousExperience: "beginner",
        preserveHistory: true,
      })
    ).programState.workouts;
    expect(pastTheCap(moved)).toEqual([]);
    expect(daysWith(moved, "goblet-squat")).toEqual([SQUAT_DAY, DEADLIFT_DAY]);
    expect(liftsOn(moved, POSTERIOR_DAY)).toContain("bodyweight-squat~");
  });
});

describe("the swaps for an injury keep every lift to two days a week", () => {
  it("a sore knee: the leg press becomes a hip thrust, not a third Bulgarian split squat", () => {
    const workouts = workoutsFor({ injuries: ["knee"] });
    expect(pastTheCap(workouts)).toEqual([]);
    expect(daysWith(workouts, "bulgarian-split")).toEqual([
      SQUAT_DAY,
      DEADLIFT_DAY,
    ]);
    expect(liftsOn(workouts, POSTERIOR_DAY)).toContain("hip-thrust~");
  });

  it("a sore back: the front squat becomes a glute bridge, not a third Bulgarian split squat", () => {
    const workouts = workoutsFor({
      primaryGoal: "strength",
      experience: "intermediate",
      injuries: ["lower_back"],
    });
    expect(pastTheCap(workouts)).toEqual([]);
    expect(daysWith(workouts, "bulgarian-split")).toEqual([
      SQUAT_DAY,
      DEADLIFT_DAY,
    ]);
    expect(liftsOn(workouts, POSTERIOR_DAY)).toContain("glute-bridge~");
  });
});

describe("when every lift a slot may take is in the week twice", () => {
  it("takes the one it took before, so the week has it a third time", () => {
    // A beginner with a sore back at home: the glute bridge is the only
    // hinge the bank has that spares the back without a barbell or a
    // machine, and both deadlifts became one. The leg curl's slot can't be
    // a dumbbell RDL (the back) or a Nordic curl (above a beginner's level,
    // which ranks above the cap), so it is the glute bridge again.
    const workouts = workoutsFor({
      equipment: "home_gym",
      injuries: ["lower_back"],
    });
    expect(pastTheCap(workouts)).toEqual(["glute-bridge ×3"]);
    expect(liftsOn(workouts, SQUAT_DAY)).toContain("glute-bridge~");
    expect(timesAWeek(workouts).get("nordic-hamstring-curl")).toBeUndefined();
  });
});

/* The whole space a plan is built from: every focus, day count, kit and
   level. At the longest session, because the time fit only takes lifts out
   (`fitSessionsToTime`), so a shorter session's week is a part of this one's
   and can't have a lift more often. */
const GOALS: PrimaryGoal[] = [
  "strength",
  "hypertrophy",
  "fat_loss",
  "general",
  "running",
];
const KITS: Partial<PlanBuilderInput>[] = [
  { equipment: "full_gym" },
  { equipment: "home_gym" },
  { equipment: "home_gym", barbellAtHome: true },
  { equipment: "minimal" },
  { equipment: "minimal", barbellAtHome: true },
];
const LEVELS = ["beginner", "intermediate", "advanced"] as const;

/** Whether a swap gave a lift one of the two days the week has it. */
const swapMeetsTheCap = (workouts: readonly WorkoutDay[]) => {
  const times = timesAWeek(workouts);
  return workouts
    .flatMap((d) => d.exercises)
    .some(
      (ex) =>
        ex.swappedFrom !== undefined &&
        times.get(ex.exerciseId) === MAX_WEEKLY_LIFT_EXPOSURES
    );
};

describe("no plan has a lift more than twice a week", () => {
  it("across every focus, day count, kit and level", () => {
    const past: string[] = [];
    let plans = 0;
    let atTheCap = 0;
    for (const experience of LEVELS) {
      for (const primaryGoal of GOALS) {
        for (let liftDays = 1; liftDays <= 6; liftDays++) {
          for (const kit of KITS) {
            const workouts = workoutsFor({
              experience,
              primaryGoal,
              liftDays,
              sessionMinutes: 75,
              ...kit,
            });
            plans += 1;
            if (swapMeetsTheCap(workouts)) atTheCap += 1;
            const over = pastTheCap(workouts);
            if (over.length > 0) {
              past.push(
                `${experience} ${primaryGoal} ${liftDays}d ${kit.equipment}` +
                  `${kit.barbellAtHome ? "+barbell" : ""}: ${over.join(", ")}`
              );
            }
          }
        }
      }
    }
    expect(plans).toBe(450);
    // The sweep reaches the cap through swaps, so it tests the picker.
    expect(atTheCap).toBeGreaterThan(0);
    expect(past, past.slice(0, 8).join("\n")).toEqual([]);
    // 450 plans built from setup: about 2 s alone, and past the default
    // 5 s on a runner busy with the rest of the suite.
  }, 30_000);
});
