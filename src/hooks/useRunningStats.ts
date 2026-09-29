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
import { parseLocalDate, rollingWindowStart } from "../lib/dateHelpers";
import { binKeyForDate, type ChartGranularity } from "../lib/chartGranularity";
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
  /** Each whole kilometre's time in seconds, in order, as the run saved
   *  them (`splits[].time`; a saved run's splits are always kilometres).
   *  Empty for a run that saved none: treadmill, manual, and runs from
   *  before splits were kept. Analytics' fastest kilometres read these. */
  kmSplitSeconds?: number[];
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

/**
 * One saved split's time, or 0 when it cannot be read as a kilometre. A
 * kilometre's time in seconds IS its pace per km (`paceSeconds`), so a row
 * where the two disagree was cut on some other lap and would put a mile
 * into a "5K".
 */
function kmSplitSecondsOf(split: unknown): number {
  if (!split || typeof split !== "object") return 0;
  const { time, paceSeconds } = split as {
    time?: unknown;
    paceSeconds?: unknown;
  };
  if (typeof time !== "number" || !Number.isFinite(time) || time <= 0) return 0;
  if (
    typeof paceSeconds === "number" &&
    Number.isFinite(paceSeconds) &&
    paceSeconds > 0 &&
    Math.abs(paceSeconds - time) > 2
  ) {
    return 0;
  }
  return time;
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
    kmSplitSeconds: Array.isArray(data.splits)
      ? (data.splits as unknown[]).map(kmSplitSecondsOf)
      : [],
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

/**
 * What the live query last answered: the rows, whose they are, which query
 * answered, and how. Everything the hook reports is read off this during
 * render, so nothing has to be reset in an effect before a new query starts.
 */
interface LoadedRuns {
  runs: RunSummaryItem[];
  uid: string | null;
  queryKey: string | null;
  /** See the listener error callback below — a failed read used to be
   *  indistinguishable from an empty one. */
  failed: boolean;
  /** Server-confirmed, with no pending local writes. */
  authoritative: boolean;
}

const NOTHING_LOADED: LoadedRuns = {
  runs: [],
  uid: null,
  queryKey: null,
  failed: false,
  authoritative: false,
};

/**
 * `days` is a rolling window of exactly that many dates, ENDING TODAY —
 * so `useRunningStats(7)` covers today and the six days before it.
 *
 * The `- 1` is the whole point: a boundary of `today - days` against an
 * inclusive comparison opens a window of `days + 1` dates, so every
 * caller's number came up one short of what it got. `ProgrammeRunSection`
 * describes `useRunningStats(30)` as "4–~4.3 weeks", which is 30 days.
 */
export function useRunningStats(days: number = 30) {
  const uid = useUid();
  const today = useLocalDateKey();
  const queueVersion = useSyncExternalStore(
    subscribeQueuedWrites,
    queuedWritesVersion,
    queuedWritesVersion
  );
  const [loaded, setLoaded] = useState<LoadedRuns>(NOTHING_LOADED);
  const { runs, uid: loadedUid, queryKey: loadedQuery } = loaded;
  // Hist4: refresh trigger for pull-to-refresh. Incrementing the
  // tick forces the load effect below to re-run via the dep array.
  // Public surface is the `refresh()` callback below.
  const [refreshTick, setRefreshTick] = useState(0);
  const queryKey = `${uid ?? ""}:${days}:${today}:${refreshTick}`;

  /* An answer counts only for the account it was read for. After a
     sign-out (a shared-device sign-out → sign-in, or a transient null-user
     window) or a switch to account B, the rows, `failed` and
     `authoritative` belong to the previous account, so they read as empty
     / false from the render where the uid changes — before any effect
     runs — until B's own query answers (the uid-scoping class hardened in
     PR #820). `loading` is true until the CURRENT query (account, window,
     day, refresh) has answered; a same-uid pull-to-refresh, day rollover
     or window change keeps the current rows visible meanwhile. */
  const ownAnswer = !!uid && loadedUid === uid;
  const loading = !!uid && loadedQuery !== queryKey;
  const failed = ownAnswer && loaded.failed;
  const authoritative = ownAnswer && loaded.authoritative;

  useEffect(() => {
    if (!uid) return;

    let cancelled = false;

    const since = rollingWindowStart(days, parseLocalDate(today));

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
        setLoaded({
          runs: runList,
          uid,
          queryKey,
          failed: false,
          authoritative:
            !snap.metadata?.fromCache && !snap.metadata?.hasPendingWrites,
        });
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
        //
        // Same-uid rows already shown stay; another account's never do.
        if (cancelled) return;
        setLoaded((current) => ({
          runs: current.uid === uid ? current.runs : [],
          uid,
          queryKey,
          failed: true,
          authoritative: false,
        }));
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
    const since = rollingWindowStart(days, parseLocalDate(today));
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
    /** Monday weeks, always. */
    weeklyData: aggregateWeeklyData(visibleRuns),
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
