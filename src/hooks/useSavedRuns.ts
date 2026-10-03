import { useUid } from "@/lib/auth";
import { SAVED_RUNS, type RunWindow, type SavedRun } from "@/lib/savedRuns";
import { useSavedSessions } from "./useSavedSessions";

export interface SavedRunsResult {
  /** The window's runs, newest first, with this phone's unsynced runs. */
  runs: SavedRun[];
  /** True until the current query answers. A run saved offline shows at
   *  once, so it does not wait for the server. */
  loading: boolean;
  /** The current query has answered. A run waiting to sync is not an
   *  answer: a reader that saves what it derives waits for this. */
  answered: boolean;
  /** The last read threw and there is nothing to show. */
  failed: boolean;
  /** Server-confirmed and complete: coaching may treat the window as the
   *  whole evidence. */
  evidenceReady: boolean;
  /** Restarts the live query (pull-to-refresh). */
  refresh: () => void;
}

/**
 * The signed-in account's saved runs for a window, live: the run source
 * (`src/lib/savedRuns.ts`) on the shared session engine
 * (`useSavedSessions`). Pass `null` to read nothing.
 */
export function useSavedRuns(window: RunWindow | null): SavedRunsResult {
  const { items, ...rest } = useSavedSessions(SAVED_RUNS, useUid(), window);
  return { runs: items, ...rest };
}
