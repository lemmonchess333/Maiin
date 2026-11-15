/**
 * Personal trajectory — this week's sessions against last week's, for a
 * single user.
 *
 * Counted as every week is counted (`weekDone`, trainingWeek.ts, App1
 * Q14), so the card says what Home's "This week" says: every saved
 * workout, every run that counts toward volume, and a planned run marked
 * done by hand on a day with no run. Sessions is the one measure a lifter
 * and a runner share; the points this replaced (`km * 100 + kg * 0.1`)
 * made 1 km worth 1,000 kg. We count both the current week (Monday 00:00
 * local → now) and the prior week (Monday 00:00 → Sunday 23:59:59) so the
 * Following feed's week card can show a week-over-week trajectory.
 * Distance and volume stay as the breakdown.
 *
 * It began as the stand-in for the friends board (from the council
 * review: when you're the only athlete on a board, showing it to
 * yourself reads as "the app is empty"). The board went on 11 November
 * 2026 (Trim1 call 3(a)) and the card stayed.
 */

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { localDateString, startOfLocalWeek } from "@/lib/dateHelpers";
import { logger } from "@/lib/logger";
import type { ManualCompletion } from "@/features/program/programTypes";
import { fetchSavedRuns, type SavedRun } from "./savedRuns";
import {
  fetchSavedWorkouts,
  workoutTonnageKg,
  type Workout,
} from "./savedWorkouts";
import { weekDone, type WeekDoneInput } from "./trainingWeek";

type Plan = WeekDoneInput["programState"];

export interface TrajectoryBreakdown {
  sessions: number;
  km: number;
  kg: number;
}

export interface PersonalTrajectory {
  thisWeek: TrajectoryBreakdown;
  lastWeek: TrajectoryBreakdown;
  /**
   * Last week's running total at the same elapsed point in the week —
   * i.e. summed from `lastWeekStart` to `lastWeekStart + (now -
   * thisWeekStart)`. Used as the *fair* baseline for the week-over-week
   * delta: comparing a Tuesday cumulative against a full prior week's
   * total guarantees a misleading negative percentage.
   *
   * `lastWeek.sessions` is still kept around for the "Last week 4
   * sessions" informational baseline row — it's the right number for
   * that row, just not for the delta.
   */
  lastWeekToDate: TrajectoryBreakdown;
  /**
   * Sessions this week less last week's at the same point. Positive =
   * ahead, negative = behind. A count, not a percentage: on a handful of
   * sessions a percentage swings wildly ("+50%" for one more).
   */
  delta: number;
}

