import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";

function sortAsc(a: PerformanceWeekDoc, b: PerformanceWeekDoc) {
  return a.weekKey.localeCompare(b.weekKey);
}

export function usePerformanceWeeks(maxWeeks: number = 12) {
  const { user } = useAuth();
  const [weeks, setWeeks] = useState<PerformanceWeekDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      const reset = () => { setWeeks([]); setLoading(false); };
      reset();
      return;
    }

    const ref = collection(db, "users", user.uid, "performance");
    const q = query(ref, orderBy("weekKey", "desc"), limit(maxWeeks));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => normalisePerformanceDoc(d.id, d.data() as Record<string, unknown>))
          .sort(sortAsc);

        setWeeks(docs);
        setLoading(false);
      },
      () => {
        setWeeks([]);
        setLoading(false);
      }
    );

    return unsub;
  }, [user, maxWeeks]);

  const currentWeek = useMemo(() => (weeks.length ? weeks[weeks.length - 1] : null), [weeks]);

  return { weeks, currentWeek, loading };
}

/**
 * Reshape a raw performance doc to the PerformanceWeekDoc contract.
 *
 * The Cloud Function (functions/performanceEngine.js) writes the
 * sub-scores as TOP-LEVEL fields (`liftLoadScore`, `runLoadScore`,
 * `recoveryScore`, `adherenceScore`) but the consumer-facing type
 * declares them nested under `breakdown`. Pre-fix the hook did a
 * bare `as PerformanceWeekDoc` cast, which left `breakdown`
 * undefined on every real doc — every consumer (PerformanceTab,
 * PerformanceCard) crashed reading it.
 *
 * Fix in the hook so the boundary between Firestore shape and the
 * application's typed shape lives in one place. Future CF writes
 * that include a nested `breakdown` directly are passed through
 * unchanged via the nullish-coalesce.
 *
 * Defensive `safeNum` falls back to 0 on missing / non-numeric
 * fields — keeps a partial early-rollup doc from crashing the
 * render. Score-band consumers (performanceInsights.ts) handle 0
 * gracefully (lands in the "low" band; insight templates frame
 * that as baseline, not failure).
 */
function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function normalisePerformanceDoc(
  docId: string,
  data: Record<string, unknown>,
): PerformanceWeekDoc {
  const weekKey: string = typeof data.weekKey === "string" ? data.weekKey : docId;
  const breakdown =
    (data.breakdown as PerformanceWeekDoc["breakdown"] | undefined) ?? {
      liftLoadScore: safeNum(data.liftLoadScore),
      runLoadScore: safeNum(data.runLoadScore),
      recoveryScore: safeNum(data.recoveryScore),
      adherenceScore: safeNum(data.adherenceScore),
    };
  return {
    ...data,
    weekKey,
    breakdown,
  } as PerformanceWeekDoc;
}
