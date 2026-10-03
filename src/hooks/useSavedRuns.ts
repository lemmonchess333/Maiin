import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { onSnapshot } from "firebase/firestore";
import { logger } from "@/lib/logger";
import { subscribeQueuedWrites, queuedWritesVersion } from "@/lib/offlineQueue";
import { useUid } from "@/lib/auth";
import {
  hasQueuedRunCreate,
  hasQueuedRunWrites,
  inRunWindow,
  parseSavedRunDocs,
  savedRunsQuery,
  withQueuedRuns,
  type RunWindow,
  type SavedRun,
} from "@/lib/savedRuns";

/**
 * What the live query last answered: the rows, whose they are, which query
 * answered, and how. Everything the hook reports is read off this during
 * render, so nothing has to be reset in an effect before a new query starts.
 */
interface LoadedRuns {
  runs: SavedRun[];
  uid: string | null;
  queryKey: string | null;
  /** A failed read used to be indistinguishable from an empty one. */
  failed: boolean;
  /** Server-confirmed, with no pending local writes. */
  authoritative: boolean;
}

const NOTHING_LOADED: LoadedRuns = {
  runs: [],
  uid: null,
  queryKey: null,
  failed: false,
  authoritative: false,
};

export function runWindowKey(window: RunWindow | null): string {
  if (!window) return "none";
  if ("latest" in window) return `latest:${window.latest}`;
  if ("all" in window) return "all";
  return `days:${window.since}:${window.until ?? ""}:${window.cap ?? ""}`;
}

export interface SavedRunsResult {
  /** The window's runs, newest first, with this phone's unsynced runs. */
  runs: SavedRun[];
  /** True until the current query (account, window, refresh) answers. A
   *  run saved offline shows at once, so it does not wait for the server. */
  loading: boolean;
  /** The current query has answered, from the server or this phone's
   *  cache. Unlike `loading`, a run waiting to sync is not an answer: a
   *  reader that saves what it derives (the streak) waits for this, or it
   *  would save a figure computed from that one run alone. */
  answered: boolean;
  /** The last read threw and there is nothing to show: "we couldn't load
   *  your runs", which is otherwise the same `runs: []` as "no runs". */
  failed: boolean;
  /** Server-confirmed and complete: coaching may treat the window as the
   *  whole evidence, which a cached, partial or failed read is not. */
  evidenceReady: boolean;
  /** Restarts the live query (pull-to-refresh). Same-account rows stay
   *  visible while it answers. */
  refresh: () => void;
}

/**
 * The signed-in account's saved runs for a window, live. One subscription
 * shape for every reader that stays subscribed: one query, one parse, one
 * day rule, and this phone's unsynced runs laid over the server's.
 *
 * Pass `null` to read nothing (signed out, or a surface that is off).
 */
export function useSavedRuns(window: RunWindow | null): SavedRunsResult {
  const uid = useUid();
  const queueVersion = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const [loaded, setLoaded] = useState<LoadedRuns>(NOTHING_LOADED);
  const [refreshTick, setRefreshTick] = useState(0);
  const windowKey = runWindowKey(window);
  const queryKey = `${uid ?? ""}:${windowKey}:${refreshTick}`;

  /* An answer counts only for the account it was read for. After a
     sign-out (a shared-device sign-out → sign-in, or a transient null-user
     window) or a switch to account B, the rows, `failed` and
     `authoritative` belong to the previous account, so they read as empty
     / false from the render where the uid changes — before any effect
     runs — until B's own query answers (the uid-scoping class hardened in
     PR #820). A same-uid refresh, day rollover or window change keeps the
     current rows visible meanwhile. */
  const active = !!uid && window !== null;
  const ownAnswer = active && loaded.uid === uid;
  const answered = ownAnswer && loaded.queryKey === queryKey;
  const failed = ownAnswer && loaded.failed;
  const authoritative = ownAnswer && loaded.authoritative;

  useEffect(() => {
    if (!uid || window === null) return;
    let cancelled = false;
    const unsubscribe = onSnapshot(
      savedRunsQuery(uid, window),
      { includeMetadataChanges: true },
      (snap) => {
        if (cancelled) return;
        setLoaded({
          runs: parseSavedRunDocs(snap.docs).filter((run) =>
            inRunWindow(run, window)
          ),
          uid,
          queryKey,
          failed: false,
          authoritative:
            !snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites,
        });
      },
      (error) => {
        // A failed read must settle to a retryable state, not load forever.
        // Settling to `runs: []` alone made failure look like "no runs", and
        // History's auto-hide read that as "this user doesn't run" and
        // removed the section; `failed` tells the two apart. Same-account
        // rows already shown stay; another account's never do.
        if (cancelled) return;
        setLoaded((current) => ({
          runs: current.uid === uid ? current.runs : [],
          uid,
          queryKey,
          failed: true,
          authoritative: false,
        }));
        logger.error("[useSavedRuns] Failed to load runs", error);
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `window` is keyed by `windowKey`; its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, windowKey, refreshTick, queryKey]);

  const runs = useMemo(() => {
    void queueVersion;
    if (!active || window === null) return [];
    return withQueuedRuns(uid, ownAnswer ? loaded.runs : [], window);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uid, ownAnswer, loaded.runs, windowKey, queueVersion]);

  return {
    runs,
    loading: active && !answered && !hasQueuedRunCreate(uid),
    answered,
    failed: failed && runs.length === 0,
    evidenceReady:
      answered && !failed && authoritative && !hasQueuedRunWrites(uid),
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
