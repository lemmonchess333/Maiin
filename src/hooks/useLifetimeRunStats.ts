import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";

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
 */
export function useLifetimeRunStats() {
  const { user } = useAuth();
  const [stats, setStats] = useState<LifetimeRunStats>({
    runCount: 0,
    totalDistanceM: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
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
          const data = d.data() as { distance?: number };
          const m = typeof data.distance === "number" ? data.distance : 0;
          if (m > 0) {
            total += m;
            count += 1;
          }
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
  }, [user]);

  return { ...stats, loading };
}
