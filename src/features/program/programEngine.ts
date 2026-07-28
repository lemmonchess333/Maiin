import type {
  Experience,
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
import {
  countPlateauedExercises,
  resolveAdjustment,
  PROGRAMME_PLATEAU_MIN,
  type AdjustmentAction,
  type RecoveryState,
} from "./adjustmentRule";
import {
  usesMicroplateStep,
  MICROPLATE_STEP,
  PLATE_PAIR_STEP,
} from "./movementClass";
import {
  leastTrainedCategory,
  orderForAdjacency,
  surplusExposures,
} from "./overlapModel";
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
    mainRepsMax: 7,
    accessoryReps: 8,
    accessoryRepsMax: 12,
    volumeMultiplier: 0.9,
    mainProgression: "linear",
  },
  hypertrophy: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  fat_loss: {
    mainReps: 12,
    mainRepsMax: 15,
    accessoryReps: 15,
    accessoryRepsMax: 20,
    volumeMultiplier: 1.0,
    mainProgression: "linear",
  },
  general: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 1.0,
    mainProgression: "double",
  },
  // running-goal users still lift to support their running — matches the
  // fullBodyBeginner prescription: moderate reps, lower volume.
  running: {
    mainReps: 8,
    mainRepsMax: 12,
    accessoryReps: 12,
    accessoryRepsMax: 15,
    volumeMultiplier: 0.85,
    mainProgression: "linear",
  },
};

export function goalProfileFor(primaryGoal?: PrimaryGoal): GoalProfile {
  return GOAL_PROFILES[primaryGoal ?? "general"];
}

// Progression tuning (D-LIFT-6 / D-LIFT-11).
/** A logged set at this RPE or above holds load/reps for the cycle. */
const RPE_HOLD_THRESHOLD = 9.5;
/** Bodyweight rep target stops climbing here; the user is prompted to add load. */
const MAX_BODYWEIGHT_REPS = 20;
/** Timed holds climb in 5-second steps (N2's time axis). */
const HOLD_STEP_SECONDS = 5;
/** Ceiling for a hold with no authored range — past this, add load instead. */
const MAX_HOLD_SECONDS = 60;
// Load step (backlog #7, H3) — the discriminator lives in movementClass.ts;
// see that module for why `isAccessory` was the wrong one.

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

/**
 * A mesocycle ends on its deload week — completing that week means the user
 * finished a full 4-week programme cycle (drives the `programme_complete`
 * badge). Derives the answer from `generateWeekPrescription` so it can never
 * drift from the periodization schedule itself (don't re-hardcode `% 4`).
 */
