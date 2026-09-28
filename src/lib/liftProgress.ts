/**
 * How each of a lifter's main lifts is moving, told in the sets they
 * actually did.
 *
 * The Lifting page showed a month's tonnage and a bar per session. Neither
 * answers what a lifter opens it for: is my bench going up, and is
 * anything stuck? This takes every lift trained at least twice in the
 * range and, for each, says where it stands: the latest top set against
 * the first in the range, a new best when one was just set, or how long
 * it has been since the last one when a lift has stopped moving.
 *
 * Direction is judged on estimated one-rep max (Epley), so 80 kg × 8 and
 * 85 kg × 5 compare fairly, but what a row SHOWS is the set itself. The
 * PRs tab prints e1RM as a range because a point estimate claims more than
 * a set can support; a set the user lifted claims nothing.
 */
import { epley1RMExact } from "./analytics";
import { getExerciseById, EXERCISES } from "./exercises";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";

/** How many lifts the card shows before "Show all". */
export const LIFT_PROGRESS_SHOWN = 5;
/** A best set in the last this-many days is news: the PRs tab's "New"
 *  window, so the two pages agree about the same set. */
export const NEW_BEST_DAYS = 7;
/** No best for this long, and trained at least `HOLDING_SESSIONS` times
 *  since, is a lift that has stopped moving. */
export const HOLDING_DAYS = 21;
export const HOLDING_SESSIONS = 3;
/** A change inside this fraction of e1RM reads as level: 100 kg × 5 and
 *  102.5 kg × 4 are the same day's strength, not a gain. */
export const LEVEL_BAND = 0.01;

export interface TopSet {
  weight: number;
  reps: number;
  /** Local "YYYY-MM-DD" of the session. */
  date: string;
  e1rm: number;
}

export interface LiftProgressRow {
  exerciseId: string;
  name: string;
  /** Sessions of this lift inside the range. */
  sessions: number;
  /** The top set of the first session inside the range, and of the latest. */
  first: TopSet;
  latest: TopSet;
  /** Each session's top-set e1RM inside the range, oldest first. */
  series: number[];
  /** The latest top set against the first, on e1RM. */
  direction: "up" | "down" | "level";
  /** The lift's best ever, when it beat an earlier session in the last
   *  `NEW_BEST_DAYS` days. */
  newBest: TopSet | null;
  /** The best ever, when it is `HOLDING_DAYS` old and `HOLDING_SESSIONS`
   *  sessions have not beaten it; with how many sessions that is. */
  holding: { best: TopSet; sessionsSince: number } | null;
}

interface ProgressWorkout {
  date: string;
  exercises?: readonly {
    exerciseId?: string;
    exerciseName: string;
    repUnit?: string;
    sets?: readonly { weightKg: number; reps: number; type?: string }[];
  }[];
}

function idFor(ex: { exerciseId?: string; exerciseName: string }): string {
  if (ex.exerciseId && getExerciseById(ex.exerciseId)) return ex.exerciseId;
  return EXERCISES.find((e) => e.name === ex.exerciseName)?.id ?? "";
}

/** The session's best set by e1RM: loaded, counted in reps, not a warm-up. */
function topSetOf(
  sets: readonly { weightKg: number; reps: number; type?: string }[],
  date: string
): TopSet | null {
  let best: TopSet | null = null;
  for (const set of sets) {
    if (set.type === "warmup") continue;
    if (!(set.weightKg > 0) || !(set.reps > 0)) continue;
    const e1rm = epley1RMExact(set.weightKg, set.reps);
    if (!best || e1rm > best.e1rm) {
      best = { weight: set.weightKg, reps: set.reps, date, e1rm };
    }
  }
  return best;
}

interface LiftHistory {
  id: string;
  name: string;
  /** Every session's top set, all time, oldest first. */
  sessions: TopSet[];
  /** Where the lift sat among the session's lifts, from 0, in the range. */
  positions: number[];
}

/**
 * Every lift trained at least twice in the range, the ones a lifter opens
 * sessions with first: a programme puts its main lift first, so where a
 * lift sits in the session says more about which lifts matter to this
 * user than its weight does (a leg press outweighs every squat).
 */
export function liftProgress(
  workouts: readonly ProgressWorkout[],
  { sinceKey, today }: { sinceKey: string; today: Date }
): LiftProgressRow[] {
  const todayKey = localDateString(today);
  const byLift = new Map<string, LiftHistory>();
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of ordered) {
    const inRange = w.date >= sinceKey && w.date <= todayKey;
    let position = 0;
    for (const ex of w.exercises ?? []) {
      if (ex.repUnit === "seconds") continue;
      const id = idFor(ex);
      // Bodyweight lifts are measured in reps, which this list does not
      // compare; the exercise's own history page does.
      if (id && getExerciseById(id)?.equipment === "Bodyweight") continue;
      const top = topSetOf(ex.sets ?? [], w.date);
      if (!top) continue;
      const key = id || ex.exerciseName;
      let entry = byLift.get(key);
      if (!entry) {
        entry = { id, name: ex.exerciseName, sessions: [], positions: [] };
        byLift.set(key, entry);
      }
      entry.sessions.push(top);
      if (inRange) entry.positions.push(position);
      position += 1;
    }
  }

  const newSince = localDateString(addLocalDays(today, -NEW_BEST_DAYS));
  const rows: { row: LiftProgressRow; meanPosition: number }[] = [];
  for (const { id, name, sessions, positions } of byLift.values()) {
    const inRange = sessions.filter(
      (s) => s.date >= sinceKey && s.date <= todayKey
    );
    if (inRange.length < 2) continue;
    // The best ever, and the day it was FIRST reached: a tie is not a
    // new best, so strictly greater.
    let best = sessions[0];
    for (const s of sessions) if (s.e1rm > best.e1rm) best = s;
    const first = inRange[0];
    const latest = inRange[inRange.length - 1];

    // New only when it beat something: a lift's first session is where
    // it starts, not a best it set.
    const newBest =
      best !== sessions[0] && best.date >= newSince && best.date >= sinceKey
        ? best
        : null;

    const sessionsSince = sessions.filter((s) => s.date > best.date).length;
    const daysSince = Math.round(
      (parseLocalDate(todayKey).getTime() -
        parseLocalDate(best.date).getTime()) /
        86_400_000
    );
    const holding =
      daysSince >= HOLDING_DAYS && sessionsSince >= HOLDING_SESSIONS
        ? { best, sessionsSince }
        : null;

    const change = (latest.e1rm - first.e1rm) / first.e1rm;
    rows.push({
      row: {
        exerciseId: id,
        name,
        sessions: inRange.length,
        first,
        latest,
        series: inRange.map((s) => s.e1rm),
        direction:
          change > LEVEL_BAND ? "up" : change < -LEVEL_BAND ? "down" : "level",
        newBest,
        holding,
      },
      meanPosition: positions.reduce((a, b) => a + b, 0) / positions.length,
    });
  }

  return rows
    .sort(
      (a, b) =>
        a.meanPosition - b.meanPosition ||
        b.row.sessions - a.row.sessions ||
        b.row.latest.e1rm - a.row.latest.e1rm ||
        a.row.name.localeCompare(b.row.name)
    )
    .map(({ row }) => row);
}
