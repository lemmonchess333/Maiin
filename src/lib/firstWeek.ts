import { parseLocalDate } from "@/lib/dateHelpers";
import type { Workout } from "@/lib/savedWorkouts";

/**
 * A new account's first seven days, as Home's "Your first week" card
 * shows them: its first workout when the plan lifts and its first run
 * when the person runs, ticked as they happen. The week counts from the
 * day the plan was set up (`onboardingCompletedAt`), not from sign-up.
 *
 * It replaced a card of tab hints ("Tap Train to start a workout or
 * run"), which named buttons the tab bar already shows and said nothing
 * about what the first days are for. The first meal and three weigh-ins
 * it also listed went with the older journey (App1, whole-app grill Q27).
 */

/** How long the card lasts, from the day the plan was set up. */
export const FIRST_WEEK_DAYS = 7;

export type FirstWeekItemKey = "workout" | "run";

export interface FirstWeekItem {
  key: FirstWeekItemKey;
  label: string;
  done: boolean;
}

export interface FirstWeekInput {
  /** The first-week anchor ("yyyy-MM-dd"), or null when not known. */
  startKey: string | null;
  todayKey: string;
  /** The plan has lifts. */
  lifts: boolean;
  /** The person runs. */
  runs: boolean;
  workoutCount: number;
  runCount: number;
  dismissed: boolean;
  /** A resumable session goes above another training task. */
  priorityTask?: "workout" | "run" | null;
}

export interface FirstWeek {
  /** 1 on the day the plan was set up, up to 7. */
  day: number;
  items: FirstWeekItem[];
}

const DAY_MS = 86_400_000;

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round(
    (parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) /
      DAY_MS
  );
}

/** Which day of the account `todayKey` is: 1 on the day it began. Zero or
 *  less before it began, which only a wrong clock produces. */
function accountDay(startKey: string, todayKey: string): number {
  return daysBetween(startKey, todayKey) + 1;
}

/** A session counts only after a performed set or timed exercise was saved.
 * This mirrors the server-side activation outcome; an empty workout document
 * must never tick a first-week task. */
export function isFirstWeekWorkoutEligible(
  workout: Pick<Workout, "exercises">
): boolean {
  return (
    Array.isArray(workout?.exercises) &&
    workout.exercises.some(
      (exercise) =>
        (Array.isArray(exercise?.sets) &&
          exercise.sets.some((set) => {
            const reps = Number(set?.reps);
            return Number.isFinite(reps) && reps > 0;
          })) ||
        (exercise?.repUnit === "seconds" &&
          Number.isFinite(Number(exercise.durationMinutes)) &&
          Number(exercise.durationMinutes) > 0)
    )
  );
}

/**
 * The card's content, or null when it should not show: before the start
 * day is known, after the seventh day, once dismissed, or once every item
 * is done.
 */
export function firstWeek(input: FirstWeekInput): FirstWeek | null {
  if (input.dismissed || !input.startKey) return null;
  const day = accountDay(input.startKey, input.todayKey);
  if (day < 1 || day > FIRST_WEEK_DAYS) return null;

  const items: FirstWeekItem[] = [];
  if (input.lifts)
    items.push({
      key: "workout",
      label: "Finish your first workout",
      done: input.workoutCount > 0,
    });
  if (input.runs)
    items.push({
      key: "run",
      label: "Go for your first run",
      done: input.runCount > 0,
    });
  // Incomplete work leads, then the session Home leads with
  // (`priorityTask`: one to resume, else the first card that can start,
  // which is the run for a running aim); otherwise the lift first.
  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.key === input.priorityTask) return -1;
    if (b.key === input.priorityTask) return 1;
    return 0;
  });
  if (items.length === 0 || items.every((i) => i.done)) return null;
  return { day, items };
}
