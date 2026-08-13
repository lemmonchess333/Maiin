import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { sumLifetimeRunTotals } from "@/lib/runStatsEligibility";

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
  const uid = useUid();
  const [stats, setStats] = useState<LifetimeRunStats>({
    runCount: 0,
    totalDistanceM: 0,
  });
  const [loading, setLoading] = useState(true);
  /**
   * A read that FAILED is not a user with no runs, and until this existed
   * the two were the same observable state: the catch below logged and
   * left `runCount` at 0, which is the exact value that makes History's
   * Tier-1 auto-hide drop the whole Running section. The user saw their
   * running analytics silently disappear, with the only evidence in a
   * console the app doesn't show them.
   */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid || !enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", uid, "runs"));
        if (cancelled) return;
        setFailed(false);
        setStats(sumLifetimeRunTotals(snap.docs.map((d) => d.data())));
      } catch (err) {
        logger.error("useLifetimeRunStats error:", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, enabled]);

  return { ...stats, loading, failed };
}
