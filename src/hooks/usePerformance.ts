import { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import type { PerformanceSignals, PerformanceWeekDoc } from "@/lib/performanceTypes";
import { captureError } from "@/lib/errorReporting";

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

function safeBool(v: unknown): boolean {
  return v === true;
}

/**
 * Defensive defaults for missing signals fields. Applied to legacy
 * perf docs written before PI1a's CF rewrite shipped signals. Each
 * default is the "no notable signal" value so the client-side
 * getLine(state, signals) mapping falls through to generic copy for
 * the verb-state — no false claims about "loads strong" or "build
 * back up" from missing data.
 */
const DEFAULT_SIGNALS: PerformanceSignals = {
  bothLoadsStrong: false,
  liftAheadOfBaseline: 0,
  runAheadOfBaseline: 0,
  recoveryWeak: false,
  adherenceWeak: false,
  deloadFlag: false,
  lifetimeWeeks: 0,
  daysSinceLastTraining: 0,
};

/**
 * One-time-per-session warn cache. Keyed by weekKey so we get one
 * captureError per missing-signals doc per browser session.
 */
const _missingSignalsReported = new Set<string>();

function normaliseSignals(
  weekKey: string,
  raw: unknown,
): PerformanceSignals {
  if (raw && typeof raw === "object") {
    const s = raw as Partial<PerformanceSignals>;
    return {
      bothLoadsStrong: safeBool(s.bothLoadsStrong),
      liftAheadOfBaseline: safeNum(s.liftAheadOfBaseline),
      runAheadOfBaseline: safeNum(s.runAheadOfBaseline),
      recoveryWeak: safeBool(s.recoveryWeak),
      adherenceWeak: safeBool(s.adherenceWeak),
      deloadFlag: safeBool(s.deloadFlag),
      lifetimeWeeks: safeNum(s.lifetimeWeeks),
      daysSinceLastTraining: safeNum(s.daysSinceLastTraining),
    };
  }
  // Legacy doc (pre-PI1a deploy) — fingerprint by weekKey so we
  // log once per doc per session. errorReporting persists critical
  // errors to users/{uid}/errors; "perf-doc-missing-signals" isn't
  // critical (defaults apply, no user impact), so it lives in the
  // in-memory buffer for dev visibility.
  if (!_missingSignalsReported.has(weekKey)) {
    _missingSignalsReported.add(weekKey);
    captureError(
      new Error("perf-doc-missing-signals"),
      "error",
      { weekKey, fingerprint: `perf-doc-missing-signals:${weekKey}` },
    );
  }
  return { ...DEFAULT_SIGNALS };
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
  /* PR 7b follow-up — multipliers defensive default. Pre-PI1a docs
     (and any future schema drift) may not include this field;
     PerformanceTab reads `m.liftProgression` / `m.runVolume` /
     `m.runPaceAdjustmentPct` directly, so an undefined `multipliers`
     would crash the entire Performance accordion (RouteErrorBoundary
     fallback observed by the user). Fall back to the legacy
     individual fields with safeNum so render is always defensive.
     Multipliers default to 1.0 (no-effect) since their tooltip copy
     reads them as ratios above/below baseline. */
  const multipliers =
    (data.multipliers as PerformanceWeekDoc["multipliers"] | undefined) ?? {
      liftProgression: safeNum(data.liftProgression) || 1,
      runVolume: safeNum(data.runVolume) || 1,
      runPaceAdjustmentPct: safeNum(data.runPaceAdjustmentPct),
    };
  const signals = normaliseSignals(weekKey, data.signals);
  return {
    ...data,
    weekKey,
    breakdown,
    multipliers,
    signals,
  } as PerformanceWeekDoc;
}
