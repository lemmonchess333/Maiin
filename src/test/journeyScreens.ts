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
 * - A planned run's: `StackedCTACards.test.tsx`, `RunLaunchCard.test.tsx`,
 *   `RunSetupModal.journeyNames.test.tsx` (the run type, the treadmill and
 *   its start), `RunSummary.savedRunState.test.tsx` and `WeekStrip.test.tsx`.
 * - Welcome back's: `LiftReturnSheet.test.tsx`, and the runner's:
 *   `RunReturnSheet.test.tsx`.
 * - Train's rows, its Start workout, its two halves, the run week, the
 *   lift week's banners and the recovery count, "Why this run", Home's
 *   title and the tab bar: `journeyScreens.test.tsx`.
 */
import { prescribedRepRange } from "@/features/program/programEngine";
import type { ProgramExercise } from "@/features/program/programTypes";
import { formatRepTarget } from "@/features/program/repTarget";
import { getExerciseById } from "@/lib/exercises";
import { runStripLabel } from "@/lib/runProgrammeViewModel";

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
  /** Run9 STATUS 2026-11-01: asked of every distance goal, nothing chosen. */
  raceEntry: "Race or on your own",
  raceEntered: "A race I've entered",
  legTrim: "Lighten leg sessions while your runs build",
  noInjuries: "None",
  weight: "Weight (kg)",
  height: "Height (cm)",
  sex: "Sex for calorie calculation",
  age: "Age range",
  start: "Go to Today",
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
    "Support my running",
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
  /** The session's own Add exercise, and its picker's title
   *  (`WorkoutSessionAddExercise.test.tsx`). */
  addExercise: "Add exercise",
  save: "Save workout",
  done: "Done",
} as const;

/** A planned run done on a treadmill, from Home's card to the summary:
 *  Home's run card, whose Start goes straight into the run, and the GPS
 *  screen it starts on, whose "On a treadmill" moves the run there; the
 *  Run page's launch card and its setup (`RunLaunchCard`, `RunSetupModal`:
 *  the run's type, by its name, and the "On a treadmill" switch, which
 *  says where the run is done and leaves the type alone, Pgm8), the manual
 *  distance (`TreadmillMode`, labelled by `Run`) and the summary
 *  (`RunSummary`): the planned session's heading for a planned run done as
 *  planned, its Save, the off-plan prompt's "Mark scheduled run complete"
 *  a run of another type than the plan's is asked, and Done. */
export const RUN = {
  homeStart: "Start run",
  /** A button on the GPS screen (`Run`). */
  gpsTreadmill: "On a treadmill",
  customise: "Customise",
  /** The setup's run type, by the type's name ("Easy run"). */
  runType: (typeName: string) =>
    `Selected run type: ${typeName}. Tap to change.`,
  /** A switch. */
  treadmill: "On a treadmill",
  startTreadmill: "Start on the treadmill",
  elapsedTime: "Elapsed time",
  distance: "Distance from treadmill",
  saveTreadmill: "Save treadmill run",
  /** The summary's heading, by the planned session's name ("Easy 30"). */
  summary: (sessionName: string) => `${sessionName} complete ✓`,
  save: "Save run",
  markPlannedDone: "Mark scheduled run complete",
  done: "Done",
} as const;

/** Home's greeting for a lifter back from two weeks or more away
 *  (`LiftReturnSheet`, Lift4 (11)). */
export const WELCOME_BACK = {
  sheet: "Welcome back",
  easeBack: /^Ease back in/,
  keep: /^Keep my old weights/,
} as const;

/** Home's greeting for a free runner back from two weeks or more away
 *  (`RunReturnSheet`). A race plan's opens the fell-behind sheet instead. */
export const RUN_RETURN = {
  sheet: "Welcome back",
  easyRun: /^Start with an easy run/,
  notNow: "Not now",
} as const;

/** Home's week strip: the words a day's label ends on (`WeekStrip`). */
export const STRIP = {
  runDone: "completed run",
} as const;

/** Home, where a saved version 2 plan lands (`Home`'s page title). */
export const HOME = {
  heading: "Today",
} as const;

/** Train's two halves (`Program`'s switch) and the run half's week
 *  (`ProgrammeWeekSelector`). */
export const TRAIN = {
  mode: "Train mode",
  lift: "Lift",
  run: "Run",
  runWeek: "Run week",
  /** A planned day's card opens the run's own card (`ProgrammeRunSection`). */
  viewRun: "View run",
  /** Today's planned run starts from its card, straight into the run. */
  startRun: "Start run",
  /** The Lift tab's way into a workout with no plan day
   *  (`EmptyWorkoutEntry.test.tsx`). */
  emptyWorkout: "Empty workout",
} as const;

/** A run's name on Train's run week, from its template: the function
 *  `ProgrammeRunSection` labels each day's cell with (Run21 (2)). */
export const runWeekLabel = runStripLabel;

/** A day on Train's run week, by its name: the run's short label
 *  (`runWeekLabel`), and whether the day is today or the run done. Until
 *  its run is done its text is the date's day of the month, which tells
 *  apart days whose runs share a name. */
export function runWeekTabName(
  label: string,
  state?: "today" | "completed" | "skipped"
): string {
  return state ? `${label}, ${state}` : label;
}

/** The banner over Train's lift week in the weeks a race plan turns
 *  (`DeloadBanner`, Lift4 (9) and (10)), each a region named by its
 *  title. */
export const LIFT_WEEK_BANNER = {
  lighter: "Lighter week",
  taper: "Taper",
  race: "Race week",
  recovery: "Recovery",
} as const;

/** "Why this run" (`RunPurpose`), and the parts it says a run in
 *  (`RunAbout`, Run21 (3) and (2)). */
export const RUN_ABOUT = {
  open: "Why this run",
  what: "What it is",
  feel: "How it should feel",
  why: "Why it's in your week",
  ifWrong: "If it feels wrong",
  alsoCalled: "Coaches also call this",
} as const;

/** Train's run half while the runner recovers from a race
 *  (`ProgrammeRunSection`): its banner counts the days left. */
export const RUN_RECOVERY = /^Recovering · \d+ days? left$/;

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
 * "3 sets × 5 reps · 100 kg", "3 sets × 8–12 reps", "3 sets × 30s", and
 * "3 sets × 8 reps · +10 kg" for a bodyweight lift with load added (Pgm8
 * L6). No weight for a bodyweight lift with none, or an unloaded lift.
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
    exercise.weight > 0
      ? ` · ${bodyweight ? "+" : ""}${exercise.weight} kg`
      : "";
  return `${exercise.sets} sets × ${formatRepTarget(exercise)}${unit}${weight}`;
}
