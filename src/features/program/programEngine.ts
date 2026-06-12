import type {
  Goal,
  GoalProfile,
  MovementCategory,
  PrimaryGoal,
  ProgramExercise,
  ProgramState,
  SplitType,
  WorkoutDay,
  WeeklyPrescription,
} from "./programTypes";
import { generateInstanceId } from "./programTypes";
import { pickExercise, pickAccessory, exerciseBank } from "./variationBank";
import {
  balanceWeeklyVolume,
  balancePushPull,
  volumeLandmark,
} from "./volumeModel";
import { seedStartingLoads, type StartingLoadContext } from "./startingLoads";
import { isBodyweightExerciseId } from "@/lib/exercises";
import { format } from "date-fns";

/* ================================
   GOAL PROFILE — maps PrimaryGoal → rep ranges / volume / progression
   ================================
   Reconciles the two-enum drift that existed before W1a: the procedural
   engine only consumed the nutrition `Goal` (cut/lean bulk/recomp) and
   hardcoded main-lift reps at 6, so a user whose `primaryGoal = "strength"`
   silently received hypertrophy reps on every regenerate. `goalProfileFor`
   is the single seam where lifting stimulus now tracks what the user
   actually asked for in onboarding.
*/

const GOAL_PROFILES: Record<PrimaryGoal, GoalProfile> = {
  strength: {
    mainReps: 5,
    accessoryReps: 8,
    volumeMultiplier: 0.9,
    mainProgression: "linear",
  },
  hypertrophy: {
    mainReps: 8,
    accessoryReps: 12,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  fat_loss: {
    mainReps: 12,
    accessoryReps: 15,
    volumeMultiplier: 1.0,
    mainProgression: "linear",
  },
  general: {
    mainReps: 8,
    accessoryReps: 12,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  // running-goal users still lift to support their running — matches the
  // fullBodyBeginner prescription: moderate reps, lower volume.
  running: {
    mainReps: 8,
    accessoryReps: 12,
    volumeMultiplier: 0.85,
    mainProgression: "linear",
  },
};

export function goalProfileFor(primaryGoal?: PrimaryGoal): GoalProfile {
  return GOAL_PROFILES[primaryGoal ?? "general"];
}

/* ================================
   E1RM CALCULATION
================================ */

export function calculateE1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

// Progression tuning (D-LIFT-6 / D-LIFT-11).
/** A logged set at this RPE or above holds load/reps for the cycle. */
const RPE_HOLD_THRESHOLD = 9.5;
/** Bodyweight rep target stops climbing here; the user is prompted to add load. */
const MAX_BODYWEIGHT_REPS = 20;

/* ================================
   WEEKLY PRESCRIPTION
================================ */

export function generateWeekPrescription(week: number): WeeklyPrescription {
  if (week % 4 === 0) {
    return {
      week,
      intensityMultiplier: 0.85,
      volumeModifier: 0.7,
      deload: true,
    };
  }
  return {
    week,
    intensityMultiplier: 1 + (week % 4) * 0.025,
    volumeModifier: 1,
    deload: false,
  };
}

/* ================================
   GOAL ADJUSTMENTS
================================ */

function goalVolumeMultiplier(goal: Goal): number {
  switch (goal) {
    case "cut":
      return 0.9;
    case "lean bulk":
      return 1.12;
    case "recomp":
      return 1.0;
  }
}

function goalWeightBonus(goal: Goal): number {
  switch (goal) {
    case "lean bulk":
      return 1.25;
    default:
      return 0;
  }
}

/* ================================
   SPLIT SELECTION
================================ */

export function chooseSplit(weeklyTarget: number): SplitType {
  if (weeklyTarget <= 0) return "full_body"; // run-only athlete — no lift days
  // Cap at 6. 7 hard lift days/week is the wrong default for every tier
  // (beginner through advanced) — recovery needs at least one non-lift
  // slot. If a user sets 7, we return the 6-day split and the scheduler
  // fills the 7th weekday as active rest / mobility.
  const clamped = Math.min(6, weeklyTarget);
  if (clamped === 1) return "full_body";
  if (clamped === 2) return "upper_lower";
  // 3-day full-body beats 3-day PPL for hypertrophy (2× weekly frequency
  // > 1×, Schoenfeld 2016 at matched volume). Pre-W1a the procedural
  // engine returned "ppl" here, silently contradicting the 3-day
  // full-body hand-written templates.
  if (clamped === 3) return "full_body";
  if (clamped === 4) return "upper_lower";
  if (clamped === 5) return "ppl_ul";
  return "ppl_x2";
}

export function splitLabel(split: SplitType): string {
  switch (split) {
    case "full_body":
      return "Full Body";
    case "upper_lower":
      return "Upper / Lower";
    case "ppl":
      return "Push / Pull / Legs";
    case "ppl_ul":
      return "Push / Pull / Legs + Upper / Lower";
    case "ppl_x2":
      return "Push / Pull / Legs ×2";
    case "ppl_x2_fb":
      return "Push / Pull / Legs ×2 + Full Body";
  }
}

export function primaryGoalLabel(g?: PrimaryGoal): string {
  switch (g) {
    case "strength":
      return "Strength";
    case "hypertrophy":
      return "Hypertrophy";
    case "fat_loss":
      return "Fat Loss";
    case "general":
      return "General Fitness";
    case "running":
      return "Running Support";
    default:
      return "General Fitness";
  }
}

/* ================================
   EXERCISE BUILDER HELPER
================================ */

function makeExercise(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  progression: "double" | "linear",
  existing?: ProgramExercise
): ProgramExercise {
  const ex = pickExercise(
    category,
    existing?.plateauCount ?? 0,
    existing?.exerciseId
  );
  const w = existing?.weight ?? weight;
  return {
    name: ex.name,
    exerciseId: ex.id,
    instanceId: existing?.instanceId ?? generateInstanceId(), // #1038
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight: w,
    progressionType: progression,
    lastSuccessfulWeight: existing?.lastSuccessfulWeight ?? w,
    lastAttemptedWeight: existing?.lastAttemptedWeight ?? w,
    consecutiveFailures: existing?.consecutiveFailures ?? 0,
    plateauCount: existing?.plateauCount ?? 0,
    performanceHistory: existing?.performanceHistory ?? [],
    lastPerformance: existing?.lastPerformance ?? null,
    isAccessory: false,
  };
}

function makeAccessory(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  excludeId?: string
): ProgramExercise {
  const ex = pickAccessory(category, excludeId);
  return {
    name: ex.name,
    exerciseId: ex.id,
    instanceId: generateInstanceId(), // #1038
    movementCategory: category,
    sets,
    reps,
    baseReps: reps,
    weight,
    progressionType: "linear",
    lastSuccessfulWeight: weight,
    lastAttemptedWeight: weight,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
    isAccessory: true,
  };
}

/* ================================
   SPLIT TEMPLATES
================================ */

/**
 * Builder-local volume multiplier — combines lifting-goal stimulus
 * (profile.volumeMultiplier: cut keeps volume steady, running-supportive
 * lifters drop 15%) with nutrition-phase modulation (cut -10%, lean bulk
 * +12%). Both are legitimate independent axes; they compound.
 */
function combinedVolumeMultiplier(
  profile: GoalProfile,
  nutritionGoal: Goal
): number {
  return profile.volumeMultiplier * goalVolumeMultiplier(nutritionGoal);
}

function buildFullBody(
  profile: GoalProfile,
  nutritionGoal: Goal,
  count: number,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  const dayA: WorkoutDay = {
    dayName: "Full Body — Squat Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "horizontal_push",
        round(3 * vm),
        main,
        60,
        profile.mainProgression,
        findExisting(0, 0)
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(0, 1)
      ),
      makeExercise(
        "vertical_pull",
        round(3 * vm),
        acc,
        0,
        profile.mainProgression,
        findExisting(0, 2)
      ),
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(0, 3)
      ),
      makeExercise("core", round(2 * vm), 12, 15, "linear", findExisting(0, 4)),
    ],
  };

  if (count === 1) return [dayA];

  const dayB: WorkoutDay = {
    dayName: "Full Body — Deadlift Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "vertical_push",
        round(3 * vm),
        main,
        40,
        profile.mainProgression,
        findExisting(1, 0)
      ),
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(1, 1)
      ),
      makeExercise(
        "horizontal_pull",
        round(3 * vm),
        acc,
        50,
        profile.mainProgression,
        findExisting(1, 2)
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(1, 3)
      ),
      makeExercise(
        "arms_biceps",
        round(2 * vm),
        12,
        10,
        "linear",
        findExisting(1, 4)
      ),
    ],
  };

  if (count === 2) return [dayA, dayB];

  // 3 days — add a posterior-emphasis day to complete the rotation
  const dayC: WorkoutDay = {
    dayName: "Full Body — Posterior Focus",
    dayType: "full_body",
    completed: false,
    exercises: [
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(2, 0)
      ),
      makeExercise(
        "horizontal_push",
        round(3 * vm),
        acc,
        60,
        profile.mainProgression,
        findExisting(2, 1)
      ),
      makeExercise(
        "vertical_pull",
        round(3 * vm),
        acc,
        0,
        profile.mainProgression,
        findExisting(2, 2)
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(2, 3)
      ),
      makeExercise("core", round(2 * vm), 12, 15, "linear", findExisting(2, 4)),
    ],
  };

  return [dayA, dayB, dayC];
}

