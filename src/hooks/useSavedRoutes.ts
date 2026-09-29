import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  listSavedRoutes,
  saveRoute,
  deleteSavedRoute,
  type SavedRoute,
  type SaveRouteInput,
} from "@/lib/savedRoutes";

/**
 * Owner's saved routes (users/{uid}/savedRoutes), with save/delete that keep
 * the in-memory list fresh. Loads on mount / uid change. Errors are logged and
 * surfaced via the returned `error` rather than thrown, so the route picker can
 * degrade to "no saved routes" instead of crashing the run-setup screen.
 *
 * The list is stored with the uid it was read for and only returned while
 * that uid is signed in: after a sign-out or an account switch the picker
 * shows no routes (and is loading) until the new account's list lands, and
 * a list that arrives for an account no longer signed in is dropped.
 */
interface RouteList {
  uid: string | null;
  routes: SavedRoute[];
  error: boolean;
  /** A reload of this account's list is in flight (save, delete, refresh). */
  reloading: boolean;
}

const NO_ROUTES: SavedRoute[] = [];

export function useSavedRoutes() {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const [list, setList] = useState<RouteList>({
    uid: null,
    routes: NO_ROUTES,
    error: false,
    reloading: false,
  });
  // The account a list may still be answered for, moved by the effect
  // below. A read that resolves for any other uid is stale and dropped.
  const currentUidRef = useRef<string | null>(null);

  const ownList = uid !== null && list.uid === uid;
  const routes = ownList ? list.routes : NO_ROUTES;
  const error = ownList && list.error;
  const loading = uid !== null && (!ownList || list.reloading);

  /** Read `forUid`'s list; the answer commits only while it is still the
   *  signed-in account. */
  const readList = useCallback(
    (forUid: string): Promise<void> =>
      listSavedRoutes(forUid).then(
        (next) => {
          if (currentUidRef.current !== forUid) return;
          setList({
            uid: forUid,
            routes: next,
            error: false,
            reloading: false,
          });
        },
        (e) => {
          logger.warn("[useSavedRoutes] list failed", e);
          if (currentUidRef.current !== forUid) return;
          // A failed reload keeps this account's routes; never another's.
          setList((current) => ({
            uid: forUid,
            routes: current.uid === forUid ? current.routes : NO_ROUTES,
            error: true,
            reloading: false,
          }));
        }
      ),
    []
  );

  useEffect(() => {
    currentUidRef.current = uid;
    if (uid) void readList(uid);
  }, [uid, readList]);

  const refresh = useCallback(async () => {
    // A stale closure (a save still finishing for the previous account)
    // has nothing to reload.
    if (!uid || currentUidRef.current !== uid) return;
    setList((current) =>
      current.uid === uid
        ? { ...current, error: false, reloading: true }
        : current
    );
    await readList(uid);
  }, [uid, readList]);

  const save = useCallback(
    async (input: SaveRouteInput): Promise<boolean> => {
      if (!uid) return false;
      try {
        await saveRoute(uid, input);
        await refresh();
        return true;
      } catch (e) {
        logger.warn("[useSavedRoutes] save failed", e);
        return false;
      }
    },
    [uid, refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!uid) return;
      // Optimistic — drop locally, then delete server-side.
      setList((current) =>
        current.uid === uid
          ? { ...current, routes: current.routes.filter((r) => r.id !== id) }
          : current
      );
      try {
        await deleteSavedRoute(uid, id);
      } catch (e) {
        logger.warn("[useSavedRoutes] delete failed", e);
        refresh();
      }
    },
    [uid, refresh]
  );

  return { routes, loading, error, save, remove, refresh };
}
