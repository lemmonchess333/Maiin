import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { logger } from "../lib/logger";
import {
  pendingDocumentWrites,
  subscribeQueuedWrites,
  queuedWritesVersion,
} from "@/lib/offlineQueue";
import { useUid } from "../lib/auth";
import { isVolumeEligible } from "../lib/runStatsEligibility";
import { addLocalDays, parseLocalDate } from "../lib/dateHelpers";
import {
  binKeyForDate,
  granularityForRange,
  type ChartGranularity,
} from "../lib/chartGranularity";
import { useLocalDateKey } from "./useLocalDateKey";
import {
  isRunDateKey,
  readRunExecutionTarget,
  runEvidenceDate,
  type RunExecutionTarget,
} from "@/lib/runExecutionEvidence";
import { sampleRoute, type RouteCoordinate } from "../lib/routeSegments";

export interface RunningWeekData {
  week: string;
  totalDistance: number;
  runCount: number;
  avgPace: number;
}

export interface RunSummaryItem {
  id: string;
  distance: number; // metres
  duration: number; // seconds
  avgPace: number; // sec/km
  elevationGain: number;
  calories: number;
  activityType: string;
  completedAt: Date;
  date?: string;
  executionTarget?: RunExecutionTarget | null;
  routeQuality?: string | null;
  /** Post-run effort check-in (#1523). null when skipped. Read by the
   *  Run14 ease-week nudge (harder-streak trigger). */
  relativeEffort: "easier" | "matched" | "harder" | null;
  /** A6: persisted pace-verdict tone. null when the session had no
   *  judgeable target (freeform / custom / pre-A6 runs). Read by the
   *  adaptive-intensity trigger + post-ease bounce check. Optional so
   *  existing item builders (tests, fixtures) stay assignable — the
   *  mapper below always sets it. */
  paceVerdictTone?: "on" | "fast" | "easy-too-fast" | "slow" | null;
  routePreview?: RouteCoordinate[];
  /* Validity metadata persisted by PR #480. Carried on the item so
     downstream UI (Recent Runs badges) can render transparency
     labels without re-querying. Stat aggregations consult these
     via the eligibility helpers. Optional because legacy docs
     (pre-#480) don't have the fields. */
  isInvalid?: boolean;
  savedAnyway?: boolean;
}

/**
 * Bucket a flat run list into Monday-anchored weeks. Pure function —
 * extracted so the bug it carries is unit-testable without mocking
 * Firestore + auth + the hook lifecycle.
 *
 * Volume eligibility is applied internally so the hook can return
 * the unfiltered `runs` array for transparency UI (Recent Runs
 * showing invalid/saved-anyway records with badges) while keeping
 * the weekly tile aggregations honest. A run that fails
 * `isVolumeEligible` contributes nothing to count, distance, or
 * pace this week.
 */
export function aggregateRunBins(
  runs: RunSummaryItem[],
  granularity: ChartGranularity = "weekly"
): RunningWeekData[] {
  const weeks: Record<
    string,
    { distance: number; count: number; paceKmSum: number; paceKm: number }
  > = {};
  for (const run of runs) {
    if (!isVolumeEligible(run)) continue;
    // Pure LOCAL date math, through the shared binner. At "weekly" this is
    // `localWeekKey` — the Monday-start key the axis and the sparkline both
    // read. Mixing local getDay()/setDate() with a UTC toISOString() key put
    // runs logged near midnight in non-UTC zones in the wrong week.
    const key = binKeyForDate(
      parseLocalDate(runEvidenceDate(run)),
      granularity
    );
    if (!weeks[key])
      weeks[key] = { distance: 0, count: 0, paceKmSum: 0, paceKm: 0 };
    weeks[key].distance += run.distance / 1000;
    weeks[key].count += 1;
    if (run.distance > 0 && run.avgPace > 0) {
      // Distance-weight each run's pace. An unweighted mean of per-run
      // paces let a 1 km recovery jog move the week's "avg pace" as much
      // as a 20 km long run — the classic average-of-averages skew.
      weeks[key].paceKmSum += run.avgPace * (run.distance / 1000);
      weeks[key].paceKm += run.distance / 1000;
    }
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, d]) => ({
      week,
      totalDistance: Math.round(d.distance * 10) / 10,
      runCount: d.count,
      avgPace: d.paceKm > 0 ? Math.round(d.paceKmSum / d.paceKm) : 0,
    }));
}