function buildUpperLower(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return [
    {
      dayName: "Upper — Chest & Back",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_push",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 0)
        ),
        makeExercise(
          "horizontal_pull",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 1)
        ),
        makeExercise(
          "vertical_push",
          round(3 * vm),
          acc,
          30,
          "linear",
          findExisting(0, 2)
        ),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          12,
          "linear",
          findExisting(0, 3)
        ),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "linear",
          findExisting(0, 4)
        ),
      ],
    },
    {
      dayName: "Lower — Squat Focus",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise(
          "knee_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(1, 0)
        ),
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(1, 1)
        ),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeExercise(
          "core",
          round(3 * vm),
          12,
          15,
          "linear",
          findExisting(1, 3)
        ),
      ],
    },
    {
      dayName: "Upper — Shoulders & Arms",
      dayType: "upper",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_push",
          round(4 * vm),
          main,
          40,
          profile.mainProgression,
          findExisting(2, 0)
        ),
        makeExercise(
          "vertical_pull",
          round(4 * vm),
          main,
          0,
          profile.mainProgression,
          findExisting(2, 1)
        ),
        makeAccessory("horizontal_push", round(3 * vm), acc, 30, "bench-press"),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          10,
          "linear",
          findExisting(2, 3)
        ),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          12,
          "linear",
          findExisting(2, 4)
        ),
      ],
    },
    {
      dayName: "Lower — Deadlift Focus",
      dayType: "lower",
      completed: false,
      exercises: [
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(3, 0)
        ),
        makeAccessory("knee_dominant", round(3 * vm), acc, 50, "squat"),
        makeAccessory("hip_dominant", round(3 * vm), 12, 40, "deadlift"),
        makeExercise(
          "core",
          round(3 * vm),
          12,
          15,
          "linear",
          findExisting(3, 3)
        ),
      ],
    },
  ];
}

