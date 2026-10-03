import { useCallback, useSyncExternalStore } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
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
    const windowStartString = (runWindow as { since: string }).since;

    const workoutsRef = collection(db, "users", uid, "workouts");
    const workoutsQ = query(
      workoutsRef,
      where("date", ">=", windowStartString),
      orderBy("date", "desc"),
      limit(DOC_LIMIT)
    );
    const unsubWorkouts = onSnapshot(workoutsQ, (snap) => {
      const rows: WorkoutRow[] = snap.docs
        .map((d) => d.data() as { date?: unknown; totalCalories?: unknown })
        .filter((d) => typeof d.date === "string")
        .map((d) => ({
          date: d.date as string,
          totalCalories:
            typeof d.totalCalories === "number" ? d.totalCalories : 0,
        }));
      publish({ workouts: rows, workoutsLoaded: true });
    });

    // Runs through the one saved-run reader: one parse and the Lift3 day,
    // so a run begun before midnight burns on the day it began. A run saved
    // on this phone burns from the moment it is saved, before it syncs.
    let savedRuns: SavedRun[] = [];
    const unsubRuns = onSnapshot(savedRunsQuery(uid, runWindow), (snap) => {
      savedRuns = parseSavedRunDocs(snap.docs);
      publish({
        runs: burnRows(uid, savedRuns, runWindow),
        runsLoaded: true,
      });
    });
    const unsubQueue = subscribeQueuedWrites(() =>
      publish({ runs: burnRows(uid, savedRuns, runWindow) })
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
