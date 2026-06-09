/**
 * Shared nutrition-periodization test fixtures.
 *
 * Built ONCE here and reused across the nutrition prompt arc (trainingSignals,
 * phaseNutrition, and later prompts). Each builder returns a fresh
 * `{ profile, program }` pair so tests can mutate without cross-contaminating.
 *
 * Mental model (see CONTEXT.md → Nutrition):
 *  - CALORIES = slow loop (flat day-to-day; profile.targetCalories).
 *  - MACROS = fast loop (driven by the PLANNED training of the day).
 * These fixtures exercise the six representative training shapes.
 */
import type { UserProfile } from "@/lib/auth";
import type {
  ProgramState,
  ProgramExercise,
  WorkoutDay,
  RunPlan,
  ScheduledRunDay,
} from "@/features/program/programTypes";
import type { ScheduleDay } from "@/lib/scheduleUtils";

export interface NutritionFixture {
  profile: UserProfile;
  /** undefined models "no program" (FREE_RUN / logged-out). */
  program: ProgramState | undefined;
}

/* ── builders ─────────────────────────────────────────────────────────── */

/** One lift exercise. `sets`/`reps` drive the volume tier; the rest are
 *  plausible defaults so the object is a valid ProgramExercise. */
export function exercise(sets: number, reps: number): ProgramExercise {
  return {
    name: "Back Squat",
    exerciseId: "back_squat",
    movementCategory: "knee_dominant",
    sets,
    reps,
    weight: 100,
    progressionType: "double",
    lastSuccessfulWeight: 100,
    lastAttemptedWeight: 100,
    consecutiveFailures: 0,
    plateauCount: 0,
    performanceHistory: [],
    lastPerformance: null,
  };
}

/** A lift day with `count` exercises at sets×reps each. */
export function liftDay(
  dayName: string,
  count: number,
  sets = 3,
  reps = 8
): WorkoutDay {
  return {
    dayName,
    dayType: "lift",
    exercises: Array.from({ length: count }, () => exercise(sets, reps)),
    completed: false,
  };
}

export function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: "fixture-uid",
    displayName: "Fixture User",
    email: "fixture@example.com",
    photoURL: null,
    athleteType: "Hybrid",
    weightKg: 80,
    heightCm: 180,
    weeklyWorkoutsTarget: 4,
    weeklyMealsTarget: 3,
    preferredWeightUnit: "kg",
    preferredHeightUnit: "cm",
    darkMode: false,
    onboardingComplete: true,
    trialExpiresAt: null,
    subscriptionTier: "free",
    currentStreak: 0,
    longestStreak: 0,
    lastLogDate: null,
    targetCalories: 2500,
    targetProtein: 180,
    targetCarbs: 300,
    targetFat: 70,
    program: { goal: "recomp", startWeight: 80, currentPhase: "base" },
    ...overrides,
  } as UserProfile;
}