function buildPPL(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay[] {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  const findExisting = (dayIdx: number, exIdx: number) =>
    existing?.[dayIdx]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return [
    {
      dayName: "Push — Chest Focus",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_push",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(0, 0)
        ),
        makeExercise(
          "vertical_push",
          round(3 * vm),
          acc,
          30,
          "linear",
          findExisting(0, 1)
        ),
        makeAccessory("horizontal_push", round(3 * vm), 12, 30, "bench-press"),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "linear",
          findExisting(0, 3)
        ),
        makeAccessory(
          "arms_triceps",
          round(3 * vm),
          15,
          10,
          "rope-tricep-pushdown"
        ),
      ],
    },
    {
      dayName: "Pull — Lat Focus",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_pull",
          round(4 * vm),
          main,
          0,
          profile.mainProgression,
          findExisting(1, 0)
        ),
        makeExercise(
          "horizontal_pull",
          round(3 * vm),
          acc,
          50,
          "linear",
          findExisting(1, 1)
        ),
        makeAccessory("vertical_pull", round(3 * vm), 12, 40, "pull-ups"),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          12,
          "linear",
          findExisting(1, 3)
        ),
        makeAccessory("arms_biceps", round(3 * vm), 15, 8, "barbell-curl"),
      ],
    },
    {
      dayName: "Legs — Squat Focus",
      dayType: "legs",
      completed: false,
      exercises: [
        makeExercise(
          "knee_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(2, 0)
        ),
        makeExercise(
          "hip_dominant",
          round(4 * vm),
          main,
          80,
          profile.mainProgression,
          findExisting(2, 1)
        ),
        makeAccessory("knee_dominant", round(3 * vm), 12, 40, "squat"),
        makeExercise(
          "core",
          round(3 * vm),
          15,
          15,
          "linear",
          findExisting(2, 4)
        ),
      ],
    },
    {
      dayName: "Push — Shoulder Focus",
      dayType: "push",
      completed: false,
      exercises: [
        makeExercise(
          "vertical_push",
          round(4 * vm),
          main,
          40,
          profile.mainProgression,
          findExisting(3, 0)
        ),
        makeAccessory("horizontal_push", round(3 * vm), acc, 40, "bench-press"),
        makeAccessory("vertical_push", round(3 * vm), 12, 20, "overhead-press"),
        makeExercise(
          "arms_triceps",
          round(3 * vm),
          12,
          15,
          "linear",
          findExisting(3, 3)
        ),
      ],
    },
    {
      dayName: "Pull — Row Focus",
      dayType: "pull",
      completed: false,
      exercises: [
        makeExercise(
          "horizontal_pull",
          round(4 * vm),
          main,
          60,
          profile.mainProgression,
          findExisting(4, 0)
        ),
        makeAccessory("vertical_pull", round(3 * vm), acc, 40, "pull-ups"),
        makeAccessory("horizontal_pull", round(3 * vm), 12, 30, "barbell-row"),
        makeExercise(
          "arms_biceps",
          round(3 * vm),
          12,
          10,
          "linear",
          findExisting(4, 3)
        ),
      ],
    },
  ];
}

