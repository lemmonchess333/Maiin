import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot } from "firebase/firestore";
import { setDocGuarded } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useUid } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { raceSpaceDefs } from "./spaceDefs";

const raceIds = new Set(raceSpaceDefs().map((race) => race.id));
const EMPTY_IDS: ReadonlySet<string> = new Set();

function parseSavedIds(value: unknown): ReadonlySet<string> {
  return new Set(
    Array.isArray(value)
      ? value.filter(
          (id): id is string => typeof id === "string" && raceIds.has(id)
        )
      : []
  );
}

/** One owner-only settings doc. Atomic array operations preserve saves made on
 * another device; race identities survive date updates. Never writes membership
 * or training goals. The existing settings rules and deletion cover this doc. */
export function useSavedRaces() {
  const uid = useUid();
  const { isOnline } = useOnlineStatus();
  const [attempt, setAttempt] = useState(0);
  const session = useMemo(() => ({ uid, attempt }), [uid, attempt]);
  const [state, setState] = useState<{
    session: typeof session;
    ids: ReadonlySet<string>;
    error: boolean;
    ready: boolean;
  }>();
  const [pending, setPending] = useState<{
    session: typeof session;
    ids: ReadonlySet<string>;
  }>();
  const activeSession = useRef<{
    session: typeof session;
    pending: Set<string>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const active = { session, pending: new Set<string>() };
    activeSession.current = active;
    if (!uid)
      return () => {
        activeSession.current = null;
      };
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "settings", "savedRaces"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!cancelled)
          setState({
            session,
            ids: parseSavedIds(snapshot.data()?.raceIds),
            error: false,
            ready: snapshot.exists() || !snapshot.metadata.fromCache,
          });
      },
      () => {
        if (!cancelled)
          setState((previous) => ({
            session,
            ids: previous?.session === session ? previous.ids : EMPTY_IDS,
            error: true,
            ready: false,
          }));
      }
    );
    return () => {
      cancelled = true;
      if (activeSession.current === active) activeSession.current = null;
      unsubscribe();
    };
  }, [uid, session]);

  const current = state?.session === session ? state : undefined;
  const ready = !!uid && current?.ready === true;
  const ids = current?.ids ?? EMPTY_IDS;
  const pendingIds = pending?.session === session ? pending.ids : EMPTY_IDS;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  async function toggle(id: string) {
    const active = activeSession.current;
    if (
      !active ||
      active.session !== session ||
      !uid ||
      !ready ||
      !isOnline ||
      !navigator.onLine ||
      !raceIds.has(id) ||
      active.pending.has(id)
    )
      return;
    const removing = ids.has(id);
    active.pending.add(id);
    setPending({ session, ids: new Set(active.pending) });
    try {
      await setDocGuarded(
        doc(db, "users", uid, "settings", "savedRaces"),
        { raceIds: removing ? arrayRemove(id) : arrayUnion(id) },
        { merge: true }
      );
      if (activeSession.current === active)
        toast.success(removing ? "Race removed from saved" : "Race saved");
    } catch {
      if (activeSession.current === active)
        toast.error(
          removing
            ? "Couldn't remove this race. Try again."
            : "Couldn't save this race. Try again."
        );
    } finally {
      active.pending.delete(id);
      if (activeSession.current === active)
        setPending({ session, ids: new Set(active.pending) });
    }
  }

  return {
    ids,
    ready,
    error: current?.error === true,
    isOnline,
    pendingIds,
    retry,
    toggle,
  };
}