function startOfWeek(d: Date): Date {
  // The shared anchor, not a local copy of the arithmetic.
  return startOfLocalWeek(d);
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

function toDateKey(d: Date): string {
  // Firestore workouts are keyed by local yyyy-MM-dd string — match
  // that format here so the `where('date', '>=', ...)` clause lines up.
  return localDateString(d);
}

/**
 * Whether a run counts before `cutoff`. A run belongs to the day it started
 * (Lift3), so a run on an earlier day always counts, even one that ran past
 * midnight; on the cutoff's own day it counts once it had finished.
 */
function ranBefore(run: SavedRun, cutoff: Date): boolean {
  return (
    run.day < toDateKey(cutoff) || run.completedAt.getTime() < cutoff.getTime()
  );
}

/**
 * The same rule for a workout: one on an earlier day always counts; on the
 * cutoff's own day it counts once it had been saved. The workouts query
 * used to stop at the cutoff's day, so last Tuesday's morning session never
 * counted towards "last week at this point" on a Tuesday afternoon.
 */
function liftedBefore(workout: Workout, cutoff: Date): boolean {
  const day = toDateKey(cutoff);
  if (workout.date < day) return true;
  const saved = workout.createdAt?.toDate?.();
  return (
    workout.date === day &&
    saved instanceof Date &&
    saved.getTime() < cutoff.getTime()
  );
}

/** When a planned run was marked done by hand, in milliseconds. */
function completedMs(completion: ManualCompletion): number {
  const at = completion.completedAt;
  if (typeof at === "number") return at;
  if (at instanceof Date) return at.getTime();
  return at.seconds * 1000 + Math.floor(at.nanoseconds / 1e6);
}

/**
 * The plan as it stood at `cutoff`: a run marked done by hand counts once
 * it had been marked, as a recorded session counts once it had been saved.
 */
function planAt(plan: Plan, cutoff: Date): Plan {
  if (!plan?.manualCompletions) return plan;
  return {
    ...plan,
    manualCompletions: Object.fromEntries(
      Object.entries(plan.manualCompletions).filter(
        ([, completion]) => completedMs(completion) < cutoff.getTime()
      )
    ),
  };
}

async function computeRangeBreakdown(
  uid: string,
  fromDate: Date,
  toDate: Date,
  plan: Plan,
  /** Count only what had been done by `toDate`: the to-date slice. */
  cut: boolean
): Promise<TrajectoryBreakdown> {
  const fromKey = toDateKey(fromDate);
  const lastDay = toDateKey(new Date(toDate.getTime() - 1));

  const [runs, workouts] = await Promise.all([
    fetchSavedRuns(uid, { since: fromKey, until: lastDay, cap: 100 }),
    fetchSavedWorkouts(uid, { since: fromKey, until: lastDay, cap: 100 }),
  ]);

  const ran = cut ? runs.filter((run) => ranBefore(run, toDate)) : runs;
  const lifted = cut
    ? workouts.filter((workout) => liftedBefore(workout, toDate))
    : workouts;
  const done = weekDone({
    weekKey: fromKey,
    workouts: lifted,
    runs: ran,
    programState: cut ? planAt(plan, toDate) : plan,
  });
  // Timed holds lift nothing (`workoutTonnageKg`), as the server's
  // challenge maths has it.
  const kg = lifted.reduce((s, workout) => s + workoutTonnageKg(workout), 0);

  return {
    sessions: done.lifts + done.runs,
    km: Math.round(done.metres / 100) / 10,
    kg: Math.round(kg),
  };
}

/** The plan, for its runs marked done by hand. Without it the card counts
 *  what was recorded, which is most of every week. */
async function readPlan(uid: string): Promise<Plan> {
  try {
    const snap = await getDoc(doc(db, "users", uid, "programState", "current"));
    return snap.exists() ? (snap.data() as NonNullable<Plan>) : null;
  } catch (err) {
    logger.warn("[personalTrajectory] plan read failed", err);
    return null;
  }
}

export async function getPersonalTrajectory(
  uid: string
): Promise<PersonalTrajectory> {
  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const nextWeekStart = addDays(thisWeekStart, 7);
  const lastWeekStart = addDays(thisWeekStart, -7);
  /* Same-elapsed-time-into-the-week marker for last week. If today is
     Tuesday 14:00, this is last Tuesday 14:00. The delta then compares
     "cumulative this week so far" against "cumulative last week at the
     same point" — a fair like-for-like rather than the previous
     "Tuesday vs full week" apples-to-oranges comparison. */
  const elapsedMs = now.getTime() - thisWeekStart.getTime();
  const lastWeekToDateEnd = new Date(lastWeekStart.getTime() + elapsedMs);

  const plan = await readPlan(uid);
  const [thisWeek, lastWeek, lastWeekToDate] = await Promise.all([
    computeRangeBreakdown(uid, thisWeekStart, nextWeekStart, plan, false),
    computeRangeBreakdown(uid, lastWeekStart, thisWeekStart, plan, false),
    computeRangeBreakdown(uid, lastWeekStart, lastWeekToDateEnd, plan, true),
  ]);

  return {
    thisWeek,
    lastWeek,
    lastWeekToDate,
    delta: thisWeek.sessions - lastWeekToDate.sessions,
  };
}