/**
 * The weekly call, kept as the name every existing consumer uses — and as
 * ONE implementation rather than two. History's distance sparkline walks
 * `localWeekKey` values, so its input must stay weekly whatever the chart
 * beneath it is binning.
 */
export function aggregateWeeklyData(runs: RunSummaryItem[]): RunningWeekData[] {
  return aggregateRunBins(runs, "weekly");
}

export function parseRunSummary(
  id: string,
  data: DocumentData
): RunSummaryItem | null {
  let date: Date | undefined;
  if (data.completedAt instanceof Timestamp) {
    date = data.completedAt.toDate();
  } else if (data.completedAt instanceof Date) {
    date = data.completedAt;
  } else if (typeof data.completedAt === "number") {
    date = new Date(data.completedAt);
  } else if (data.completedAt?.toDate) {
    date = data.completedAt.toDate();
  }
  if (!date || !Number.isFinite(date.getTime())) return null;

  const finite = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? value
      : 0;

  return {
    id,
    distance: finite(data.distance),
    duration: finite(data.duration),
    avgPace: finite(data.avgPace),
    elevationGain: finite(data.elevationGain),
    calories: finite(data.calories),
    activityType: data.activityType || "freerun",
    completedAt: date,
    date: isRunDateKey(data.date) ? data.date : undefined,
    executionTarget: readRunExecutionTarget(data),
    routeQuality:
      typeof data.routeQuality?.confidence === "string"
        ? data.routeQuality.confidence
        : typeof data.routeQuality === "string"
          ? data.routeQuality
          : null,
    relativeEffort:
      data.relativeEffort === "easier" ||
      data.relativeEffort === "matched" ||
      data.relativeEffort === "harder"
        ? data.relativeEffort
        : null,
    paceVerdictTone:
      data.paceVerdictTone === "on" ||
      data.paceVerdictTone === "fast" ||
      data.paceVerdictTone === "easy-too-fast" ||
      data.paceVerdictTone === "slow"
        ? data.paceVerdictTone
        : null,
    isInvalid: data.isInvalid === true,
    savedAnyway: data.savedAnyway === true,
    routePreview:
      data.points?.length > 1
        ? sampleRoute(data.points as RouteCoordinate[], 20).map((p) => ({
            lat: p.lat,
            lon: p.lon,
            ...(p.breakBefore ? { breakBefore: true } : {}),
          }))
        : data.routePreview,
  };
}