export function isCycleEndWeek(week: number): boolean {
  return week > 0 && generateWeekPrescription(week).deload;
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

/**
 * D-LIFT-7: the one-line "why" behind the days→split mapping, so the derived
 * split (Pgm5 Q1: structure follows lift-days, not a user toggle) reads as a
 * deliberate coaching choice rather than an ignored preference. Mirrors
 * `chooseSplit`; the thread is weekly per-muscle FREQUENCY.
 */
export function splitRationale(weeklyLiftDays: number): string {
  const d = Math.min(6, Math.max(0, Math.round(weeklyLiftDays)));
  switch (d) {
    case 0:
      return "No lift days set — add some to build a split.";
    case 1:
      return "One day a week is full-body so you still train everything.";
    case 2:
      return "Two days splits upper / lower — each trained about twice a week.";
    case 3:
      return "Three days stays full-body: every muscle 3× a week beats a 3-way split at the same volume.";
    case 4:
      return "Four days is upper / lower twice — each muscle about twice a week.";
    case 5:
      return "Five days layers push/pull/legs onto upper/lower to keep most muscles near 2× a week.";
    default:
      return "Six days runs push/pull/legs twice — each muscle about twice a week.";
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

/**
 * Build a programme exercise from the PRIMARY variation pool, preserving an
 * existing row's load/history/instanceId across a regenerate.
 *
 * `isAccessory` is a VOLUME ROLE, not a movement class (movementClass.ts) —
 * it marks the slots the volume machinery may adjust: #5's ramp, #9's
 * add/reduce arms, and `balanceWeeklyVolume`'s under-dosed-muscle top-up.
 * `buildFullBody` needs to mark supporting slots WITHOUT `makeAccessory`,
 * which re-picks from the non-primary pool and can't carry `existing` —
 * using it there would rewrite users' exercises and wipe their logged loads
 * on every regenerate. Hence the parameter (backlog #15).
 */
function makeExercise(
  category: MovementCategory,
  sets: number,
  reps: number,
  weight: number,
  progression: "double" | "linear",
  existing?: ProgramExercise,
  isAccessory = false
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
    isAccessory,
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
    // Backlog #7 (H3): isolations progress by REPS, not load — `isAccessory`
    // is exactly Helms's compound/isolation discriminator. The rep range that
    // makes this meaningful is stamped in generateProgram's final pass. This
    // also retires a runaway: the linear branch's `microloading` case added
    // 1 kg per completed session with no rep requirement, which on an 8 kg
    // lateral raise is a 12% jump every workout.
    progressionType: "double",
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
        findExisting(0, 2),
        true
      ),
      makeExercise(
        "hip_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(0, 3),
        true
      ),
      makeExercise(
        "core",
        round(2 * vm),
        12,
        15,
        "linear",
        findExisting(0, 4),
        true
      ),
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
        findExisting(1, 2),
        true
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(1, 3),
        true
      ),
      makeExercise(
        "arms_biceps",
        round(2 * vm),
        12,
        10,
        "linear",
        findExisting(1, 4),
        true
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
        findExisting(2, 1),
        true
      ),
      makeExercise(
        "vertical_pull",
        round(3 * vm),
        acc,
        0,
        profile.mainProgression,
        findExisting(2, 2),
        true
      ),
      makeExercise(
        "knee_dominant",
        round(3 * vm),
        acc,
        60,
        "linear",
        findExisting(2, 3),
        true
      ),
      makeExercise(
        "core",
        round(2 * vm),
        12,
        15,
        "linear",
        findExisting(2, 4),
        true
      ),
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
          // Was findExisting(2, 4) — an off-by-one. This day has four slots
          // (0-3), so index 4 never resolved and the core lift was rebuilt
          // from defaults on EVERY regenerate, silently dropping the user's
          // logged weight and history. Same family as #17; found by the
          // regenerate-preserves-load test rather than by reading indices.
          findExisting(2, 3)
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

/* ================================
   DAY ROLES (backlog #3 — N9 daily undulating periodization)
================================ */

type DayRole = "heavy" | "moderate" | "pump";

/**
 * Deterministic role per generated day: first half of the week heavier,
 * back half higher-rep, an odd middle day at the goal base, and a
 * single-day week entirely at base. Module-private by design — the only
 * contract is generateProgram's output (reachability guardrail).
 */
function assignDayRoles(count: number): DayRole[] {
  if (count <= 1) return count === 1 ? ["moderate"] : [];
  return Array.from({ length: count }, (_, i) => {
    if (i < Math.floor(count / 2)) return "heavy";
    if (i >= Math.ceil(count / 2)) return "pump";
    return "moderate";
  });
}

/**
 * Backlog #3 (training-book backlog; N9): put the first rep variation
 * into a Tropos week. Every source converged on varying what the week
 * asks for; daily undulation is the stateless version — heavy days sit
 * ±2 reps around the goal profile's base, structures/sets/progression
 * mechanics untouched. baseReps moves with reps so progression resets
 * stay role-consistent. Presentation policy: INVISIBLE — the
 * prescription simply differs; no labels, no new UI.
 */
function applyDayRoles(workouts: WorkoutDay[]): WorkoutDay[] {
  const roles = assignDayRoles(workouts.length);
  return workouts.map((day, i) => {
    const role = roles[i];
    if (role === "moderate") return day;
    const delta = role === "heavy" ? -2 : 2;
    return {
      ...day,
      exercises: day.exercises.map((ex) => {
        const floor = ex.isAccessory === true ? 6 : 3;
        const reps = Math.max(floor, ex.reps + delta);
        return { ...ex, reps, baseReps: reps };
      }),
    };
  });
}

/**
 * Carry a user's accessories through a regenerate (backlog #17).
 *
 * `makeAccessory` takes no `existing` — unlike `makeExercise` — so it re-rolls
 * `pickAccessory` (which is `Math.random()`-backed) and rebuilds from the
 * passed defaults on EVERY regenerate. Measured on main: regenerating a 4-day
 * programme turned a 55 kg Bulgarian Split Squat with logged history into a
 * 40 kg Hack Squat with none, and reset an Incline DB Press from 55 kg to 30.
 * A regenerate is what a settings change triggers — goal, days per week,
 * split — so changing any of those silently wiped every accessory's load and
 * history and shuffled the exercises.
 *
 * Done as a post-pass rather than threading `existing` through fifteen
 * `makeAccessory` call sites: one place to reason about, and it uses the same
 * positional correspondence `findExisting` already relies on. Only IDENTITY
 * and LOGGED state carry — sets and reps stay whatever the builders and the
 * volume machinery just computed, so a genuine prescription change still
 * lands. Guarded on category equality, so a slot that legitimately changed
 * movement (see `applyOverlapCaps`) is left alone.
 *
 * This also puts Tropos properly on the side of N5's "stability within a
 * block, novelty between blocks": `rotateUntrainedAccessories` still refreshes
 * untrained accessories at each mesocycle boundary, which is the intended
 * novelty — it just no longer happens by accident on every settings change.
 */
function carryExistingAccessories(
  workouts: WorkoutDay[],
  existing?: WorkoutDay[]
): WorkoutDay[] {
  if (!existing) return workouts;
  return workouts.map((day, dayIndex) => ({
    ...day,
    exercises: day.exercises.map((ex, exIndex) => {
      if (ex.isAccessory !== true) return ex; // makeExercise already carries
      const prev = existing[dayIndex]?.exercises[exIndex];
      if (
        !prev ||
        prev.isAccessory !== true ||
        prev.movementCategory !== ex.movementCategory
      ) {
        return ex;
      }
      return {
        ...ex,
        exerciseId: prev.exerciseId,
        name: prev.name,
        instanceId: prev.instanceId,
        weight: prev.weight,
        lastSuccessfulWeight: prev.lastSuccessfulWeight,
        lastAttemptedWeight: prev.lastAttemptedWeight,
        consecutiveFailures: prev.consecutiveFailures,
        plateauCount: prev.plateauCount,
        performanceHistory: prev.performanceHistory,
        lastPerformance: prev.lastPerformance,
      };
    }),
  }));
}

/**
 * Backlog #10 (training-book backlog; D1 + M6 + H6): re-point the
 * expensive-pattern slots that exceed the overlap caps. The decision is pure
 * (overlapModel.ts); this only rebuilds the chosen slots, because the
 * builders are module-private.
 *
 * A demoted slot keeps its sets and its accessory role — only the movement
 * changes, to whatever the week trains least. So this reshapes the week
 * without changing how much work is in it.
 *
 * `existingWorkouts` is threaded in for the carry. The builders' `findExisting`
 * is POSITIONAL and category-blind, so once this pass changes a slot's
 * category, the next regenerate would rebuild that position as a hinge again
 * (inheriting the replacement's logged weight onto a deadlift), and then
 * re-point it to a brand-new exercise — wiping the user's history on every
 * regenerate. Matching the previous slot at the same position BY CATEGORY
 * closes that: the choice is deterministic, so a stable programme carries its
 * instanceId, load and history across regenerates like any other slot.
 */
function applyOverlapCaps(
  workouts: WorkoutDay[],
  profile: GoalProfile,
  existingWorkouts?: WorkoutDay[]
): WorkoutDay[] {
  const surplus = surplusExposures(workouts);
  if (surplus.length === 0) return workouts;

  const out = workouts.map((d) => ({ ...d, exercises: [...d.exercises] }));
  for (const { dayIndex, exIndex } of surplus) {
    const day = out[dayIndex];
    const old = day.exercises[exIndex];
    const inDay = new Set(day.exercises.map((e) => e.movementCategory));
    const category = leastTrainedCategory(out, inDay);
    if (!category) continue; // every alternative already in this day — leave it
    const prev = existingWorkouts?.[dayIndex]?.exercises[exIndex];
    const isAccessory = old.isAccessory === true;
    day.exercises[exIndex] = makeExercise(
      category,
      old.sets,
      isAccessory ? profile.accessoryReps : profile.mainReps,
      0, // uncalibrated when fresh — seedStartingLoads runs after this
      isAccessory ? "double" : profile.mainProgression,
      prev?.movementCategory === category ? prev : undefined,
      isAccessory
    );
  }
  return out;
}

export function generateProgram(
  nutritionGoal: Goal,
  weeklyTarget: number,
  existingWorkouts?: WorkoutDay[],
  primaryGoal?: PrimaryGoal,
  loadCtx?: StartingLoadContext,
  /**
   * The user's planned week SHAPE (backlog #10, M6 adjacency). Read-only, and
   * used for one thing: knowing whether the planned lift days are
   * back-to-back, so two posterior-chain-heavy sessions aren't scheduled on
   * consecutive days. This does NOT date-pin lifts — ADR-0002 keeps them
   * split-ordered on purpose, because pinning would mark a
   * Tuesday-instead-of-Monday session as "missed Monday" and drop its volume.
   * Absent → adjacency is simply not applied.
   */
  weekSchedule?: ReadonlyArray<{ day: number; type: string }>
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

  const buildSplit = (existingWorkouts?: WorkoutDay[]): WorkoutDay[] => {
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
        workouts = buildPPL(profile, nutritionGoal, existingWorkouts).slice(
          0,
          3
        );
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
        workouts = [
          ...ppl,
          buildLegsB(profile, nutritionGoal, existingWorkouts),
        ];
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
    return workouts;
  };

  /**
   * Align a saved plan to the builders' CANONICAL day order before handing it
   * over (backlog #10).
   *
   * The builders carry a saved exercise by POSITION (`findExisting(dayIdx,
   * exIdx)`), which silently assumes the saved plan is in the same day order
   * the builder emits. Adjacency ordering breaks that assumption, and the
   * failure is data corruption rather than a visible error: with a saved
   * order of Pull,Push,Legs and a builder order of Push,Pull,Legs, the user's
   * logged pull-up weight lands on bench press.
   *
   * Matching on `dayName` fixes it, and fixes it generally — the carry stops
   * depending on day order at all, so ANY future reordering is safe. A probe
   * build (no existing, so it is pure and cheap) supplies the canonical order.
   */
  const alignExistingTo = (
    saved: WorkoutDay[] | undefined,
    reference: WorkoutDay[]
  ): WorkoutDay[] | undefined => {
    if (!saved || saved.length !== reference.length) return saved;
    const byName = new Map<string, WorkoutDay[]>();
    for (const d of saved) {
      const list = byName.get(d.dayName);
      if (list) list.push(d);
      else byName.set(d.dayName, [d]);
    }
    // Every reference name must be present the same number of times, or the
    // saved plan is a different shape and positional is the best we can do.
    const aligned: WorkoutDay[] = [];
    for (const c of reference) {
      const list = byName.get(c.dayName);
      if (!list || list.length === 0) return saved;
      aligned.push(list.shift() as WorkoutDay);
    }
    return aligned;
  };

  let workouts = buildSplit(
    alignExistingTo(existingWorkouts, buildSplit(undefined))
  );

  // D-LIFT-12: ensure no day picks the same exercise twice (e.g. a main that
  // rotated to a variation an accessory then matched). Re-picks the duplicate
  // to another variation in the same movement category.
  // Backlog #10 (M6 adjacency): order the week so back-to-back days aren't the
  // two that hammer the same lower back. Safe to apply on EVERY generation
  // now that the carry keys on day NAME rather than position — reordering
  // used to land a logged pull-up weight on bench press, which is what kept
  // this unbuilt.
  workouts = orderForAdjacency(workouts, weekSchedule);

  // Everything below still matches the saved plan POSITIONALLY, so realign it
  // to the order the week actually ended up in. Missing this is exactly the
  // bug above, one layer down: the builders carried correctly and then the
  // accessory carry put day 0's accessories on whatever day now sits first.
  const alignedExisting = alignExistingTo(existingWorkouts, workouts);

  // Backlog #17: accessories keep their identity and logged state across a
  // regenerate — makeAccessory rebuilds from defaults and re-rolls its
  // random pick, so without this a settings change wipes them.
  workouts = carryExistingAccessories(workouts, alignedExisting);
  workouts = dedupeDayExercises(workouts);
  // Backlog #10: cap expensive-pattern overlap BEFORE day roles and the
  // volume balancers, so a re-pointed slot is shifted and budgeted exactly
  // like an originally-built one rather than escaping both.
  workouts = applyOverlapCaps(workouts, profile, alignedExisting);
  // Backlog #3: day roles — see applyDayRoles above.
  workouts = applyDayRoles(workouts);
  // D-LIFT-1 (active): nudge under-dosed muscles up toward the goal volume
  // landmark by growing their accessories (add-only, mains untouched).
  workouts = balanceWeeklyVolume(workouts, volumeLandmark(primaryGoal));
  // D-LIFT-3: keep weekly pull volume ≥ push (shoulder-health balance).
  workouts = balancePushPull(workouts);
  // D-LIFT-5: seed bodyweight-relative cold-start loads on never-trained mains
  // (no-op without a load context, or for lifts with logged history).
  if (loadCtx) workouts = seedStartingLoads(workouts, loadCtx);

  // Backlog #5: stamp the steady-state volume anchor AFTER balancing and
  // seeding — advanceWeek derives each week's sets from baseSets.
  // Backlog #7: stamp the rep-range ceiling in the same pass, and for the
  // same reason — it must be derived from the FINAL `reps`, after day roles
  // have shifted them. Carrying a fixed ceiling through applyDayRoles would
  // hand a heavy day (reps 8 → 6) the untouched 12-rep ceiling, turning a
  // 4-rep climb into a 6-rep one. Deriving from the span keeps the range
  // width constant across every role.
  const mainSpan = Math.max(0, profile.mainRepsMax - profile.mainReps);
  const accessorySpan = Math.max(
    0,
    profile.accessoryRepsMax - profile.accessoryReps
  );
  workouts = workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const span = ex.isAccessory === true ? accessorySpan : mainSpan;
      const out: ProgramExercise = { ...ex, baseSets: ex.sets };
      if (span > 0) out.repRangeMax = ex.reps + span;
      return out;
    }),
  }));

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
  // Backlog #7 (H3): load moves in proportion to the lift. The step keys on
  // the MOVEMENT and its load, not on `isAccessory` — see movementClass.ts
  // for why that flag (a volume role) can't answer this question. The
  // lean-bulk accelerator rides the same test: a lift too light for a full
  // plate is too light for a bonus on top of one.
  const microplate = usesMicroplateStep(
    exercise.movementCategory,
    exercise.weight
  );
  const loadStep = microplate ? MICROPLATE_STEP : PLATE_PAIR_STEP;
  const loadBonus = microplate ? 0 : goalWeightBonus(goal);
  // D-LIFT-11: bodyweight rep target rises by 1 per success, but is capped —
  // a pull-up shouldn't drift to "25 reps"; at the cap, prompt adding load.
  // Backlog #7's time axis (N2). A timed hold counts SECONDS, not reps, so
  // neither the +1 step nor the 20-rep ceiling means anything to it: a plank
  // prescribed 30-45s starts ABOVE the rep cap, so any overshoot immediately
  // advised "add load" at an ordinary hold length. Time climbs in 5-second
  // steps toward the authored ceiling, and the add-load prompt waits until
  // the hold is genuinely long.
  const isTimed = exercise.repUnit === "seconds";
  const bumpBodyweightReps = () => {
    if (isTimed) {
      const ceiling = exercise.repRangeMax ?? MAX_HOLD_SECONDS;
      if (exercise.reps >= ceiling) {
        updated.notes =
          "Holding this long already — add load (weighted vest / band) to keep progressing.";
      } else {
        updated.reps = Math.min(ceiling, exercise.reps + HOLD_STEP_SECONDS);
      }
      return;
    }
    if (exercise.reps >= MAX_BODYWEIGHT_REPS) {
      updated.notes =
        "Hitting 20+ reps — add load (weighted vest / band) to keep progressing.";
    } else {
      updated.reps = exercise.reps + 1;
    }
  };

  if (exercise.progressionType === "double") {
    if (completed) {
      const rangeMax = exercise.repRangeMax;
      if (!isBodyweight && rangeMax != null && rangeMax > resetReps) {
        // Range-aware double progression (P1, training-book backlog): the
        // rep TARGET climbs through [baseReps, repRangeMax] as targets are
        // completed; load rises only once the top of the range is reached,
        // then the target resets to the bottom. Pre-range behaviour (below)
        // waited for the user to spontaneously overshoot by 2 — the target
        // itself never moved. RPE ≥ threshold holds the climb, same hold
        // contract as every other progression path.
        if (rpeOk) {
          if (actualReps >= rangeMax) {
            updated.weight = exercise.weight + loadStep + loadBonus;
            updated.reps = resetReps;
          } else {
            // Next target: one past what was actually done (monotonic —
            // completed ⇒ actualReps >= exercise.reps), capped at the range.
            updated.reps = Math.min(rangeMax, actualReps + 1);
          }
        }
      } else if (actualReps >= exercise.reps + 2 && rpeOk) {
        // Legacy double progression (no authored range): accumulate reps
        // until a 2-rep overshoot, then increase weight
        if (isBodyweight) {
          // Bodyweight: progress via rep target increase (capped)
          bumpBodyweightReps();
        } else {
          // Weighted: increase weight and reset reps to base prescription
          updated.weight = exercise.weight + loadStep + loadBonus;
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
          // No goal bonus on the linear path — pre-#7 behaviour, kept.
          updated.weight = exercise.weight + loadStep;
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

/**
 * Deload rep floor for the post-novice recipe — a 5-rep strength main drops
 * to 3, not to 1. Shared with the CF mirror.
 */
const DELOAD_REPS_FLOOR = 3;

/**
 * Backlog #8 (training-book backlog; H4 resolving M4): the deload recipe is
 * chosen by TRAINING AGE. Tropos's sets−1 + load−15% is Helms's *novice*
 * answer, and it was being applied to everyone.
 *
 * - Beginner (and any caller that doesn't know): unchanged — one set fewer
 *   (floor 2) and working weight ×0.85 on the 2.5 kg grid. Cutting load is
 *   what a novice needs, because a novice's stall is usually the load.
 * - Intermediate / advanced: roughly half the volume at the SAME load —
 *   one set fewer and two reps off the target (floor 3), weight untouched
 *   (Helms's worked example: 3×10×200 → 2×8×200). Past the novice phase
 *   the fatigue comes from accumulated volume, not from the top-end load,
 *   and dropping the bar weight costs the skill exposure that keeps a
 *   heavy lift sharp.
 *
 * Presentation policy: INVISIBLE — the step-back week simply looks different.
 * The one visible surface is #4's step-back cue, which is recipe-agnostic.
 */
export function applyDeload(
  workouts: WorkoutDay[],
  experience?: Experience
): WorkoutDay[] {
  const holdLoad = experience === "intermediate" || experience === "advanced";
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const sets = Math.max(2, ex.sets - 1);
      if (holdLoad) {
        return { ...ex, sets, reps: Math.max(DELOAD_REPS_FLOOR, ex.reps - 2) };
      }
      return {
        ...ex,
        sets,
        // 0 weight (bodyweight or uncalibrated): no weight to deload
        // — leave at 0. Sets reduction above is the deload signal.
        // Weighted: round to 2.5kg increments (standard plate size).
        weight:
          ex.weight === 0 ? 0 : Math.round((ex.weight * 0.85) / 2.5) * 2.5,
      };
    }),
  }));
}

