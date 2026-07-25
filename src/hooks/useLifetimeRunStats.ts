import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { isVolumeEligible } from "@/lib/runStatsEligibility";

export interface LifetimeRunStats {
  runCount: number;
  totalDistanceM: number;
}

/**
 * Single-shot Firestore read of every run doc, summed for the
 * "Lifetime totals" footer on the History page. Separate from
 * useRunningStats because that hook applies a `where('completedAt', '>=')`
 * filter — fine for analytics windows, but it would silently exclude
 * pre-window runs from a "lifetime" total.
 *
 * `enabled` (default true) gates the read: callers that only need the count
 * inside a narrow condition (e.g. the Home cold-start activation window)
 * pass `enabled: false` once that condition lapses, so an established user
 * with hundreds of runs never pays for a full-collection read on a surface
 * that no longer consumes it.
 */
export function useLifetimeRunStats(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { user } = useAuth();
  const [stats, setStats] = useState<LifetimeRunStats>({
    runCount: 0,
    totalDistanceM: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", user.uid, "runs"));
        if (cancelled) return;
        let total = 0;
        let count = 0;
        snap.docs.forEach((d) => {
          const data = d.data() as { distance?: number; isInvalid?: boolean };
          if (!isVolumeEligible(data)) return;
          total += data.distance ?? 0;
          count += 1;
        });
        setStats({ runCount: count, totalDistanceM: total });
      } catch (err) {
        logger.error("useLifetimeRunStats error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, enabled]);

  return { ...stats, loading };
}
