/**
 * useLastRunType — the RunTilePicker's "Repeat <type>" memory (RUN-04, the
 * RunFast1 lock's explicitly-deferred last-used-type follow-up, un-deferred
 * with the retention-audit arc).
 *
 * Fetches the user's most recent runs once per mount (same cheap limit-5
 * newest-first scan RunSetupModal uses for its last-run card) and resolves
 * the repeat offer via the pure `resolveRepeatType` rule: the two most
 * recent volume-eligible runs must share the same DIRECT-launch type.
 * Failure is silent — the picker just renders without the repeat row.
 */
import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import { resolveRepeatType } from "@/components/run/runConfigDefaults";
import type { ActivityType } from "@/types/run";

export function useLastRunType(): ActivityType | null {
  const { user } = useAuth();
  const [repeatType, setRepeatType] = useState<ActivityType | null>(null);

  useEffect(() => {
    if (!user) {
      setRepeatType(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "runs"),
            orderBy("completedAt", "desc"),
            limit(5)
          )
        );
        if (cancelled) return;
        setRepeatType(resolveRepeatType(snap.docs.map((d) => d.data())));
      } catch {
        // Silent — the tile picker renders without the repeat row.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return repeatType;
}