export function shouldAdvanceWeek(workouts: WorkoutDay[]): boolean {
  return workouts.every((day) => day.completed || day.skipped);
}

/** Accessory ramp ceiling — mirrors volumeModel's ACCESSORY_SET_CAP. */
const ACCESSORY_RAMP_CAP = 5;

/**
 * Entering an automatic deload week: re-anchor sets to baseSets and stash
 * each loaded exercise's weight and rep target so meso exit can restore
 * them. applyDeload then cuts from the ANCHORED values, so its cut can
 * never compound across mesocycles (the manual deload command guards the
 * same hazard with its undo snapshot — the auto path had no guard at all).
 *
 * Both stashes are unconditional w.r.t. the deload recipe (backlog #8):
 * only the post-novice recipe cuts reps and only the novice recipe cuts
 * load, but a user who changes experience level mid-mesocycle must still
 * get back whichever one was cut.
 */
function prepareForDeload(workouts: WorkoutDay[]): WorkoutDay[] {
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      const out: ProgramExercise = { ...ex, baseSets: base, sets: base };
      if (out.weight > 0) out.preDeloadWeight = out.weight;
      out.preDeloadReps = out.reps;
      return out;
    }),
  }));
}

/**
 * Backlog #5 (training-book backlog; M2/N1): the volume ramp. Non-deload
 * weeks derive sets from the baseSets anchor — accessories run
 * base−1 / base / base+1 across the meso (start below target, build,
 * then deload), mains hold at base. Also restores pre-deload loads on
 * meso exit (max() keeps anything the user progressed DURING the deload
 * week). Anchor-derived recompute makes the weekly shape idempotent:
 * applyFatigue's shave lasts exactly one week. Presentation policy:
 * INVISIBLE — the prescription simply differs week to week.
 */
