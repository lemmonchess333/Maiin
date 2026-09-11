/**
 * Lifetime meal totals — a single-shot read of every meal doc.
 *
 * The Lifetime tile counted `useMeals`, which subscribes to the newest 400
 * meal docs. So "meals logged" and "days logged" both stopped at 400 and at
 * however many distinct days those covered, and a long-standing user's
 * lifetime figures quietly stopped moving.
 *
 * Same shape and same reasoning as `useLifetimeRunStats`, whose docstring
 * makes the point for runs: a windowed query is fine for an analytics
 * range, but it silently excludes pre-window records from a total that
 * claims to be lifetime. Kept as its own hook rather than folded into
 * `useMeals` because the cost profile is opposite — one whole-collection
 * read on demand, versus a live capped subscription.
 *
 * Soft-deleted meals do not count: the tile says what you logged and kept.
 */
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useUid } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { activeMealDocs } from "@/lib/mealTotals";

export interface LifetimeMealStats {
  mealCount: number;
  /** Distinct local dates carrying at least one kept meal. */
  daysLogged: number;
}

const EMPTY: LifetimeMealStats = { mealCount: 0, daysLogged: 0 };

export function useLifetimeMealStats(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const uid = useUid();
  const [stats, setStats] = useState<LifetimeMealStats>(EMPTY);
  const [statsUid, setStatsUid] = useState<string | null>(null);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  /* A read that FAILED is not a user who has never logged. `useLifetimeRunStats`
     carries this for the same reason: there, zero made History hide the whole
     Running section with the only evidence in a console the user never sees. */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "users", uid, "meals"));
        if (cancelled) return;
        setFailed(false);
        const kept = activeMealDocs(
          snap.docs.map(
            (d) => d.data() as { date?: unknown; deletedAt?: unknown }
          )
        );
        setStats({
          mealCount: kept.length,
          daysLogged: new Set(
            kept
              .map((m) => m.date)
              .filter((d): d is string => typeof d === "string")
          ).size,
        });
        setStatsUid(uid);
      } catch (err) {
        logger.error("useLifetimeMealStats error:", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoadedUid(uid);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, enabled]);

  // An account change must not show the previous account's totals for even
  // one frame — same guard as the run hook.
  const visible = uid && enabled && statsUid === uid ? stats : EMPTY;
  return {
    ...visible,
    loading: Boolean(uid && enabled && loadedUid !== uid),
    failed: Boolean(uid && enabled && loadedUid === uid && failed),
  };
}