/** Legs B — flipped emphasis from Legs A.
 *  Legs A leads with squat (knee), Legs B leads with deadlift (hip).
 *  Accessories also swap order for different training stimulus. */
function buildLegsB(
  profile: GoalProfile,
  nutritionGoal: Goal,
  existing?: WorkoutDay[]
): WorkoutDay {
  const vm = combinedVolumeMultiplier(profile, nutritionGoal);
  const round = (n: number) => Math.max(1, Math.round(n));
  // Use index 5 for existing exercises (Legs B is the 6th workout day)
  const findExisting = (exIdx: number) => existing?.[5]?.exercises[exIdx];
  const main = profile.mainReps;
  const acc = profile.accessoryReps;

  return {
    dayName: "Legs — Deadlift Focus",
    dayType: "legs",
    completed: false,
    exercises: [
      // Flipped: hip-dominant leads
      makeExercise(
        "hip_dominant",
        round(4 * vm),
        main,
        80,
        profile.mainProgression,
        findExisting(0)
      ),
      makeExercise(
        "knee_dominant",
        round(4 * vm),
        acc,
        60,
        profile.mainProgression,
        findExisting(1)
      ),
      // Accessories in reversed order with different rep ranges
      makeAccessory("hip_dominant", round(3 * vm), 10, 40, "deadlift"),
      makeAccessory("knee_dominant", round(3 * vm), 10, 40, "squat"),
      makeExercise("core", round(3 * vm), 12, 15, "linear", findExisting(4)),
    ],
  };
}

/* ================================
   GENERATE FULL PROGRAM
================================ */

