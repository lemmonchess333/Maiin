import { useCallback, useEffect, useState } from "react";
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
 */
export function useSavedRoutes() {
  const { profile } = useAuth();
  const uid = profile?.uid;
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid) {
      setRoutes([]);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      setRoutes(await listSavedRoutes(uid));
    } catch (e) {
      logger.warn("[useSavedRoutes] list failed", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      setRoutes((rs) => rs.filter((r) => r.id !== id));
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