export function makeProgram(
  overrides: Partial<ProgramState> = {}
): ProgramState {
  return {
    goal: "recomp",
    currentPhase: "base",
    weekNumber: 1,
    splitType: "full_body",
    workouts: [],
    fatigueScore: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** 7-entry weekly schedule helper (0=Sun..6=Sat). */
function schedule(types: Array<ScheduleDay["type"]>): ScheduleDay[] {
  return types.map((type, day) => ({ day, type }));
}

/* ── the six fixtures ─────────────────────────────────────────────────── */

/** 1. RUN_ONLY — 4 runs/week, zero lift workouts, phase never cycles. */
export function RUN_ONLY(
  programOverrides: Partial<ProgramState> = {}
): NutritionFixture {
  const runDays: ScheduledRunDay[] = [1, 2, 4, 6].map((dayIndex, i) => ({
    id: `run-${i}`,
    dayIndex,
    templateId: "easy_30",
    type: "easy",
  }));
  return {
    profile: makeProfile({
      weeklyWorkoutsTarget: 0,
      primaryGoal: "running",
      weekSchedule: schedule([
        "rest",
        "run",
        "run",
        "rest",
        "run",
        "rest",
        "run",
      ]),
    }),
    program: makeProgram({
      primaryGoal: "running",
      workouts: [], // no lift workouts at all
      runDays,
      ...programOverrides,
    }),
  };
}

/** 2. LIFT_ONLY — no runs, currentPhase cycles base/progression/deload. */
export function LIFT_ONLY(
  programOverrides: Partial<ProgramState> = {}
): NutritionFixture {
  return {
    profile: makeProfile({
      weeklyWorkoutsTarget: 4,
      primaryGoal: "strength",
      weekSchedule: schedule([
        "rest",
        "lift",
        "lift",
        "rest",
        "lift",
        "lift",
        "rest",
      ]),
    }),
    program: makeProgram({
      primaryGoal: "strength",
      currentPhase: "progression",
      weekNumber: 2,
      // 4 lift days, ~5 lifts × 3×8 = 120 reps/day → moderate tier
      workouts: [
        liftDay("Day A", 5),
        liftDay("Day B", 5),
        liftDay("Day C", 5),
        liftDay("Day D", 5),
      ],
      runDays: undefined,
      runPlan: undefined,
      ...programOverrides,
    }),
  };
}

/** 3. BOTH — hybrid; lift workouts + runs, a "both" weekday, and a
 *  clashesWithLift hard run placed on a non-run weekday. */
export function BOTH(
  programOverrides: Partial<ProgramState> = {}
): NutritionFixture {
  const runDays: ScheduledRunDay[] = [
    { id: "run-easy", dayIndex: 2, templateId: "easy_30", type: "easy" },
    // hard (long) run forced onto a lift day → clashes flag set
    {
      id: "run-long",
      dayIndex: 1,
      templateId: "long_90",
      type: "long",
      clashesWithLift: true,
    },
  ];
  return {
    profile: makeProfile({
      weeklyWorkoutsTarget: 3,
      primaryGoal: "hypertrophy",
      weekSchedule: schedule([
        "rest",
        "both",
        "run",
        "lift",
        "rest",
        "lift",
        "rest",
      ]),
    }),
    program: makeProgram({
      primaryGoal: "hypertrophy",
      currentPhase: "progression",
      weekNumber: 3,
      workouts: [liftDay("Push", 6), liftDay("Pull", 6), liftDay("Legs", 6)],
      runDays,
      ...programOverrides,
    }),
  };
}

/** 4. FREE_RUN — no weekSchedule, no runDays, NO program; only targetCalories. */
export function FREE_RUN(): NutritionFixture {
  return {
    profile: makeProfile({
      weeklyWorkoutsTarget: 0,
      primaryGoal: undefined,
      weekSchedule: undefined,
      program: undefined,
      targetCalories: 2100,
    }),
    program: undefined,
  };
}

/** 5. HEAVY_CUTTER — 120kg, aggressive cut ~1500; protein*4 + floored fat*9
 *  exceeds calories (carbs clamp at 0). */
export function HEAVY_CUTTER(
  programOverrides: Partial<ProgramState> = {}
): NutritionFixture {
  return {
    profile: makeProfile({
      weightKg: 120,
      targetCalories: 1500,
      targetProtein: 220,
      targetCarbs: 80,
      targetFat: 60,
      primaryGoal: "fat_loss",
      program: { goal: "cut", startWeight: 120, currentPhase: "cut" },
      weekSchedule: schedule([
        "rest",
        "lift",
        "lift",
        "rest",
        "lift",
        "rest",
        "rest",
      ]),
    }),
    program: makeProgram({
      goal: "cut",
      primaryGoal: "fat_loss",
      currentPhase: "progression",
      weekNumber: 2,
      workouts: [
        liftDay("Full A", 4),
        liftDay("Full B", 4),
        liftDay("Full C", 4),
      ],
      ...programOverrides,
    }),
  };
}

/** 6. PRO_TAPER — Pro user, race_prep run plan, in taper with a future race. */
export function PRO_TAPER(
  programOverrides: Partial<ProgramState> = {}
): NutritionFixture {
  const runPlan: RunPlan = {
    mode: "race_prep",
    raceGoal: { distance: "half", targetDate: "2099-01-01" },
    totalWeeks: 12,
    currentWeek: 11, // taper week (near the end)
  };
  return {
    profile: makeProfile({
      subscriptionTier: "pro",
      primaryGoal: "running",
      weeklyWorkoutsTarget: 2,
      weekSchedule: schedule([
        "rest",
        "run",
        "lift",
        "run",
        "rest",
        "run",
        "rest",
      ]),
    }),
    program: makeProgram({
      primaryGoal: "running",
      currentPhase: "progression",
      weekNumber: 11,
      // taper → reduced lift volume (2 light days → low tier)
      workouts: [liftDay("Light A", 3, 2, 6), liftDay("Light B", 3, 2, 6)],
      runPlan,
      ...programOverrides,
    }),
  };
}
