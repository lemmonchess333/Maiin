/**
 * What the E2E journeys (`e2e/journeys/`) find on the app's screens, in one
 * place, each pinned against the component that draws it by a unit test: a
 * renamed button fails in the unit suite in seconds, not weeks into a
 * journey in CI.
 *
 * - Setup's names: `Onboarding.test.tsx` walks setup by them.
 * - The offer after setup: `Upgrade.test.tsx`.
 * - The workout screen's: `WorkoutSessionCompletion.test.tsx` finishes a
 *   session by them.
 * - Train's rows, its Start workout, Home's title and the tab bar:
 *   `journeyScreens.test.tsx`.
 */
import { prescribedRepRange } from "@/features/program/programEngine";
import type { ProgramExercise } from "@/features/program/programTypes";
import { formatRepTarget } from "@/features/program/repTarget";
import { getExerciseById } from "@/lib/exercises";

/** Setup's screens (`Onboarding`). */
export const SETUP = {
  continue: "Continue",
  activities: "Training activities",
  liftDays: "Lift sessions per week",
  liftMinutes: "Minutes per lift session",
  runningPlan: "Running plan",
  racePrep: "Race prep",
  runsPerWeek: "Runs per week",
  raceDistance: "Race distance",
  raceDate: "Race target date",
  legTrim: "Lighten leg sessions while your runs build",
  noInjuries: "None",
  weight: "Weight (kg)",
  height: "Height (cm)",
  sex: "Sex for calorie calculation",
  age: "Age range",
  start: "Start my plan",
} as const;

/** The answers on setup's screens that the journeys give, by question.
 *  Each is a button or radio's name; an aim, a runner, the equipment and
 *  the experience are matched from the name's start (their buttons go on
 *  to describe themselves). */
export const SETUP_OPTIONS = {
  aims: [
    "Build muscle",
    "Get stronger",
    "Lose fat",
    "General fitness",
    "Improve running",
  ],
  activities: ["Lifting", "Running", "Both"],
  liftDays: ["2", "3", "4", "5", "6"],
  liftMinutes: ["30 min", "45 min", "60 min", "75+ min"],
  runners: ["New to running", "Occasional runner", "Regular runner"],
  raceDistances: ["5K", "10K", "Half", "Full"],
  equipment: ["Full gym", "Home gym", "Minimal / bodyweight"],
  experience: ["New to lifting", "Some experience", "Experienced"],
  sexes: ["Male", "Female"],
  ages: ["16–24", "25–34", "35–44", "45–54", "55+"],
} as const;

export type SetupOption<Question extends keyof typeof SETUP_OPTIONS> =
  (typeof SETUP_OPTIONS)[Question][number];

/** The offer setup ends on (`Upgrade`). */
export const OFFER = {
  ready: "Your plan is ready",
  free: "Continue with Free",
} as const;

/** The workout screen (`WorkoutSession`), from Train's Start workout. */
export const WORKOUT = {
  start: "Start workout",
  /** The choice a session longer than the person's minutes offers. */
  fullSession: /^Full session/,
  close: "Close workout",
  markSet: "Mark set complete",
  save: "Save workout",
  done: "Done",
} as const;

/** Home, where setup's offer lands (`Home`'s page title). */
export const HOME = {
  heading: "Today",
} as const;

/** The tab bar (`BottomNavigation`, with `Layout`'s tabs). */
export const TABS = {
  navigation: "Main navigation",
  home: "Home",
  train: "Train",
  food: "Food",
  social: "Social",
  analytics: "Analytics",
} as const;

export type TabName = (typeof TABS)[Exclude<keyof typeof TABS, "navigation">];

/**
 * An exercise's line on Train (`ExerciseRowSummary`), as a person reads it:
 * "3 sets × 5 reps · 100 kg", "3 sets × 8–12 reps", "3 sets × 30s". No
 * weight for a bodyweight lift or an unloaded one.
 */
export function trainRowText(
  exercise: Pick<
    ProgramExercise,
    "exerciseId" | "sets" | "reps" | "weight" | "repUnit"
  > &
    Parameters<typeof prescribedRepRange>[0]
): string {
  const bodyweight =
    getExerciseById(exercise.exerciseId)?.equipment === "Bodyweight";
  const unit = exercise.repUnit === "seconds" ? "" : " reps";
  const weight =
    !bodyweight && exercise.weight > 0 ? ` · ${exercise.weight} kg` : "";
  return `${exercise.sets} sets × ${formatRepTarget(exercise)}${unit}${weight}`;
}