/**
 * Number of lift WorkoutDays `generateProgram` emits for a weekly lift-day
 * target. Mirrors `chooseSplit` + the per-case slicing in generateProgram
 * (full_body caps at 3, UL slices to 2 at ≤2 days, ppl_ul = 5, ppl_x2 = 6) —
 * the net length equals the target, capped at 6 (chooseSplit clamps 7→6), and
 * 0 for a non-positive target. Pgm5 (Q2): planBuilder uses this to distinguish
 * a CONTENT edit (same day count → preserve the user's workouts) from a
 * lift-days change (→ rebuild). Pinned to `generateProgram(...).workouts.length`
 * by a parity test, so a future template change that breaks the equality is
 * caught rather than silently misrouting edits.
 */
export function expectedDayCount(weeklyTarget: number): number {
  if (weeklyTarget <= 0) return 0;
  return Math.min(weeklyTarget, 6);
}

/**
 * D-LIFT-12: within each day, ensure no exercise id appears twice. A duplicate
 * (a main that rotated onto a variation an accessory also picked) is re-pointed
 * to the first unused variation in the same movement category. Deterministic;
 * leaves the duplicate as-is only if the category has no free alternative.
 * Pure — returns a new array.
 */
/**
 * D-LIFT-4: rotate UNTRAINED accessories (no logged history) to a different
 * variation in the same movement category — periodic novelty without disturbing
 * the user's actual training. Mains and any accessory with logged history are
 * left untouched. Keeps the slot's `instanceId` (same row, new movement) so the
 * reorderable list doesn't churn. Pure.
 */
export function rotateUntrainedAccessories(
  workouts: WorkoutDay[]
): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      if (!ex.isAccessory) return ex; // mains never rotate
      if ((ex.performanceHistory?.length ?? 0) > 0) return ex; // trained → keep
      const next = pickAccessory(ex.movementCategory, ex.exerciseId);
      if (next.id === ex.exerciseId) return ex; // no alternative available
      return {
        ...ex,
        exerciseId: next.id,
        name: next.name,
        lastPerformance: null,
        consecutiveFailures: 0,
        plateauCount: 0,
      };
    }),
  }));
}

export function dedupeDayExercises(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => {
    const seen = new Set<string>();
    const exercises = day.exercises.map((ex) => {
      if (!seen.has(ex.exerciseId)) {
        seen.add(ex.exerciseId);
        return ex;
      }
      const alt = (exerciseBank[ex.movementCategory] ?? []).find(
        (o) => !seen.has(o.id)
      );
      if (!alt) {
        seen.add(ex.exerciseId);
        return ex; // no free variation — leave it
      }
      seen.add(alt.id);
      return { ...ex, exerciseId: alt.id, name: alt.name };
    });
    return { ...day, exercises };
  });
}

