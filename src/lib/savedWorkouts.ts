/**
 * Saved workouts, read one way.
 *
 * Thirteen modules queried `users/{uid}/workouts` themselves: one cast the
 * document to `Workout`, the rest picked out the fields they needed, each
 * with its own idea of which documents count, and none saw a workout saved
 * on this phone that had not synced yet. This module is the one place that
 * knows the stored shape:
 * - the field a query orders and windows by (`date`, the local day the
 *   session started, Lift3);
 * - how older stored forms of that day become a "YYYY-MM-DD" key;
 * - how workouts accepted on this phone but not yet synced join the list.
 *
 * Readers ask for a window of days and get `Workout`s, with every stored
 * field kept: the readers want different ones, and the parse only
 * guarantees the two every reader needs, a day key and an exercise list.
 */
import { parseISO } from "date-fns";
import {
  collection,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type Query,
} from "firebase/firestore";
import { db } from "./firebase";
import { addLocalDays, localDateString, parseLocalDate } from "./dateHelpers";
import { pendingDocumentWrites } from "./offlineQueue";
import { fetchSaved, type SavedSessionSource } from "./savedSessions";

/**
 * D2: widened from `{setNumber, reps, weightKg}`.
 *
 * The canonical definition and the single projection that builds these live in
 * `src/features/program/workoutSetRecord.ts` — read that file for why the
 * evidence matters, why none of it is backfillable, and why nothing reads the
 * new fields yet.
 */
export interface WorkoutSet {
  setNumber: number;
  reps: number;
  weightKg: number;
  /** working | warmup | dropset | failure. Absent on pre-D2 documents;
   *  `src/lib/export.ts` has always defaulted it to "working". */
  type?: string;
  /** Helms's 6–10 half-point scale. Interpret via the workout document's
   *  session-level `rpeProvenance`. */
  rpe?: number;
  /** The PRESCRIPTION this set was executed against, captured at write time
   *  because `applyProgression` overwrites it immediately afterwards — so
   *  planned-vs-actual is unrecoverable from any later read. */
  plannedReps?: number;
  plannedWeightKg?: number;
}

export interface WorkoutExercise {
  exerciseId: string;
  exerciseName: string;
  category: string;
  repUnit?: "reps" | "seconds";
  /** What the lifter typed against this exercise during the session
   *  ("Level 8, 6.0 incline"). Absent when they wrote nothing, and on
   *  every workout logged before notes were persisted. */
  notes?: string;
  sets: WorkoutSet[];
  /** Immutable number of working sets prescribed at session start. */
  plannedSetCount?: number;
  caloriesBurned: number;
  // Cardio-specific (optional)
  durationMinutes?: number;
  distanceKm?: number;
  intensity?: "low" | "moderate" | "high";
}

export interface Workout {
  revision?: number;
  lastCorrectionId?: string;
  programmeCompletion?: import("@/lib/workoutCompletion").SavedProgrammeCompletion;
  burnContext?: { bodyweightKg: number; inferred?: boolean };
  id: string;
  date: string;
  exercises: WorkoutExercise[];
  totalCalories: number;
  durationMinutes: number;
  notes: string;
  createdAt: Timestamp;
  /** The `activities` doc this session was posted as, if it was posted.
   *
   *  Sharing is reachable from two places now — the post-save composer and
   *  `/workout/:id` — and both call `postActivity`, which `addDoc`s a fresh
   *  activity every time. Without a marker on the workout, sharing the same
   *  session from both would put two posts in the feed for one workout.
   *  Written best-effort after the post lands; a failed write can only cause
   *  a duplicate post, never a lost workout. */
  sharedActivityId?: string;
  /** The programme or routine finish that wrote this workout, on saves
   *  made since completions carried an id. A session resumed after Finish
   *  uses it to leave its own record out of "last time". */
  completionId?: string;
}

/** Total kg lifted in a session, derived from its sets. The writers compute
 *  the same figure for the burn formula and persist it as `totalVolume`
 *  (#2041); this derives it from `exercises`, which is correct for every
 *  doc, old and new.
 *
 *  Timed exercises contribute NOTHING, because their `reps` is a duration
 *  and `weightKg × reps` is not a weight moved. That rule is the writers'
 *  — both `useProgram.completeWorkoutDay` and the server command reducer
 *  reduce with `repUnit === "seconds" ? 0 : …` — and this copy was missing
 *  it, so a weighted plank counted here and not there. `weighted-plank` is
 *  a real catalog exercise, so a 20 kg / 60 s hold added 1,200 kg to every
 *  surface below and to none of the recorded session totals.
 *
 *  This is the widest-read of the copies: History's volume card and chart,
 *  WorkoutDetail, the weekly recap, the solo feed, the share sheet, and
 *  SpacePostComposer, which MATERIALIZES the result onto a space post.
 *
 *  `repUnit` is compared to the literal rather than tested for truthiness
 *  because the type admits `"reps"` as an explicit value. */
export function workoutTonnageKg(workout: Pick<Workout, "exercises">): number {
  // Defensive `?? []`: legacy docs can miss `exercises` entirely; the
  // guarded per-set multiply already tolerates missing weight/reps, so
  // the container should tolerate a missing list the same way.
  return (workout.exercises ?? []).reduce(
    (t, ex) =>
      t +
      (ex?.repUnit === "seconds"
        ? 0
        : (ex?.sets ?? []).reduce(
            (s, set) => s + (set.weightKg || 0) * (set.reps || 0),
            0
          )),
    0
  );
}

/**
 * Which workouts a reader wants. Days are local "YYYY-MM-DD", inclusive:
 * `since`/`until` bound a range (`cap` limits how many); `latest` takes the
 * newest, optionally only those before a day; `all` is every workout.
 */
