import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { onSnapshot } from "firebase/firestore";
import { logger } from "@/lib/logger";
import { subscribeQueuedWrites, queuedWritesVersion } from "@/lib/offlineQueue";
import {
  hasQueuedCreate,
  hasQueuedWrites,
  type SavedSessionSource,
} from "@/lib/savedSessions";

/**
 * What the live query last answered: the rows, whose they are, which query
 * answered, and how. Everything the hook reports is read off this during
 * render, so nothing has to be reset in an effect before a new query starts.
 */
interface Loaded<T> {
  items: T[];
  uid: string | null;
  queryKey: string | null;
  /** A failed read used to be indistinguishable from an empty one. */
  failed: boolean;
  /** Server-confirmed, with no pending local writes. */
  authoritative: boolean;
}

const NOTHING_LOADED: Loaded<never> = {
  items: [],
  uid: null,
  queryKey: null,
  failed: false,
  authoritative: false,
};

export interface SavedSessionsResult<T> {
  /** The window's sessions, newest first, with this phone's unsynced ones. */
  items: T[];
  /** True until the current query (account, window, refresh) answers. A
   *  session saved offline shows at once, so it does not wait for the
   *  server. */
  loading: boolean;
  /** The current query has answered, from the server or this phone's
   *  cache. Unlike `loading`, a session waiting to sync is not an answer: a
   *  reader that saves what it derives (the streak) waits for this, or it
   *  would save a figure computed from that one session alone. */
  answered: boolean;
  /** The last read threw and there is nothing to show: "we couldn't load
   *  these", which is otherwise the same empty list as "there are none". */
  failed: boolean;
  /** Server-confirmed and complete: coaching may treat the window as the
   *  whole evidence, which a cached, partial or failed read is not. */
  evidenceReady: boolean;
  /** Restarts the live query (pull-to-refresh). Same-account rows stay
   *  visible while it answers. */
  refresh: () => void;
}

export interface SavedSessionsOptions<T> {
  /** Called with each answer's own rows (the server's or the cache's, not
   *  this phone's unsynced ones) and the account they were read for, from
   *  the snapshot callback. */
  onLoaded?: (loaded: T[], uid: string) => void;
}

/**
 * One account's saved sessions of one kind for a window, live. Every reader
 * that stays subscribed runs through here, so a runs reader and a workouts
 * reader agree on whose rows they show, when a list counts as loaded and
 * how a session saved offline joins it.
 *
 * `uid` is the signed-in account; pass `null` for the window to read
 * nothing (signed out, or a surface that is off).
 */
export function useSavedSessions<T, W>(
  source: SavedSessionSource<T, W>,
  uid: string | null | undefined,
  window: W | null,
  options: SavedSessionsOptions<T> = {}
): SavedSessionsResult<T> {
  const account = uid ?? null;
  const queueVersion = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const [loaded, setLoaded] = useState<Loaded<T>>(NOTHING_LOADED);
  const [refreshTick, setRefreshTick] = useState(0);
  const windowKey = window === null ? "none" : source.windowKey(window);
  const queryKey = `${account ?? ""}:${windowKey}:${refreshTick}`;
  // The latest callback, read inside the listener without restarting it.
  const onLoadedRef = useRef(options.onLoaded);
  useEffect(() => {
    onLoadedRef.current = options.onLoaded;
  });

  /* An answer counts only for the account it was read for. After a
     sign-out (a shared-device sign-out → sign-in, or a transient null-user
     window) or a switch to account B, the rows, `failed` and
     `authoritative` belong to the previous account, so they read as empty
     / false from the render where the uid changes — before any effect
     runs — until B's own query answers (the uid-scoping class hardened in
     PR #820). A same-uid refresh, day rollover or window change keeps the
     current rows visible meanwhile. */
  const active = account !== null && window !== null;
  const ownAnswer = active && loaded.uid === account;
  const answered = ownAnswer && loaded.queryKey === queryKey;
  const failed = ownAnswer && loaded.failed;
  const authoritative = ownAnswer && loaded.authoritative;

  useEffect(() => {
    if (account === null || window === null) return;
    let cancelled = false;
    const unsubscribe = onSnapshot(
      source.query(account, window),
      { includeMetadataChanges: true },
      (snap) => {
        if (cancelled) return;
        const items = source
          .parseDocs(snap.docs)
          .filter((item) => source.inWindow(item, window));
        setLoaded({
          items,
          uid: account,
          queryKey,
          failed: false,
          authoritative:
            !snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites,
        });
        onLoadedRef.current?.(items, account);
      },
      (error) => {
        // A failed read must settle to a retryable state, not load forever.
        // Settling to an empty list alone made failure look like "none", and
        // History's auto-hide read that as "this user doesn't run" and
        // removed the section; `failed` tells the two apart. Same-account
        // rows already shown stay; another account's never do.
        if (cancelled) return;
        setLoaded((current) => ({
          items: current.uid === account ? current.items : [],
          uid: account,
          queryKey,
          failed: true,
          authoritative: false,
        }));
        logger.error(
          `[useSavedSessions] Failed to load ${source.collection}`,
          error
        );
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // `window` is keyed by `windowKey`; its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, account, windowKey, refreshTick, queryKey]);

  const items = useMemo(() => {
    void queueVersion;
    if (!active || window === null) return [];
    return source.withQueued(account, ownAnswer ? loaded.items : [], window);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    source,
    active,
    account,
    ownAnswer,
    loaded.items,
    windowKey,
    queueVersion,
  ]);

  return {
    items,
    loading:
      active && !answered && !hasQueuedCreate(account, source.collection),
    answered,
    failed: failed && items.length === 0,
    evidenceReady:
      answered &&
      !failed &&
      authoritative &&
      !hasQueuedWrites(account, source.collection),
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
