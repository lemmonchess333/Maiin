import { useCallback, useEffect, useState } from "react";
import { listWorkoutDrafts, type WorkoutDraft } from "@/hooks/useWorkoutDraft";
import {
  readStoredRunSummary,
  type StoredRunSummary,
} from "@/lib/runResumeStorage";
import {
  draftRoutineId,
  type RoutineLayout,
} from "@/features/program/routineSession";
import type { RoutinesInFlight } from "@/lib/sessionsInFlight";
import { watchSavedRoutine } from "@/lib/savedRoutines";

export interface SessionsInFlight {
  /** The workout drafts on this phone, newest first. Which one can be
   *  resumed is `resumableWorkout`'s question. */
  drafts: WorkoutDraft[];
  /** The run under way, or null. */
  run: StoredRunSummary | null;
  /** The saved routines the drafts were kept from, as they are now, by
   *  id. A routine deleted since, or not read yet, is absent, so its
   *  draft is not offered. */
  routines: RoutinesInFlight;
}

interface Snapshot {
  uid: string | null;
  drafts: WorkoutDraft[];
  run: StoredRunSummary | null;
}

const NO_ROUTINES: RoutinesInFlight = new Map();

function read(uid: string | null): Snapshot {
  if (!uid) return { uid, drafts: [], run: null };
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
 *
 * A routine's draft is offered only while its routine still builds the
 * same session, which only the routine can say, so the routines the
 * drafts name are followed while the screen is open: one deleted or
 * changed on any phone stops being offered at once. Only those are read,
 * never the whole list, and none at all while no routine is under way.
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

  const routines = useRoutinesOf(owner, current.drafts);
  return { drafts: current.drafts, run: current.run, routines, refresh };
}

/** The routines the drafts were kept from, as their documents are now. */
function useRoutinesOf(
  uid: string | null,
  drafts: readonly WorkoutDraft[]
): RoutinesInFlight {
  // A routine's id never holds a "/", so the ids join into one key that
  // only changes when the routines named do.
  const key = [
    ...new Set(
      drafts.map(draftRoutineId).filter((id): id is string => id !== null)
    ),
  ]
    .sort()
    .join("/");
  const [seen, setSeen] = useState<{
    uid: string | null;
    key: string;
    routines: RoutinesInFlight;
  }>({ uid: null, key: "", routines: NO_ROUTINES });

  useEffect(() => {
    if (!uid || !key) return;
    const routines = new Map<string, RoutineLayout>();
    const stops = key.split("/").map((routineId) =>
      watchSavedRoutine(uid, routineId, (routine) => {
        if (routine) routines.set(routineId, routine);
        else routines.delete(routineId);
        setSeen({ uid, key, routines: new Map(routines) });
      })
    );
    return () => stops.forEach((stop) => stop());
  }, [uid, key]);

  // What another account's or another set of drafts' listeners saw is
  // never handed on.
  return seen.uid === uid && seen.key === key ? seen.routines : NO_ROUTINES;
}
