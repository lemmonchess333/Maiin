import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buildPRMap, type PRMap } from "@/lib/prTracking";

/* Module-level cache — keyed by uid.
 *
 * The compare sheet on ActivityCard is the only consumer right now.
 * Multiple compare opens (different activities, different exercises)
 * share one fetch per session. Cache busts naturally on full reload
 * or signout. Slight staleness when the user logs a new PR mid-
 * session is acceptable for the compare UX — the next session will
 * pick it up.
 *
 * Listener-based caching (subscribing to workouts via onSnapshot)
 * was rejected: it would add a live Firestore subscription for every
 * user who ever opens compare, even after they close the sheet, and
 * the feed renders many cards so a per-card listener would be
 * particularly bad. */
const cache = new Map<string, PRMap>();
const inflight = new Map<string, Promise<PRMap>>();

const FETCH_LIMIT = 200; // covers ~3 months of heavy logging

async function fetchPRMap(uid: string): Promise<PRMap> {
  const cached = cache.get(uid);
  if (cached) return cached;
  const existing = inflight.get(uid);
  if (existing) return existing;

  const promise = (async () => {
    const snap = await getDocs(
      query(
        collection(db, "users", uid, "workouts"),
        orderBy("date", "desc"),
        limit(FETCH_LIMIT),
      ),
    );
    const workouts = snap.docs
      .map((d) => d.data() as { exercises: { exerciseName: string; sets: { weightKg: number; reps: number }[] }[]; date: string })
      .filter((w) => Array.isArray(w.exercises) && typeof w.date === "string");
    const map = buildPRMap(workouts);
    cache.set(uid, map);
    inflight.delete(uid);
    return map;
  })();
  inflight.set(uid, promise);
  return promise;
}

export interface UseUserPRMap {
  prMap: PRMap | null;
  loading: boolean;
  error: boolean;
}

/** Lazy fetch + module-level cache for the signed-in user's PR map.
 *  Pass a falsy `uid` to skip; only fires the fetch once enabled. */
export function useUserPRMap(uid: string | null | undefined): UseUserPRMap {
  const [prMap, setPRMap] = useState<PRMap | null>(uid ? cache.get(uid) ?? null : null);
  const [loading, setLoading] = useState(!!uid && !cache.has(uid));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!uid) {
      setPRMap(null);
      setLoading(false);
      return;
    }
    const cached = cache.get(uid);
    if (cached) {
      setPRMap(cached);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPRMap(uid)
      .then((map) => {
        if (cancelled) return;
        setPRMap(map);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return { prMap, loading, error };
}

/** Test-only escape hatch — clears the module-level cache. Not used
 *  in production code; exposed so unit tests can run with isolated
 *  state and so a future "refresh PRs" button has a hook to drop. */
export function _clearPRMapCache(): void {
  cache.clear();
  inflight.clear();
}