export function generateProgram(
  nutritionGoal: Goal,
  weeklyTarget: number,
  existingWorkouts?: WorkoutDay[],
  primaryGoal?: PrimaryGoal,
  loadCtx?: StartingLoadContext
): { splitType: SplitType; workouts: WorkoutDay[] } {
  // 0 lift days → run-only athlete, return empty workouts
  if (weeklyTarget <= 0) {
    return { splitType: "full_body", workouts: [] };
  }

  // The training stimulus (reps / main-lift progression / volume) now
  // tracks the user's declared `primaryGoal`. Before W1a the engine only
  // knew the nutrition goal, so strength users silently got hypertrophy
  // reps on every regenerate. `goalProfileFor` defaults to "general" if
  // `primaryGoal` wasn't passed (e.g. legacy call sites).
  const profile = goalProfileFor(primaryGoal);

  const splitType = chooseSplit(weeklyTarget);
  let workouts: WorkoutDay[];

  switch (splitType) {
    case "full_body": {
      // `chooseSplit` now returns "full_body" for 3-day targets too
      // (beats 3-day PPL for hypertrophy). Cap at 3 days of rotation.
      const fbDays = Math.min(weeklyTarget, 3);
      workouts = buildFullBody(
        profile,
        nutritionGoal,
        fbDays,
        existingWorkouts
      );
      break;
    }
    case "ppl":
      workouts = buildPPL(profile, nutritionGoal, existingWorkouts).slice(0, 3);
      break;
    case "upper_lower": {
      const ul = buildUpperLower(profile, nutritionGoal, existingWorkouts);
      // 2-day uses first upper + first lower only
      workouts = weeklyTarget <= 2 ? ul.slice(0, 2) : ul;
      break;
    }
    case "ppl_ul":
      workouts = [
        ...buildPPL(profile, nutritionGoal, existingWorkouts).slice(0, 3),
        ...buildUpperLower(profile, nutritionGoal, existingWorkouts).slice(
          0,
          2
        ),
      ];
      break;
    case "ppl_x2": {
      const ppl = buildPPL(profile, nutritionGoal, existingWorkouts);
      workouts = [...ppl, buildLegsB(profile, nutritionGoal, existingWorkouts)];
      break;
    }
    case "ppl_x2_fb": {
      // Retained for backward-compat — `chooseSplit` no longer returns
      // this (capped at 6 days) but existing programState rows on disk
      // may still pass through here on regeneration.
      const ppl7 = buildPPL(profile, nutritionGoal, existingWorkouts);
      const fb = buildFullBody(profile, nutritionGoal, 1, existingWorkouts);
      workouts = [
        ...ppl7,
        buildLegsB(profile, nutritionGoal, existingWorkouts),
        {
          ...fb[0],
          dayName: "Full Body (Recovery)",
          completed: false,
          exercises: fb[0].exercises.map((ex) => ({ ...ex })),
        },
      ];
      break;
    }
    default:
      workouts = buildUpperLower(profile, nutritionGoal, existingWorkouts);
  }

  // D-LIFT-12: ensure no day picks the same exercise twice (e.g. a main that
  // rotated to a variation an accessory then matched). Re-picks the duplicate
  // to another variation in the same movement category.
  workouts = dedupeDayExercises(workouts);
  // D-LIFT-1 (active): nudge under-dosed muscles up toward the goal volume
  // landmark by growing their accessories (add-only, mains untouched).
  workouts = balanceWeeklyVolume(workouts, volumeLandmark(primaryGoal));
  // D-LIFT-3: keep weekly pull volume ≥ push (shoulder-health balance).
  workouts = balancePushPull(workouts);
  // D-LIFT-5: seed bodyweight-relative cold-start loads on never-trained mains
  // (no-op without a load context, or for lifts with logged history).
  if (loadCtx) workouts = seedStartingLoads(workouts, loadCtx);

  return { splitType, workouts };
}

/* ================================
   EXERCISE-SPECIFIC PROGRESSION
================================ */