export type WorkoutWindow =
  | { since: string; until?: string; cap?: number }
  | { latest: number; before?: string }
  | { all: true };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The local day a stored `date` names, or null. Writers have stored a
 * "YYYY-MM-DD" key since `normaliseWorkoutDate`; older documents carry an
 * ISO timestamp or a Timestamp, which matched no day at all, so those
 * sessions counted on no surface that matches by day.
 */
export function workoutDay(value: unknown): string | null {
  if (typeof value === "string") {
    if (DAY_KEY.test(value)) {
      return localDateString(parseLocalDate(value)) === value ? value : null;
    }
    const parsed = parseISO(value);
    return Number.isFinite(parsed.getTime()) ? localDateString(parsed) : null;
  }
  if (value instanceof Timestamp) return localDateString(value.toDate());
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return localDateString(value);
  return null;
}

/**
 * A stored workout as a `Workout`, or null when it names no day. Every
 * stored field is kept; `date` is the day key and `exercises` is a list.
 * (Deleting a workout removes its document, ADR-0012; there is no
 * soft-deleted workout to leave out.)
 */
export function parseSavedWorkout(
  id: string,
  data: DocumentData
): Workout | null {
  const date = workoutDay(data.date);
  if (!date) return null;
  return {
    ...(data as Omit<Workout, "id" | "date" | "exercises">),
    id,
    date,
    exercises: Array.isArray(data.exercises) ? data.exercises : [],
  };
}

/** Parse a query's documents, dropping any that cannot be read. */
export function parseSavedWorkoutDocs(
  docs: readonly { id: string; data: () => DocumentData }[]
): Workout[] {
  const workouts: Workout[] = [];
  for (const d of docs) {
    const workout = parseSavedWorkout(d.id, d.data());
    if (workout) workouts.push(workout);
  }
  return workouts;
}

/** Whether a workout belongs to the window's days. */
export function inWorkoutWindow(
  workout: Workout,
  window: WorkoutWindow
): boolean {
  if ("since" in window) {
    return (
      workout.date >= window.since &&
      (window.until == null || workout.date <= window.until)
    );
  }
  if ("latest" in window && window.before != null) {
    return workout.date < window.before;
  }
  return true;
}

const dayShift = (key: string, days: number) =>
  localDateString(addLocalDays(parseLocalDate(key), days));

/**
 * The query for a window. A stored day key compares as itself, but an
 * older ISO `date` sorts between the key of its UTC day and the next one,
 * and its local day can be either side of that. So a range query reaches a
 * day past each bound and `inWorkoutWindow` trims it. "The newest N before
 * a day" keeps its bound exact: widening it would let that day's own
 * workouts take places in the N before being trimmed.
 */
export function savedWorkoutsQuery(uid: string, window: WorkoutWindow): Query {
  const workouts = collection(db, "users", uid, "workouts");
  if ("all" in window) return query(workouts, orderBy("date", "desc"));
  if ("latest" in window) {
    const before =
      window.before != null ? [where("date", "<", window.before)] : [];
    return query(
      workouts,
      ...before,
      orderBy("date", "desc"),
      limit(window.latest)
    );
  }
  const bounds = [where("date", ">=", dayShift(window.since, -1))];
  if (window.until != null)
    bounds.push(where("date", "<", dayShift(window.until, 2)));
  const capped = window.cap != null ? [limit(window.cap)] : [];
  return query(workouts, ...bounds, orderBy("date", "desc"), ...capped);
}

/**
 * The workouts a reader loaded, with the workouts this phone has accepted
 * but not yet synced laid over them, kept to the window and newest first.
 * A workout finished offline is the user's workout from the moment Finish
 * is tapped: every surface shows it, not only the one that saved it.
 */
export function withQueuedWorkouts(
  uid: string | null | undefined,
  loaded: readonly Workout[],
  window: WorkoutWindow
): Workout[] {
  const byId = new Map(loaded.map((workout) => [workout.id, workout]));
  if (uid) {
    for (const entry of pendingDocumentWrites(uid, `users/${uid}/workouts`)) {
      const base = entry.merge ? byId.get(entry.id) : undefined;
      if (entry.merge && !base) continue;
      const workout = parseSavedWorkout(entry.id, { ...base, ...entry.data });
      if (workout) byId.set(entry.id, workout);
    }
  }
  // Stable: workouts on the same day keep the order the query gave them.
  const workouts = [...byId.values()]
    .filter((workout) => inWorkoutWindow(workout, window))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if ("latest" in window) return workouts.slice(0, window.latest);
  return "cap" in window && window.cap != null
    ? workouts.slice(0, window.cap)
    : workouts;
}

/** A stable key for a window: a live query restarts only when it changes. */
export function workoutWindowKey(window: WorkoutWindow): string {
  if ("all" in window) return "all";
  if ("latest" in window)
    return `latest:${window.latest}:${window.before ?? ""}`;
  return `days:${window.since}:${window.until ?? ""}:${window.cap ?? ""}`;
}

/** Saved workouts as a session source, for `useSavedSessions` and
 *  `fetchSaved`. */
export const SAVED_WORKOUTS: SavedSessionSource<Workout, WorkoutWindow> = {
  collection: "workouts",
  windowKey: workoutWindowKey,
  query: savedWorkoutsQuery,
  parseDocs: parseSavedWorkoutDocs,
  inWindow: inWorkoutWindow,
  withQueued: withQueuedWorkouts,
};

/**
 * One read of a window, for readers that do not stay subscribed. Workouts
 * saved on this phone and not yet synced are included when `uid` is the
 * signed-in account (another account has none queued here).
 */
export function fetchSavedWorkouts(
  uid: string,
  window: WorkoutWindow
): Promise<Workout[]> {
  return fetchSaved(SAVED_WORKOUTS, uid, window);
}