function applyWeeklyVolumeShape(
  workouts: WorkoutDay[],
  week: number
): WorkoutDay[] {
  const weekInMeso = ((week - 1) % 4) + 1; // 1..3 here; week 4 deloads
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const base = ex.baseSets ?? ex.sets;
      const out: ProgramExercise = { ...ex, baseSets: base };
      if (typeof ex.preDeloadWeight === "number") {
        out.weight = Math.max(out.weight, ex.preDeloadWeight);
        delete out.preDeloadWeight;
      }
      // Backlog #8: same max()-wins restore for the rep target, which the
      // post-novice deload recipe cuts. Without it the cut would decay the
      // prescription every mesocycle — the exact hazard #5 fixed for sets
      // and load, reintroduced through a third field.
      if (typeof ex.preDeloadReps === "number") {
        out.reps = Math.max(out.reps, ex.preDeloadReps);
        delete out.preDeloadReps;
      }
      if (ex.isAccessory === true) {
        out.sets =
          weekInMeso === 1
            ? Math.max(1, base - 1)
            : weekInMeso === 3
              ? Math.min(ACCESSORY_RAMP_CAP, base + 1)
              : base;
      } else {
        out.sets = base;
      }
      return out;
    }),
  }));
}

/** Floor for the steady-state accessory anchor — a lift never drops below this. */
const ACCESSORY_ANCHOR_FLOOR = 2;

