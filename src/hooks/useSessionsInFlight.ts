import { useCallback, useEffect, useState } from "react";
import { listWorkoutDrafts, type WorkoutDraft } from "@/hooks/useWorkoutDraft";
import {
  readStoredRunSummary,
  type StoredRunSummary,
} from "@/lib/runResumeStorage";

export interface SessionsInFlight {
  /** The workout drafts on this phone, newest first. Which one can be
   *  resumed is `resumableLift`'s question. */
  drafts: WorkoutDraft[];
  /** The run under way, or null. */
  run: StoredRunSummary | null;
}

interface Snapshot extends SessionsInFlight {
  uid: string | null;
}

const NONE: SessionsInFlight = { drafts: [], run: null };

function read(uid: string | null): Snapshot {
  if (!uid) return { uid, ...NONE };
  return {
    uid,
    drafts: listWorkoutDrafts(uid),
    run: readStoredRunSummary(uid),
  };
}

/**
 * The sessions under way on this phone for the signed-in account: the
 * workout drafts and the stored run. Both live in local storage, outside
 * React, so they are read when the screen opens, when the account
 * changes, when the app comes back to the foreground, and on `refresh`
 * (Train calls it as a workout closes over it).
 */
export function useSessionsInFlight(
  uid: string | null | undefined
): SessionsInFlight & { refresh: () => void } {
  const owner = uid ?? null;
  const [snapshot, setSnapshot] = useState(() => read(owner));
  // A new account reads its own, in the same render: another account's
  // session is never drawn for it.
  let current = snapshot;
  if (snapshot.uid !== owner) {
    current = read(owner);
    setSnapshot(current);
  }

  const refresh = useCallback(() => setSnapshot(read(owner)), [owner]);
  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [refresh]);

  return { drafts: current.drafts, run: current.run, refresh };
}
