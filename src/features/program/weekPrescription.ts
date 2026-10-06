import type { Experience, WeeklyPrescription } from "./programTypes";

/**
 * Where a week sits in the training cycle, apart from the generator
 * (`programEngine.ts`) so the surfaces that only read it (Home's session
 * line, the performance signals, Train's end-of-cycle badge) don't load
 * the plan builder with them.
 */

/**
 * The cycle position of a week: every 4th week is a lighter one. That is
 * the whole periodisation: no intensity ramp and no volume modifier ride
 * on it, because the sources don't support one: Schoenfeld p.193
 * (a systematic review of 12 studies finds no clear benefit to periodising
 * for hypertrophy; it is established for strength), p.194 (linear and
 * undulating come out equivalent across a meta-analysis and 8 primary
 * studies), Helms p.79 ("asking 'which type of periodization is the best?'
 * is the wrong question"). Computed on demand and never stored:
 * `advanceWeek` keeps only the `currentPhase` it derives.
 */
export function generateWeekPrescription(week: number): WeeklyPrescription {
  return { week, deload: week % 4 === 0 };
}

/**
 * A cycle ends on its lighter week: finishing that week finishes a 4-week
 * cycle (the `programme_complete` badge). Read from
 * `generateWeekPrescription`, so it can't drift from the schedule.
 */
export function isCycleEndWeek(week: number): boolean {
  return week > 0 && generateWeekPrescription(week).deload;
}

/**
 * Whether the calendar gives this plan lighter weeks (Lift4 (9)): an
 * intermediate or advanced lifter on three or more lift days. A beginner,
 * an unknown level (a beginner's) and a plan of one or two days get none;
 * anyone can still take one from Train.
 */
export function lighterWeeksScheduled(
  experience: Experience | undefined,
  liftDays: number
): boolean {
  return (
    (experience === "intermediate" || experience === "advanced") &&
    liftDays >= 3
  );
}