export function applyProgression(
  exercise: ProgramExercise,
  actualReps: number,
  actualWeight: number,
  goal: Goal,
  microloading: boolean,
  actualRpe?: number
): ProgramExercise {
  const today = format(new Date(), "yyyy-MM-dd");
  const record = {
    date: today,
    weight: actualWeight,
    repsCompleted: actualReps,
    repsTarget: exercise.reps,
  };
  const history = [...(exercise.performanceHistory || []), record].slice(-10);

  const updated: ProgramExercise = {
    ...exercise,
    lastAttemptedWeight: actualWeight,
    performanceHistory: history,
    lastPerformance: {
      sets: exercise.sets,
      reps: actualReps,
      weight: actualWeight,
      completed: actualReps >= exercise.reps,
    },
  };

  const completed =
    actualReps >= exercise.reps && actualWeight >= exercise.weight;

  // Use the static EXERCISES.equipment field to identify true
  // bodyweight movements (Pull-Ups, Dips, etc.). The previous
  // `weight === 0` shortcut couldn't distinguish bodyweight from
  // "weighted exercise with no calibrated starting weight yet" — so
  // a fresh Lat Pulldown or Leg Press at 0kg got progressed via the
  // BW path (rep increases instead of load increases) and rendered
  // in history as "BW × 10" with 0kg volume.
  const isBodyweight = isBodyweightExerciseId(exercise.exerciseId);
  // Uncalibrated weighted exercise — skip progression entirely. We
  // can't add a sensible load increment from 0, and the "add reps"
  // BW fallback would mislabel the movement going forward.
  const isUncalibrated = !isBodyweight && exercise.weight === 0;
  if (isUncalibrated) {
    return {
      ...updated,
      lastSuccessfulWeight: actualWeight,
      consecutiveFailures: 0,
      plateauCount: 0,
    };
  }
  const resetReps = exercise.baseReps ?? exercise.reps; // anchor to original prescription

  // D-LIFT-6 (RPE autoregulation): a logged near-maximal effort (RPE ≥ 9.5)
  // means the load is already at the edge — HOLD this cycle rather than add
  // load/reps, even on a completed set. No RPE logged → progress as before.
  const rpeOk = actualRpe == null || actualRpe < RPE_HOLD_THRESHOLD;
  // D-LIFT-11: bodyweight rep target rises by 1 per success, but is capped —
  // a pull-up shouldn't drift to "25 reps"; at the cap, prompt adding load.
  const bumpBodyweightReps = () => {
    if (exercise.reps >= MAX_BODYWEIGHT_REPS) {
      updated.notes =
        "Hitting 20+ reps — add load (weighted vest / band) to keep progressing.";
    } else {
      updated.reps = exercise.reps + 1;
    }
  };

  if (exercise.progressionType === "double") {
    if (completed) {
      // True double progression: accumulate reps until ceiling, then increase weight
      if (actualReps >= exercise.reps + 2 && rpeOk) {
        if (isBodyweight) {
          // Bodyweight: progress via rep target increase (capped)
          bumpBodyweightReps();
        } else {
          // Weighted: increase weight and reset reps to base prescription
          updated.weight = exercise.weight + 2.5 + goalWeightBonus(goal);
          updated.reps = resetReps;
        }
      }
      // Otherwise: success recorded but reps still accumulating toward ceiling
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;

      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          // Bodyweight deload: reduce rep target (minimum 4)
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.round(exercise.weight * 0.95 * 2) / 2;
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  } else {
    if (completed) {
      if (isBodyweight) {
        // Bodyweight linear: increase rep target when exceeding by 2 (capped)
        if (actualReps >= exercise.reps + 2 && rpeOk) {
          bumpBodyweightReps();
        }
      } else if (microloading && rpeOk) {
        updated.weight = exercise.weight + 1;
      } else {
        if (actualReps >= exercise.reps + 2 && rpeOk) {
          updated.weight = exercise.weight + 2.5;
          updated.reps = resetReps; // reset to original prescription, not drifted value
        }
      }
      updated.lastSuccessfulWeight = actualWeight;
      updated.consecutiveFailures = 0;
      updated.plateauCount = 0;
    } else {
      updated.consecutiveFailures = (exercise.consecutiveFailures || 0) + 1;
      if (updated.consecutiveFailures >= 3) {
        if (isBodyweight) {
          updated.reps = Math.max(4, exercise.reps - 1);
        } else {
          updated.weight = Math.max(0, exercise.weight - 1);
        }
        updated.consecutiveFailures = 0;
        updated.plateauCount = (exercise.plateauCount || 0) + 1;
      }
    }
  }

  return updated;
}

/* ================================
   PROGRESSION DIRECTION (for UI)
================================ */

export type ProgressionDirection = "up" | "down" | "stable";

export function getProgressionDirection(
  ex: ProgramExercise
): ProgressionDirection {
  if (!ex.lastAttemptedWeight || ex.lastAttemptedWeight === 0) return "stable";
  if (ex.weight > ex.lastAttemptedWeight) return "up";
  if (ex.weight < ex.lastAttemptedWeight) return "down";
  return "stable";
}

export function getProgressionLabel(ex: ProgramExercise): string {
  const dir = getProgressionDirection(ex);
  const w = ex.weight > 0 ? `${ex.weight}kg` : "BW";

  if (
    dir === "up" &&
    ex.lastAttemptedWeight &&
    ex.weight > ex.lastAttemptedWeight
  )
    return `${w} ↑`;
  if (dir === "down") return `${w} ↓`;
  return w;
}

/* ================================
   FATIGUE / DELOAD / ADVANCEMENT
================================ */

/**
 * Acute training-fatigue score for the week just trained, derived from the
 * per-exercise failure state the logger already tracks (D-LIFT-8). `applyFatigue`
 * trims next week's volume when this exceeds 20; previously the score it read
 * (`state.fatigueScore`) was never updated by anything, so the cut never fired.
 *
 * Signal = unresolved recent failures (`consecutiveFailures`, 0..2 — the 3rd
 * miss triggers a backoff that resets it). Acute by construction: it climbs
 * while a lifter is grinding sets and falls once loads back off, so it can't
 * ratchet up forever the way a cumulative `plateauCount` would. Weighted so the
 * >20 cut needs a meaningful share of the program actively failing (≈2 lifts at
 * two straight misses, or ~3 at one), and clamped for safety.
 */
export function computeFatigueScore(workouts: WorkoutDay[]): number {
  let failures = 0;
  for (const day of workouts) {
    for (const ex of day.exercises) {
      failures += Math.max(0, ex.consecutiveFailures ?? 0);
    }
  }
  return Math.min(100, failures * 8);
}

export function applyFatigue(
  workouts: WorkoutDay[],
  fatigueScore: number
): WorkoutDay[] {
  if (fatigueScore <= 20) return workouts;
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, Math.round(ex.sets * 0.9)),
    })),
  }));
}

