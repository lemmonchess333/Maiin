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
        limit(FETCH_LIMIT)
      )
    );
    const workouts = snap.docs
      .map(
        (d) =>
          d.data() as {
            exercises: {
              exerciseName: string;
              sets: { weightKg: number; reps: number }[];
            }[];
            date: string;
          }
      )
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
 *  Pass a falsy `uid` to skip; only fires the fetch once enabled.
 *
 *  All non-cache state is derived during render rather than synced
 *  via setState-in-effect — the cache hit case, the no-uid case, and
 *  the loading flag are all pure functions of uid + cache. setState
 *  only fires inside async .then / .catch callbacks (which the
 *  react-hooks/set-state-in-effect rule does not flag). The fetched/
 *  error pieces of state carry the uid they were produced for, so a
 *  uid change between mount and resolve doesn't show stale data for
 *  the new uid. */
export function useUserPRMap(uid: string | null | undefined): UseUserPRMap {
  const cached = uid ? (cache.get(uid) ?? null) : null;
  const [fetched, setFetched] = useState<{ uid: string; map: PRMap } | null>(
    null
  );
  const [errored, setErrored] = useState<{ uid: string } | null>(null);

  useEffect(() => {
    if (!uid || cache.has(uid)) return;
    let cancelled = false;
    void fetchPRMap(uid)
      .then((map) => {
        if (cancelled) return;
        setFetched({ uid, map });
        setErrored(null);
      })
      .catch(() => {
        if (cancelled) return;
        setErrored({ uid });
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Derived. cached covers the "already in module cache" path; fetched
  // covers an in-this-render-cycle resolution. The uid match guards
  // against showing the previous uid's data after a signin swap.
  const prMap = cached ?? (fetched && fetched.uid === uid ? fetched.map : null);
  const error = !!errored && errored.uid === uid;
  const loading = !!uid && !prMap && !error;
  return { prMap, loading, error };
}
