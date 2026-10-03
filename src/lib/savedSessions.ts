/**
 * What every saved-session reader shares.
 *
 * Runs (`savedRuns.ts`) and workouts (`savedWorkouts.ts`) are stored
 * differently: a run is windowed by when it finished and dated by when it
 * started, a workout is windowed and dated by its `date`. Each kind's module
 * owns that. What they share is the shape a reader is built from, a
 * `SavedSessionSource`, so one live engine (`useSavedSessions`) and one
 * one-shot read (`fetchSaved`) serve both, and the rules for whose rows are
 * shown, when a list counts as loaded and how sessions saved on this phone
 * join it are written once.
 */
import { getDocs, type DocumentData, type Query } from "firebase/firestore";
import { pendingDocumentWrites } from "./offlineQueue";

export type SessionCollection = "runs" | "workouts";

/** One kind of saved session, as a reader is built from it. */
export interface SavedSessionSource<T, W> {
  /** The collection under `users/{uid}`. */
  collection: SessionCollection;
  /** A stable key for a window, so a live query restarts only when the
   *  window itself changes, not when a caller rebuilds the object. */
  windowKey(window: W): string;
  /** The query for a window. It may be wider than the window. */
  query(uid: string, window: W): Query;
  /** The documents a query returned, as sessions, dropping any that cannot
   *  be read. */
  parseDocs(docs: readonly { id: string; data: () => DocumentData }[]): T[];
  /** Whether a session belongs to the window (trims a wider query). */
  inWindow(item: T, window: W): boolean;
  /** The loaded sessions with this phone's unsynced ones laid over them,
   *  kept to the window and newest first. */
  withQueued(
    uid: string | null | undefined,
    loaded: readonly T[],
    window: W
  ): T[];
}

function pending(uid: string, collection: SessionCollection) {
  return pendingDocumentWrites(uid, `users/${uid}/${collection}`);
}

/** Whether this phone holds a session of this kind that has not synced. */
export function hasQueuedCreate(
  uid: string | null | undefined,
  collection: SessionCollection
): boolean {
  return !!uid && pending(uid, collection).some((entry) => !entry.merge);
}

/** Whether any write to this kind of session is still waiting to sync. */
export function hasQueuedWrites(
  uid: string | null | undefined,
  collection: SessionCollection
): boolean {
  return !!uid && pending(uid, collection).length > 0;
}

/**
 * One read of a window, for readers that do not stay subscribed. Sessions
 * saved on this phone and not yet synced are included when `uid` is the
 * signed-in account (another account has none queued here).
 */
export async function fetchSaved<T, W>(
  source: SavedSessionSource<T, W>,
  uid: string,
  window: W
): Promise<T[]> {
  const snap = await getDocs(source.query(uid, window));
  const loaded = source
    .parseDocs(snap.docs)
    .filter((item) => source.inWindow(item, window));
  return source.withQueued(uid, loaded, window);
}
