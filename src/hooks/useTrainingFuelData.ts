import { useCallback, useSyncExternalStore } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
import { subscribeQueuedWrites } from "@/lib/offlineQueue";
import {
  parseSavedRunDocs,
  savedRunsQuery,
  withQueuedRuns,
  type RunWindow,
  type SavedRun,
} from "@/lib/savedRuns";
import {
  parseSavedWorkoutDocs,
  savedWorkoutsQuery,
  withQueuedWorkouts,
  type Workout,
  type WorkoutWindow,
} from "@/lib/savedWorkouts";
import type { ProgramState } from "@/features/program/programTypes";

// ── Subscription window ──────────────────────────────────────────────────
// 30-day rolling window, limit 60 docs. Handles even high-volume users.
// Viewing a date older than 30 days falls back to actualBurn=0 (display only).
const WINDOW_DAYS = 30;
const DOC_LIMIT = 60;

export interface WorkoutRow {
  date: string;
  totalCalories: number;
}

export interface RunRow {
  /** The local day the run belongs to (Lift3: the day it started). */
  day: string;
  calories: number;
}

interface TrainingFuelData {
  program: ProgramState | null;
  workouts: WorkoutRow[];
  runs: RunRow[];
  workoutsLoaded: boolean;
  runsLoaded: boolean;
}
const EMPTY: TrainingFuelData = {
  program: null,
  workouts: [],
  runs: [],
  workoutsLoaded: false,
  runsLoaded: false,
};

function runWindowFor(today: string): RunWindow {
  const start = parseLocalDate(today);
  start.setDate(start.getDate() - WINDOW_DAYS);
  return { since: localDateString(start), cap: DOC_LIMIT };
}

/**
 * The window's workouts as the burn tiles count them: the server's, with
 * this phone's unsynced ones laid over them.
 */
function liftRows(
  uid: string,
  savedWorkouts: readonly Workout[],
  window: WorkoutWindow
): WorkoutRow[] {
  return withQueuedWorkouts(uid, savedWorkouts, window).map((workout) => ({
    date: workout.date,
    totalCalories:
      typeof workout.totalCalories === "number" ? workout.totalCalories : 0,
  }));
}

/**
 * The window's runs as the burn tiles count them: the server's, with this
 * phone's unsynced runs laid over them, and only runs that can count
 * (saved-anyway "too-fast" misclicks never do: a bad GPS reading can't
 * inflate the informational burn tiles).
 */
function burnRows(
  uid: string,
  savedRuns: readonly SavedRun[],
  window: RunWindow
): RunRow[] {
  return withQueuedRuns(uid, savedRuns, window)
    .filter(isVolumeEligible)
    .map((run) => ({ day: run.day, calories: run.calories }));
}

interface Entry {
  value: TrainingFuelData;
  listeners: Set<() => void>;
  stop: () => void;
}
// All target consumers share these three subscriptions and row projections.
// Entries belong to one account/day and disappear with their last consumer.
const entries = new Map<string, Entry>();

function subscribe(uid: string, today: string, notify: () => void): () => void {
  const key = `${uid}/${today}`;
  let entry = entries.get(key);
  if (!entry) {
    entry = { value: EMPTY, listeners: new Set(), stop: () => {} };
    entries.set(key, entry);
    const owner = entry;
    let active = true;
    const publish = (patch: Partial<TrainingFuelData>) => {
      if (!active) return;
      owner.value = { ...owner.value, ...patch };
      owner.listeners.forEach((listener) => listener());
    };
    // Read-only: migrations and automatic programme transitions remain owned
    // by useProgram, never by nutrition screens or the daily snapshot writer.
    const unsubProgram = onSnapshot(
      doc(db, "users", uid, "programState", "current"),
      (snap) =>
        publish({
          program: snap.exists() ? (snap.data() as ProgramState) : null,
        }),
      () => publish({ program: null })
    );
    const runWindow = runWindowFor(today);
    const workoutWindow: WorkoutWindow = {
      since: (runWindow as { since: string }).since,
      cap: DOC_LIMIT,
    };

    // Workouts and runs through their one readers, with what this phone
    // has saved and not yet synced, so a session burns from the moment it
    // is saved.
    let savedWorkouts: Workout[] = [];
    const unsubWorkouts = onSnapshot(
      savedWorkoutsQuery(uid, workoutWindow),
      (snap) => {
        savedWorkouts = parseSavedWorkoutDocs(snap.docs);
        publish({
          workouts: liftRows(uid, savedWorkouts, workoutWindow),
          workoutsLoaded: true,
        });
      }
    );

    // One parse and the Lift3 day for runs, so a run begun before midnight
    // burns on the day it began.
    let savedRuns: SavedRun[] = [];
    const unsubRuns = onSnapshot(savedRunsQuery(uid, runWindow), (snap) => {
      savedRuns = parseSavedRunDocs(snap.docs);
      publish({
        runs: burnRows(uid, savedRuns, runWindow),
        runsLoaded: true,
      });
    });
    const unsubQueue = subscribeQueuedWrites(() =>
      publish({
        workouts: liftRows(uid, savedWorkouts, workoutWindow),
        runs: burnRows(uid, savedRuns, runWindow),
      })
    );

    owner.stop = () => {
      active = false;
      unsubProgram();
      unsubWorkouts();
      unsubRuns();
      unsubQueue();
    };
  }
  entry.listeners.add(notify);
  const owner = entry;
  return () => {
    owner.listeners.delete(notify);
    if (!owner.listeners.size) {
      owner.stop();
      entries.delete(key);
    }
  };
}

export function useTrainingFuelData(
  uid: string | null,
  today: string
): TrainingFuelData {
  const listen = useCallback(
    (notify: () => void) => (uid ? subscribe(uid, today, notify) : () => {}),
    [uid, today]
  );
  const snapshot = useCallback(
    () => (uid ? (entries.get(`${uid}/${today}`)?.value ?? EMPTY) : EMPTY),
    [uid, today]
  );
  return useSyncExternalStore(listen, snapshot, () => EMPTY);
}
