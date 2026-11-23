/**
 * The run history a run's page ranks against (`runPlacings`), held for
 * the session: one account's saved runs, each kept as the few fields the
 * ranking reads (`PlacedRun`), never its route.
 *
 * Ranking a run's 1K, 5K and 10K needs every earlier run's times, and
 * Firestore reads a document whole, so a read of the history is a read of
 * every route. The finish (`readRunHistory`) and Bests
 * (`useLifetimeRunStats`) already make that read; every whole-history read
 * through `fetchSavedRuns` leaves its runs here, and a run's page ranks
 * from them without a read of its own (`useRunPlacings`). The page reads
 * the history only when nothing this session has, or when what is held
 * may be incomplete.
 *
 * `known` is whether the read was the whole history: made online and
 * answered by the server, not by this phone's cache alone. A run's page
 * places nothing from a history that is not known, as the finish does.
 *
 * Kept true for this phone's own changes: a run saved here is added
 * (`holdPlacedRun`) and a run deleted here is dropped (`dropPlacedRun`).
 * A run saved or deleted on another device arrives with the next
 * whole-history read on this one.
 *
 * Type imports only, so the saved-run reader can fill it without taking
 * the ranking's code into every chunk that reads runs.
 */
import type { PlacedRun } from "./runPlacings";

export interface PlacingHistory {
  uid: string;
  runs: readonly PlacedRun[];
  /** The whole history, read online from the server. */
  known: boolean;
}

let held: PlacingHistory | null = null;
const listeners = new Set<() => void>();

function set(next: PlacingHistory | null): void {
  held = next;
  for (const listener of listeners) listener();
}

/** What ranking reads of a run, and nothing else: no route, no splits
 *  beyond the kilometre times. */
export function placedRun(run: PlacedRun): PlacedRun {
  return {
    id: run.id,
    completedAt: run.completedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    distance: run.distance,
    duration: run.duration,
    avgPace: run.avgPace,
    activityType: run.activityType,
    place: run.place,
    isInvalid: run.isInvalid,
    savedAnyway: run.savedAnyway,
    ...(run.bestEfforts
      ? {
          bestEfforts: run.bestEfforts.map(({ distance, time }) => ({
            distance,
            time,
          })),
        }
      : {}),
    ...(run.kmSplitSeconds ? { kmSplitSeconds: run.kmSplitSeconds } : {}),
  };
}

/** Holds a whole-history read of `uid`'s runs, in place of any held. */
export function holdRunHistory(
  uid: string,
  runs: readonly PlacedRun[],
  known: boolean
): void {
  set({ uid, runs: runs.map(placedRun), known });
}

/** The history held for `uid`, or null when none is. */
export function placingHistory(uid: string): PlacingHistory | null {
  return held && held.uid === uid ? held : null;
}

/** A run this phone saved, added to (or replacing its copy in) the
 *  history held for `uid`. Nothing is held from it alone. */
export function holdPlacedRun(uid: string, run: PlacedRun): void {
  if (!held || held.uid !== uid) return;
  set({
    ...held,
    runs: [...held.runs.filter((other) => other.id !== run.id), placedRun(run)],
  });
}

/** A run this phone deleted, taken out of the history held for `uid`. */
export function dropPlacedRun(uid: string, runId: string): void {
  if (!held || held.uid !== uid) return;
  if (!held.runs.some((run) => run.id === runId)) return;
  set({ ...held, runs: held.runs.filter((run) => run.id !== runId) });
}

/** Lets go of whatever is held. */
export function forgetPlacingHistory(): void {
  if (held) set(null);
}

/** For `useSyncExternalStore`: called whenever the held history changes. */
export function subscribePlacingHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