/**
 * Backlog #9 (training-book backlog; H5): apply the adjustment the rule
 * chose. Split across the two volume registers #5 established, which is
 * what makes each action last the right length of time:
 *
 * - `add_volume` / `reorganize` move the ANCHOR (`baseSets`), so the change
 *   survives `applyWeeklyVolumeShape`'s idempotent recompute — these are
 *   verdicts about the programme.
 * - `reduce_volume` moves only `sets`, so it lasts exactly one week and is
 *   then recomputed away, same as `applyFatigue`'s shave — it's a light
 *   week, not a new baseline.
 *
 * Mains are never touched. They are the progression anchor, and every
 * source in the review puts the adjustable volume in accessory work.
 * `reorganize` also rotates the stalled lifts to a fresh variation and
 * clears their plateau counter — Helms's "or the volume organised
 * differently", and the reset is what lets the rule tell a NEW stall from
 * the one it already responded to.
 */
function applyAdjustment(
  workouts: WorkoutDay[],
  action: AdjustmentAction
): WorkoutDay[] {
  if (action === "hold") return workouts;
  return workouts.map((day) => ({
    ...day,
    exercises: day.exercises.map((ex) => {
      const out: ProgramExercise = { ...ex };
      const base = ex.baseSets ?? ex.sets;
      if (ex.isAccessory === true) {
        if (action === "add_volume") {
          out.baseSets = Math.min(ACCESSORY_RAMP_CAP, base + 1);
          out.sets = Math.min(ACCESSORY_RAMP_CAP, out.sets + 1);
        } else if (action === "reduce_volume") {
          out.sets = Math.max(ACCESSORY_ANCHOR_FLOOR, out.sets - 1);
        } else {
          out.baseSets = Math.max(ACCESSORY_ANCHOR_FLOOR, base - 1);
          out.sets = Math.max(ACCESSORY_ANCHOR_FLOOR, out.sets - 1);
        }
      }
      if (action === "reorganize" && (ex.plateauCount ?? 0) > 0) {
        const swap = pickExercise(
          ex.movementCategory,
          ex.plateauCount ?? 0,
          ex.exerciseId
        );
        out.exerciseId = swap.id;
        out.name = swap.name;
        out.plateauCount = 0;
        out.consecutiveFailures = 0;
      }
      return out;
    }),
  }));
}

