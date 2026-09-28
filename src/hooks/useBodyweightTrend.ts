import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs, type BodyweightLog } from "@/lib/api";
import { calculateEMA } from "@/utils/weightTrend";

export type WeightTrendPoint = { date: string; actual: number; trend: number };

/**
 * Weigh-ins as the smoothed trend, oldest first: invalid weights dropped,
 * one reading per day (the last), then the EMA. The weight chart and the
 * Analytics overview's Body weight row both read this, so the figure the
 * row quotes is the one the chart draws.
 */
export function weightTrendPoints(
  entries: readonly BodyweightLog[]
): WeightTrendPoint[] {
  const byDate = new Map<string, { date: string; weight: number }>();
  for (const e of entries) {
    if (!(e.weight > 0) || !Number.isFinite(e.weight)) continue;
    byDate.set(e.date, { date: e.date, weight: e.weight });
  }
  return calculateEMA([...byDate.values()]);
}

/** The signed-in user's weigh-ins and their trend. */
export function useBodyweightTrend() {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [loaded, setLoaded] = useState<{
    uid: string;
    entries: BodyweightLog[];
  } | null>(null);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    fetchBodyweightLogs(uid).then((entries) => {
      if (!cancelled) setLoaded({ uid, entries });
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  /* Another account's weigh-ins are never shown while this one's load:
     the result is keyed by the uid it was read for. */
  const entries = useMemo(
    () => (loaded && loaded.uid === uid ? loaded.entries : []),
    [loaded, uid]
  );
  const points = useMemo(() => weightTrendPoints(entries), [entries]);
  return { entries, points, loading: !!uid && loaded?.uid !== uid };
}