export function applyDeload(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => ({
      ...ex,
      sets: Math.max(2, ex.sets - 1),
      // 0 weight (bodyweight or uncalibrated): no weight to deload
      // — leave at 0. Sets reduction above is the deload signal.
      // Weighted: round to 2.5kg increments (standard plate size).
      weight: ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
    })),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed || day.skipped);
}

export function advanceWeek(state: ProgramState): ProgramState {
  // Cap at 52 weeks (1 year) then recycle — the 4-week periodization cycle
  // continues via modulo, but the number stays meaningful for UI display
  const nextWeek = state.weekNumber >= 52 ? 1 : state.weekNumber + 1;
  const prescription = generateWeekPrescription(nextWeek);

  const snapshot = { weekNumber: state.weekNumber, workouts: state.workouts };
  const history = [...(state.weekHistory ?? []), snapshot].slice(-8);

  // Reset BOTH completed and skipped for the new week. Carrying
  // `skipped: true` forward meant a user who skipped Day 3 last week
  // would still see Day 3 as skipped on the fresh week — even though
  // the week and prescription are new. Previously only `completed`
  // was reset, leaving `skipped` to leak across weeks.
  let workouts: WorkoutDay[] = state.workouts.map((day) => ({
    ...day,
    completed: false,
    skipped: false,
  }));

  // Acute fatigue from the week just trained (D-LIFT-8) — computed from the
  // logged per-exercise failure state rather than the formerly-dead persisted
  // scalar.
  const fatigue = computeFatigueScore(state.workouts);
  if (prescription.deload) {
    workouts = applyDeload(workouts);
  } else {
    // Only apply fatigue on non-deload weeks to avoid double volume reduction
    workouts = applyFatigue(workouts, fatigue);
  }

  // D-LIFT-4: at the start of a new mesocycle (weeks 5, 9, … and the 52→1
  // recycle), rotate UNTRAINED accessories to a fresh variation for novelty +
  // joint health. Trained accessories (logged history) and all mains stay put —
  // mains are the progression anchor, and a lift the user actually trains is
  // theirs to keep. Re-deduped so a rotation can't collide within a day.
  if (nextWeek % 4 === 1) {
    workouts = dedupeDayExercises(rotateUntrainedAccessories(workouts));
  }

  return {
    ...state,
    weekNumber: nextWeek,
    currentPhase: prescription.deload ? "deload" : "progression",
    workouts,
    weekHistory: history,
    // A deload clears accumulated acute fatigue; otherwise persist the computed
    // value so the field is meaningful + observable (no longer dead).
    fatigueScore: prescription.deload ? 0 : fatigue,
    updatedAt: Date.now(),
    nextWorkoutOverride: undefined,
  };
}