export function useRunningStats(days: number = 30) {
  const uid = useUid();
  const today = useLocalDateKey();
  const queueVersion = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const [{ runs, uid: loadedUid, queryKey: loadedQuery }, setLoaded] =
    useState<{
      runs: RunSummaryItem[];
      uid: string | null;
      queryKey: string | null;
    }>({ runs: [], uid: null, queryKey: null });
  const [loading, setLoading] = useState(true);
  /** See the listener error callback below — a failed read used to be
   *  indistinguishable from an empty one. */
  const [failed, setFailed] = useState(false);
  const [authoritative, setAuthoritative] = useState(false);
  // Hist4: refresh trigger for pull-to-refresh. Incrementing the
  // tick forces the load effect below to re-run via the dep array.
  // Public surface is the `refresh()` callback below.
  const [refreshTick, setRefreshTick] = useState(0);
  const queryKey = `${uid ?? ""}:${days}:${today}:${refreshTick}`;

  useEffect(() => {
    if (!uid) {
      // Clear the previous account's data on sign-out — not just `loading`.
      // If the component stays mounted across an account switch (shared-device
      // sign-out → sign-in, or a transient null-user window), leaving `runs` /
      // `weeklyData` populated leaks account A's runs into account B's view
      // until B's load completes (the uid-scoping class hardened in PR #820).
      setLoaded({ runs: [], uid: null, queryKey: null });
      setLoading(false);
      setFailed(false);
      setAuthoritative(false);
      return;
    }

    let cancelled = false;
    // A→B: clear A's rows immediately so they can't show under B. A same-uid
    // pull-to-refresh keeps the current rows visible while loading.
    setLoaded((current) =>
      current.uid === uid ? current : { runs: [], uid: null, queryKey: null }
    );
    setLoading(true);
    setAuthoritative(false);

    const since = addLocalDays(parseLocalDate(today), -days);

    const runsRef = collection(db, "users", uid, "runs");
    const q = query(
      runsRef,
      where("completedAt", ">=", Timestamp.fromDate(since)),
      orderBy("completedAt", "desc")
    );
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        const runList = snap.docs
          .map((d) => parseRunSummary(d.id, d.data()))
          .filter((run): run is RunSummaryItem => run !== null);

        if (cancelled) return;
        setLoaded({ runs: runList, uid, queryKey });
        setFailed(false);
        setAuthoritative(
          !snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites
        );
        setLoading(false);
      },
      (error) => {
        // A failed read must settle to a retryable state, not load forever
        // after a listener failure.
        //
        // But settling to `runs: []` also made failure look exactly like
        // success-with-no-runs, and History's Tier-1 auto-hide reads an
        // empty list as "this user doesn't run" and removes the section.
        // The failure was therefore doubly invisible: no error surface,
        // and the surface that WOULD have shown one deleted itself.
        // `failed` lets the caller tell the two apart.
        if (cancelled) return;
        setLoaded((current) => ({ ...current, uid, queryKey }));
        setFailed(true);
        setAuthoritative(false);
        setLoading(false);
        logger.error("[useRunningStats] Failed to load runs", error);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, days, refreshTick, today, queryKey]);

  const visibleRuns = useMemo(() => {
    void queueVersion;
    const byId = new Map(
      (loadedUid === uid ? runs : []).map((run) => [run.id, run])
    );
    const since = addLocalDays(parseLocalDate(today), -days);
    if (uid)
      for (const entry of pendingDocumentWrites(uid, `users/${uid}/runs`)) {
        const run = parseRunSummary(entry.id, {
          ...(entry.merge ? byId.get(entry.id) : {}),
          ...entry.data,
        });
        if (run && run.completedAt >= since) {
          if (
            entry.merge &&
            ![
              "runConfig",
              "planMode",
              "planSource",
              "matchedPlanExact",
              "offPlan",
              "scheduledRunId",
              "activityType",
            ].some((key) => Object.hasOwn(entry.data, key))
          ) {
            run.executionTarget = byId.get(entry.id)?.executionTarget ?? null;
          }
          byId.set(entry.id, run);
        }
      }
    return [...byId.values()]
      .filter((run) => run.completedAt >= since)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }, [uid, loadedUid, runs, days, queueVersion, today]);

  return {
    /** Monday weeks, always. History's distance sparkline walks
     *  `localWeekKey` values, so this output must not follow the window. */
    weeklyData: aggregateWeeklyData(visibleRuns),
    /** The same aggregation binned FOR the window, which is what a chart
     *  wants: one bar per day at 1W/1M, per week at 3M, per month beyond.
     *  Weekly bins over a year are the "~52 unreadable bars" the lifting
     *  volume chart already moved off (Hist5c pin 7), and the running
     *  chart would have inherited them the moment it started honouring
     *  the range. */
    binnedData: aggregateRunBins(visibleRuns, granularityForRange(days)),
    granularity: granularityForRange(days),
    runs: visibleRuns,
    loading:
      loading &&
      !(
        uid &&
        pendingDocumentWrites(uid, `users/${uid}/runs`).some(
          (entry) => !entry.merge
        )
      ),
    /** True when the last read threw. Distinguishes "we couldn't load
     *  your runs" from "you have no runs" — the two are otherwise the
     *  same `runs: []`. */
    failed: failed && visibleRuns.length === 0,
    /** History can display cached/queued facts, but coaching must not treat
     * a partial or failed query as a complete, current evidence window. */
    evidenceReady:
      !!uid &&
      loadedUid === uid &&
      loadedQuery === queryKey &&
      !loading &&
      !failed &&
      authoritative &&
      pendingDocumentWrites(uid, `users/${uid}/runs`).length === 0,
    /** Hist4: restarts the underlying live query. Used by the
     *  History page's pull-to-refresh gesture; the other History
     *  data sources (useWorkouts, useMeals) are onSnapshot listeners
     *  so they're already live. The loading flag reports the new subscription, while
     *  existing same-account rows remain visible. */
    refresh: () => setRefreshTick((n) => n + 1),
  };
}
