import { useCallback, useSyncExternalStore } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import { isVolumeEligible } from "@/lib/runStatsEligibility";
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
  completedAt: Timestamp | null;
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
    const windowStart = parseLocalDate(today);
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);
    const windowStartString = localDateString(windowStart);
    const windowStartTs = Timestamp.fromDate(windowStart);

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

    const runsRef = collection(db, "users", uid, "runs");
    const runsQ = query(
      runsRef,
      where("completedAt", ">=", windowStartTs),
      orderBy("completedAt", "desc"),
      limit(DOC_LIMIT)
    );
    const unsubRuns = onSnapshot(runsQ, (snap) => {
      // Drop non-countable runs (saved-anyway "too-fast" misclicks) so a bad
      // GPS reading can't inflate the informational burn tiles.
      const rows: RunRow[] = snap.docs
        .map((d) => {
          const raw = d.data() as {
            completedAt?: unknown;
            calories?: unknown;
            isInvalid?: boolean;
            savedAnyway?: boolean;
            distance?: number;
            duration?: number;
          };
          if (!isVolumeEligible(raw)) return null;
          const ts =
            raw.completedAt instanceof Timestamp ? raw.completedAt : null;
          return {
            completedAt: ts,
            calories: typeof raw.calories === "number" ? raw.calories : 0,
          };
        })
        .filter((row): row is RunRow => row !== null);
      publish({ runs: rows, runsLoaded: true });
    });

    owner.stop = () => {
      active = false;
      unsubProgram();
      unsubWorkouts();
      unsubRuns();
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