export function advanceWeek(
  state: ProgramState,
  experience?: Experience,
  recovery: RecoveryState = "unknown"
): ProgramState {
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
  // Backlog #9 (H5): the joint plateau × recovery rule. Evaluated from the
  // week just TRAINED (state.workouts), before the weekly reshape rewrites
  // sets, so it reads the stall the user actually just hit.
  const plateauedExercises = countPlateauedExercises(state.workouts);
  const action = resolveAdjustment({
    plateauedExercises,
    recovery,
    priorReductions: state.plateauResponses ?? 0,
  });

  if (prescription.deload) {
    // A deload week IS the light week — don't stack an adjustment on top of
    // it. The rule's bookkeeping below still runs, so a stall that spans a
    // deload is remembered rather than silently forgiven.
    workouts = applyDeload(prepareForDeload(workouts), experience);
  } else {
    workouts = applyWeeklyVolumeShape(workouts, nextWeek);
    // Only apply fatigue on non-deload weeks to avoid double volume reduction
    workouts = applyFatigue(workouts, fatigue);
    workouts = applyAdjustment(workouts, action);
  }

  // Reset the memory once the stall itself clears; otherwise carry it, and
  // count a reduction so a SECOND stall escalates to `reorganize` instead of
  // cutting again. (Helms: if it recurs, the answer isn't another deload.)
  const plateauResponses =
    plateauedExercises < PROGRAMME_PLATEAU_MIN
      ? 0
      : (state.plateauResponses ?? 0) + (action === "reduce_volume" ? 1 : 0);

  // D-LIFT-4: at the start of a new mesocycle (weeks 5, 9, … and the 52→1
  // recycle), rotate UNTRAINED accessories to a fresh variation for novelty +
  // joint health. Trained accessories (logged history) and all mains stay put —
  // mains are the progression anchor, and a lift the user actually trains is
  // theirs to keep. Re-deduped so a rotation can't collide within a day.
  if (nextWeek % 4 === 1) {
    workouts = dedupeDayExercises(rotateUntrainedAccessories(workouts));
  } else if (action === "reorganize") {
    // Same hazard from #9's rotation: a swapped lift can collide with
    // another exercise already in that day.
    workouts = dedupeDayExercises(workouts);
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
    plateauResponses,
    updatedAt: Date.now(),
    nextWorkoutOverride: undefined,
  };
}
