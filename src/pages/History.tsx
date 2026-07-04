import { useMemo, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMeals } from "@/hooks/useMeals";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useLifetimeRunStats } from "@/hooks/useLifetimeRunStats";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { buildDelta } from "@/lib/deltaFormat";
import { EXERCISES } from "@/lib/exercises";
import TimeRangePills from "@/components/analytics/TimeRangePills";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import SectionLabel from "@/components/ui/SectionLabel";
import EmptyState from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/buttonClasses";
import PeriodOverview from "@/components/analytics/PeriodOverview";
import StatCard from "@/components/analytics/StatCard";
import { isPaceEligible } from "@/lib/runStatsEligibility";
import { paceMinSec } from "@/lib/runLabels";
import { requiresManualDistance } from "@/lib/runGuards";
import { Footprints, Trophy, UtensilsCrossed, LineChart } from "lucide-react";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Skeleton, ChartSkeleton } from "@/components/LoadingSkeleton";
import { formatVolume, formatDistance } from "@/utils/formatters";
import {
  track as trackHistoryEvent,
  type HistoryRange,
  type HistoryTab,
} from "@/lib/historyAnalytics";
import HistoryOfflineBanner from "@/components/analytics/HistoryOfflineBanner";
/* AnalyticsAnchorChips removed PR 7b follow-up — see note inline
   below where it would have rendered. */
import { granularityForRange, binKeyForDate } from "@/lib/chartGranularity";
import { localWeekKey, localDateString } from "@/lib/dateHelpers";
import {
  computeMuscleRecovery,
  hitsFromWorkoutDocs,
  recoveryForHeatMapGroups,
  RECOVERY_LOOKBACK_DAYS,
} from "@/lib/muscleRecovery";

const VolumeChart = lazy(() => import("@/components/analytics/VolumeChart"));
const MuscleHeatMap = lazy(
  () => import("@/components/analytics/MuscleHeatMap")
);
const MacroDistribution = lazy(
  () => import("@/components/analytics/MacroDistribution")
);
const RunningHistorySection = lazy(
  () => import("@/components/run/RunningHistorySection")
);
const ShoeMileageSection = lazy(
  () => import("@/components/run/ShoeMileageSection")
);
/* Hist5b pin 3 — PerformanceTab is now lazy-loaded INSIDE
   PerformanceSection (the inline accordion's expanded body), not
   rendered as a top-level tab. The dedicated `performance` tab was
   removed; deep-links to /history#performance route to the section
   anchor inside Analytics. */
const PerformanceSection = lazy(
  () => import("@/components/analytics/PerformanceSection")
);
const PRsTab = lazy(() => import("@/components/analytics/PRsTab"));
const BadgeGrid = lazy(() =>
  import("@/features/streaks/BadgeGrid").then((m) => ({ default: m.BadgeGrid }))
);
const TrendWeight = lazy(() =>
  import("@/components/progress/TrendWeight").then((m) => ({
    default: m.TrendWeight,
  }))
);
const CalorieBalanceChart = lazy(
  () => import("@/components/progress/CalorieBalanceChart")
);

/* Hist5b pin 1 + 3 + 4 — tab consolidation 6→3 after the
   Performance fold (PR 6) + PRs tab introduction (PR 7a).
   Sport-filtered tabs were dropped in PR 5a; the Performance tab
   folded into Analytics in PR 6. Tabs now: Analytics + PRs +
   Badges — three semantically-distinct roles (window-scoped
   current state / lifetime achievements / progress milestones).
   "All" was renamed "analytics" to match the page's frame
   commitment (Hist5a). */
type FilterTab = "analytics" | "prs" | "badges";

const VALID_TABS: FilterTab[] = ["analytics", "prs", "badges"];

/* Hist5c pin 11 — legacy `?tab=` redirect map. Old URLs from
   share-cards, bookmarks, and pre-Hist5 deep-links continue to
   work. The four sport-filtered values + the old "all" value all
   redirect to "analytics" (the unified scroll page). Performance
   redirects too — PR 6 folded it into Analytics with a hash anchor
   target (`#performance`); the reconciliation effect promotes the
   hash alongside the tab rewrite for direct deep-link continuity. */
const LEGACY_TAB_REDIRECTS: Record<string, FilterTab> = {
  all: "analytics",
  running: "analytics",
  lifting: "analytics",
  nutrition: "analytics",
  performance: "analytics",
};

/* Tab values that, in addition to a `?tab=` rewrite, also force a
   hash anchor to scroll to a specific section on the redirected
   tab. Currently only `performance` — clicking on Home's PI hero
   card (which deep-links to /history#performance per PR #635)
   should land on the Performance section inside Analytics. */
const LEGACY_TAB_TO_HASH: Partial<Record<string, string>> = {
  performance: "performance",
};

// Module-level so the useCallback consuming it has a stable
// reference across renders (the exhaustive-deps lint rule rightly
// flags an in-component const). Mirrors TimeRangePills' default
// options.
const VALID_RANGES = ["1W", "1M", "3M", "6M", "1Y"] as const;
type ValidRange = (typeof VALID_RANGES)[number];

function FilterPills({
  filter,
  setFilter,
}: {
  filter: FilterTab;
  setFilter: (f: FilterTab) => void;
}) {
  // Canonical iOS "track" SegmentedControl — the same control Social's
  // tabs use. Replaced the bespoke scrolling brand-fill chip row (only
  // ever three short tabs, so the scroll + edge-fades were dead weight)
  // in the Social-uniformity pass.
  return (
    <SegmentedControl
      ariaLabel="History view"
      value={filter}
      onChange={setFilter}
      options={VALID_TABS.map((f) => ({
        value: f,
        label: f === "analytics" ? "Analytics" : f === "prs" ? "PRs" : "Badges",
      }))}
    />
  );
}

// Convert a "now vs. previous period" pair into the shape StatCard's
// `delta` prop expects. Rule: prev === 0 → no delta (can't compute a
// percent change from zero); abs-change < 1% → treated as no movement
/* buildDelta moved to `@/lib/deltaFormat` so the percentage-delta
   contract (null on non-finite / non-positive previous / sub-1%
   noise) can be reused by other "vs previous period" surfaces and
   tested in isolation. */

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Hist4: URL `?tab=` is now the source of truth. The previous
  // "read URL, then clear it" pattern broke the lock's URL-
  // persistence requirement — and silently dropped other query
  // params (the now-fixed `?range=` collision). Filter is derived
  // from the URL on every render; setFilter writes back via
  // setSearchParams({replace:true}) so tab-tapping doesn't
  // accumulate browser history entries. Mirrors Soc5 + Food6.
  //
  // Deep-link sources (in resolution order, first hit wins) still
  // work — but ALL of them now reconcile into the URL on mount
  // rather than living in three separate side-channels:
  //   1. ?tab=... query param  ← canonical source going forward
  //   2. #<tab> URL fragment (P2c — /history#performance from the
  //      Home PerformanceCard)
  //   3. sessionStorage("history-tab") (StreakFlame + other in-app
  //      deep-links that prefer not to pollute the URL until
  //      mount)
  //   4. "all"
  const tabFromUrl = searchParams.get("tab");
  /* Resolve filter from URL with legacy-redirect awareness: legacy
     `?tab=running|lifting|nutrition|all` values map to "analytics"
     (the unified scroll page). The actual URL rewrite happens in
     the reconciliation effect below; this derivation makes the
     current render correct even before the rewrite lands. */
  const filter: FilterTab = (() => {
    if (!tabFromUrl) return "analytics";
    if (VALID_TABS.includes(tabFromUrl as FilterTab))
      return tabFromUrl as FilterTab;
    const redirected = LEGACY_TAB_REDIRECTS[tabFromUrl];
    if (redirected) return redirected;
    return "analytics";
  })();
  const setFilter = useCallback(
    (next: FilterTab) => {
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (next === "analytics") updated.delete("tab");
          else updated.set("tab", next);
          return updated;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // One-shot reconciliation on mount: if the URL doesn't already
  // carry a tab AND a hash / sessionStorage hint exists, promote
  // that hint to the URL so the rest of the page can rely on URL
  // as the single source of truth. Also clears the hash and the
  // sessionStorage entry so a later refresh doesn't silently force
  // a tab the user has since navigated away from.
  const reconciledRef = useRef(false);
  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;

    /* Hist5c pin 11 — rewrite any legacy `?tab=` value to the
       canonical Hist5 value on first mount. Share-cards / push
       notifications / bookmarks from before the tab consolidation
       still land on the right surface; the URL bar reflects the
       new contract once they arrive.
       Tab values that need to also preserve their identity via
       a section anchor (LEGACY_TAB_TO_HASH) get the hash set
       alongside the rewrite — so /history?tab=performance becomes
       /history#performance and scrolls to the Performance section
       inside Analytics. */
    if (tabFromUrl && LEGACY_TAB_REDIRECTS[tabFromUrl]) {
      setFilter(LEGACY_TAB_REDIRECTS[tabFromUrl]);
      const hashTarget = LEGACY_TAB_TO_HASH[tabFromUrl];
      if (hashTarget && typeof window !== "undefined") {
        /* Set the hash WITHOUT scrolling here — the anchor scroll
           happens in the post-reconciliation effect below (after the
           filter update has propagated through render). */
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#" + hashTarget
        );
      }
    }

    let hintedTab: FilterTab | null = null;
    if (typeof window !== "undefined") {
      const hashRaw = window.location.hash.replace(/^#/, "");
      if (VALID_TABS.includes(hashRaw as FilterTab)) {
        hintedTab = hashRaw as FilterTab;
      } else if (LEGACY_TAB_REDIRECTS[hashRaw]) {
        // #running / #lifting etc. legacy hash deep-links also redirect.
        hintedTab = LEGACY_TAB_REDIRECTS[hashRaw];
      }
    }
    if (!hintedTab) {
      try {
        const stashedRaw = sessionStorage.getItem("history-tab");
        if (stashedRaw) {
          if (VALID_TABS.includes(stashedRaw as FilterTab)) {
            hintedTab = stashedRaw as FilterTab;
          } else if (LEGACY_TAB_REDIRECTS[stashedRaw]) {
            hintedTab = LEGACY_TAB_REDIRECTS[stashedRaw];
          }
        }
      } catch {
        /* private mode — nothing to read */
      }
    }
    // Promote to URL only if URL doesn't already have a tab and
    // the hint isn't "analytics" (which is the URL-clean state).
    if (!tabFromUrl && hintedTab && hintedTab !== "analytics") {
      setFilter(hintedTab);
    }
    // Clear the side-channel hints regardless — URL now owns the
    // state, side-channels were one-shot entry points.
    try {
      sessionStorage.removeItem("history-tab");
    } catch {
      /* private mode */
    }
    if (typeof window !== "undefined" && window.location.hash) {
      /* PR 6 — preserve section-anchor hashes. `#performance` (the
         Home PI hero deep-link target, per PR #635) AND
         `#performance-expanded` (PerformanceSection's expanded-state
         persistence, Hist5b pin 3) are not tab hints — they're
         scroll-anchor + accordion-state markers. Leave them in the
         URL; the section's own useEffect handles the scroll. Strip
         only the now-irrelevant legacy tab hashes. */
      const currentHash = window.location.hash.replace(/^#/, "");
      const SECTION_ANCHOR_HASHES = new Set([
        "performance",
        "performance-expanded",
        "analytics-performance",
        "analytics-performance-detail",
      ]);
      if (!SECTION_ANCHOR_HASHES.has(currentHash)) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      }
    }
    // Intentionally only on mount — the ref guard ensures this
    // runs once per page load even if React renders the effect
    // multiple times.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hist4: range persisted via URL `?range=` per the lock's "Tab +
  // range persistence via URL search params" pin. Default '1M'
  // remains the URL-clean state — when the user is on the default
  // we strip the param so /history reads cleanly. Matches the
  // pattern landed for Food6 ci5 (`?date=`) and Soc5 (`?tab=`).
  const rangeFromUrl = searchParams.get("range");
  const timeRange: ValidRange = (VALID_RANGES as readonly string[]).includes(
    rangeFromUrl ?? ""
  )
    ? (rangeFromUrl as ValidRange)
    : "1M";
  const setTimeRange = useCallback(
    (next: string) => {
      // Defensive: TimeRangePills passes a string. Reject unknown
      // values rather than letting them silently land in the URL.
      if (!(VALID_RANGES as readonly string[]).includes(next)) return;
      setSearchParams(
        (params) => {
          const updated = new URLSearchParams(params);
          if (next === "1M") updated.delete("range");
          else updated.set("range", next);
          return updated;
        },
        { replace: true }
      );
      trackHistoryEvent("history_range_changed", {
        range: next as HistoryRange,
        rangeType: "pill",
      });
    },
    [setSearchParams]
  );
  const rangeDays =
    timeRange === "1W"
      ? 7
      : timeRange === "1M"
        ? 30
        : timeRange === "3M"
          ? 90
          : timeRange === "6M"
            ? 180
            : 365;

  const {
    weeklyData,
    runs,
    loading: runsLoading,
    refresh: refreshRuns,
  } = useRunningStats(rangeDays);
  const { workouts, loading: workoutsLoading } = useWorkouts();
  const { meals, loading: mealsLoading } = useMeals();
  const lifetimeRuns = useLifetimeRunStats();
  const { profile } = useAuth();
  const dataLoading = runsLoading || workoutsLoading || mealsLoading;

  // Hist4 perf telemetry. renderStartRef takes its timestamp from the
  // post-mount effect (rather than lazy useState which would trip
  // react-hooks/purity for performance.now() in render). Fires once
  // when dataLoading transitions to false — the moment the user sees
  // real content instead of skeleton state. Target: <500ms p95 per
  // Hist4 cross-cutting performance pin. Same shape as food / social.
  const renderStartRef = useRef<number>(0);
  const renderReportedRef = useRef(false);
  useEffect(() => {
    renderStartRef.current = performance.now();
  }, []);
  useEffect(() => {
    if (dataLoading || renderReportedRef.current) return;
    if (renderStartRef.current === 0) return;
    const ms = performance.now() - renderStartRef.current;
    trackHistoryEvent("history_initial_render_ms", {
      durationMs: Math.round(ms),
    });
    renderReportedRef.current = true;
  }, [dataLoading]);

  // Hist4: pull-to-refresh re-fetches the data source that actually
  // benefits from a re-pull (useRunningStats is a one-shot getDocs;
  // useWorkouts + useMeals are onSnapshot listeners already live).
  // Extracted into src/hooks/usePullToRefresh.ts (shared with
  // Social + Food) — the previous inline implementation's own
  // comment said "Same touch-handler shape as Social.tsx" so
  // triplication was already a known smell.
  //
  // useRunningStats.refresh kicks off a load but doesn't return a
  // settling promise — the loading flag will flip and back. Use
  // the hook's minDisplayMs=600 to hold the spinner long enough
  // to feel like confirmation without making the gesture feel
  // stuck. The more precise alternative would be to watch
  // runsLoading directly, but that introduces a render dependency
  // loop here.
  const { isRefreshing: pullRefreshing, bindProps: pullBindProps } =
    usePullToRefresh({
      onRefresh: () => {
        refreshRuns();
      },
      minDisplayMs: 600,
    });

  // Goal-aware sentiment for nutrition deltas. On a cut, eating more is
  // off-plan (red), eating less is on-plan (green). On a lean bulk it
  // flips. On recomp the sign doesn't carry sentiment, so we mute it.
  // Protein is special-cased on the call site below — more protein is
  // generally good for any goal, so it's always "up-good".
  const goal = profile?.program?.goal;
  const calorieDirection: "up-good" | "down-good" | "neutral" =
    goal === "cut" ? "down-good" : goal === "lean bulk" ? "up-good" : "neutral";
  const macroTargets = profile?.macroTargets;

  // Lifetime totals — all-time aggregates shown only on the "All" tab,
  // pinned at the very bottom as a quiet "you've come this far" footer.
  // Uses unfiltered workouts/meals (both hooks return everything) plus
  // a one-shot lifetime run query so pre-window runs aren't excluded.
  const lifetimeTotals = useMemo(() => {
    let liftVolume = 0;
    workouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          liftVolume += (set.weightKg || 0) * (set.reps || 0);
        });
      });
    });
    const daysLogged = new Set(meals.map((m) => m.date)).size;
    return {
      runCount: lifetimeRuns.runCount,
      runKm: lifetimeRuns.totalDistanceM / 1000,
      liftCount: workouts.length,
      liftVolume,
      mealCount: meals.length,
      daysLogged,
    };
  }, [workouts, meals, lifetimeRuns.runCount, lifetimeRuns.totalDistanceM]);

  const runningTotals = useMemo(() => {
    const runCount = weeklyData.reduce((sum, week) => sum + week.runCount, 0);
    const runDistance = weeklyData.reduce(
      (sum, week) => sum + week.totalDistance,
      0
    );
    const paceSamples = weeklyData
      .filter((w) => w.avgPace > 0)
      .map((w) => w.avgPace);
    const avgPace = paceSamples.length
      ? Math.round(paceSamples.reduce((a, b) => a + b, 0) / paceSamples.length)
      : 0;

    // Zero-padded weekly distance across every Sunday-anchored week
    // in the time range. Distance is a count metric — a week with no
    // runs is legitimately 0 km, so the sparkline shape correctly
    // tells the consistency story (valleys at 0 = rest weeks, spikes
    // = training weeks).
    const distanceByWeek: Record<string, number> = {};
    for (const w of weeklyData) {
      distanceByWeek[w.week] = w.totalDistance;
    }
    const allWeekKeys: string[] = [];
    {
      const since = new Date();
      since.setDate(since.getDate() - rangeDays);
      const cursor = new Date(since);
      cursor.setDate(cursor.getDate() - cursor.getDay());
      const end = new Date();
      end.setDate(end.getDate() - end.getDay());
      while (cursor <= end) {
        // weeklyData[].week is keyed by localWeekKey (useRunningStats),
        // so the axis MUST use the same local-week helper. The prior
        // cursor.toISOString() (UTC) key never matched in non-UTC zones,
        // flatlining the sparkline.
        allWeekKeys.push(localWeekKey(cursor));
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    const distanceSparkline = allWeekKeys.map((k) => distanceByWeek[k] ?? 0);

    // Pace is a RATE metric — a week with no runs has no pace, not 0
    // sec/km (which would mean infinite speed). Don't zero-pad. Use
    // only the weeks that actually had runs, in order.
    const paceSparkline = weeklyData
      .filter((w) => w.avgPace > 0)
      .map((w) => w.avgPace);

    return { runCount, runDistance, avgPace, distanceSparkline, paceSparkline };
  }, [weeklyData, rangeDays]);

  const runningPRs = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    /* Hist5b pin 4 / PR 7b — rolling 30-day window for the
       "Recent bests" PRs subsection (sublabeled inside the PRs
       tab). Distinct from the lifetime PRs computed below. */
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    /* Pace and outdoor-distance PRs require pace eligibility:
       outdoor GPS source (treadmill / manual record their distance
       from user input, so a 2km / 5:17 treadmill entry shouldn't
       claim "Fastest 1K 2:38/km"), valid + saved-properly + above
       the volume floor + finite positive avgPace. Longest Run
       reads outdoor only too — treadmill distance isn't
       GPS-verified, so it can't set a distance PR. */
    const paceEligible = runs.filter((r) => isPaceEligible(r));

    /* Hist5 grill Q3 Stress 3 round 1 + Hist5b pin 5 — Indoor PRs
       tracked separately for users who run primarily on a
       treadmill or who enter manual distances. Same fastest-pace
       logic, different eligibility filter: must be treadmill/
       manual + valid + finite-positive avgPace + above volume
       floor. Sublabeled distinctly so the user doesn't conflate
       indoor pace (user-entered distance) with outdoor pace
       (GPS-verified). */
    const indoorEligible = runs.filter(
      (r) =>
        requiresManualDistance(
          r.activityType as Parameters<typeof requiresManualDistance>[0]
        ) &&
        Number.isFinite(r.avgPace) &&
        r.avgPace > 0 &&
        r.distance >= 500
    );

    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    /* Compute best 1K / 5K / Longest from a run pool. Shared shape
       between Lifetime / Recent / Indoor buckets — only the input
       filter changes. Returns the same UI-ready array shape as
       before. */
    const buildPRBucket = (
      pool: typeof paceEligible,
      includeLongest: boolean
    ) => {
      const runs1k = pool.filter((r) => r.distance >= 1000);
      const best1k = runs1k.length
        ? runs1k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
        : null;

      const runs5k = pool.filter((r) => r.distance >= 5000);
      const best5k = runs5k.length
        ? runs5k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
        : null;

      const longest =
        includeLongest && pool.length
          ? pool.reduce((best, r) => (r.distance > best.distance ? r : best))
          : null;

      const cards: Array<{
        label: string;
        value: string;
        date: string;
        isNew: boolean;
      }> = [
        {
          label: "Fastest 1K",
          value: best1k ? paceMinSec(best1k.avgPace) : "--",
          date: best1k ? fmtDate(best1k.completedAt) : "",
          isNew: best1k ? best1k.completedAt >= sevenDaysAgo : false,
        },
        {
          label: "Fastest 5K",
          value: best5k ? paceMinSec(best5k.avgPace) : "--",
          date: best5k ? fmtDate(best5k.completedAt) : "",
          isNew: best5k ? best5k.completedAt >= sevenDaysAgo : false,
        },
      ];
      if (includeLongest) {
        cards.push({
          label: "Longest Run",
          value: longest ? (longest.distance / 1000).toFixed(1) + " km" : "--",
          date: longest ? fmtDate(longest.completedAt) : "",
          isNew: longest ? longest.completedAt >= sevenDaysAgo : false,
        });
      }
      return cards;
    };

    return {
      lifetime: buildPRBucket(paceEligible, /* includeLongest */ true),
      recent30d: buildPRBucket(
        paceEligible.filter((r) => r.completedAt >= thirtyDaysAgo),
        /* includeLongest */ true
      ),
      indoor: buildPRBucket(indoorEligible, /* includeLongest */ false),
      hasAnyIndoor: indoorEligible.length > 0,
      hasAnyRecent: paceEligible.some((r) => r.completedAt >= thirtyDaysAgo),
    };
  }, [runs]);

  // Per-group recovery chips for the muscle heat map (Tier-2 #6 second
  // half). NOW-state — always computed over the last RECOVERY_LOOKBACK_DAYS
  // regardless of the page's TimeRange (the card labels the carve-out).
  const muscleRecovery = useMemo(() => {
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - RECOVERY_LOOKBACK_DAYS);
    const lookbackKey = localDateString(lookbackStart);
    const recent = workouts.filter((w) => w.date >= lookbackKey);
    const hits = hitsFromWorkoutDocs(recent);
    return recoveryForHeatMapGroups(
      computeMuscleRecovery(hits, localDateString())
    );
  }, [workouts]);

  const liftingData = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    // Previous comparable period: the same span of days immediately before
    // `since`. Used for ↑/↓ delta badges on stat cards — matches the
    // Whoop / Apple Fitness convention of "this period vs. last period."
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - rangeDays);

    const filtered = workouts.filter((w) => new Date(w.date) >= since);
    const liftCount = filtered.length;
    let liftVolume = 0;
    const muscleData: Record<string, number> = {};

    filtered.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          liftVolume += set.weightKg * set.reps;
        });
        // Look up category from the static EXERCISES list as the
        // primary source. The saved `ex.category` field is unreliable
        // — seed/test data has shipped with every exercise tagged
        // "Chest" regardless of actual movement, which collapsed the
        // muscle heatmap to chest-only. EXERCISES is the authoritative
        // taxonomy; fall back to the saved field only if the exercise
        // isn't in the static list (e.g. a custom exercise).
        const exDef = EXERCISES.find((e) => e.name === ex.exerciseName);
        const group = exDef?.category || ex.category || "Other";
        muscleData[group] = (muscleData[group] || 0) + (ex.sets?.length || 0);
      });
    });

    // Previous-period totals for delta comparison.
    const prevFiltered = workouts.filter((w) => {
      const d = new Date(w.date);
      return d >= prevSince && d < since;
    });
    let prevLiftVolume = 0;
    prevFiltered.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          prevLiftVolume += set.weightKg * set.reps;
        });
      });
    });
    const prevLiftCount = prevFiltered.length;

    const weekMap: Record<string, number> = {};
    const sessionWeekMap: Record<string, number> = {};
    /* Hist5c pin 7 — adaptive chart granularity. At 1W/1M we bin
       daily; at 3M we bin weekly (Sunday-anchored, the prior
       universal behaviour); at 6M/1Y we bin monthly. Avoids the
       52-bar unreadable mess at long windows. */
    const granularity = granularityForRange(rangeDays);
    filtered.forEach((w) => {
      const d = new Date(w.date);
      const key = binKeyForDate(d, granularity);
      const vol = w.exercises.reduce(
        (sum, ex) =>
          sum + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0),
        0
      );
      weekMap[key] = (weekMap[key] || 0) + vol;
      sessionWeekMap[key] = (sessionWeekMap[key] || 0) + 1;
    });
    const sortedWeekKeys = Object.keys(weekMap).sort((a, b) =>
      a.localeCompare(b)
    );
    const weeklyVolume = sortedWeekKeys.map((week) => ({
      week,
      volume: weekMap[week],
    }));

    // Zero-pad sparklines across every Sunday-anchored week in the
    // range. For activity (volume + sessions), missing weeks are
    // legitimately zero — the user didn't lift that week — so the
    // sparkline shape correctly tells the consistency story instead
    // of compressing logged-only weeks into an uninterrupted line.
    const allWeekKeys: string[] = [];
    {
      const cursor = new Date(since);
      cursor.setDate(cursor.getDate() - cursor.getDay());
      const end = new Date();
      end.setDate(end.getDate() - end.getDay());
      while (cursor <= end) {
        // weekMap is keyed by binKeyForDate(d, granularity) (UTC-Sunday
        // for the weekly bins these sparklines step over), so the axis
        // MUST derive its keys with the SAME helper. The prior local-
        // cursor + cursor.toISOString() key never matched binKeyForDate's
        // UTC-Sunday anchor in non-UTC zones, flatlining the sparkline.
        allWeekKeys.push(binKeyForDate(cursor, "weekly"));
        cursor.setDate(cursor.getDate() + 7);
      }
    }
    const volumeSparkline = allWeekKeys.map((w) => weekMap[w] ?? 0);
    const sessionsSparkline = allWeekKeys.map((w) => sessionWeekMap[w] ?? 0);

    // Build all-time best e1rm per exercise
    const allTimeBest: Record<string, number> = {};
    workouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          const e1rm = set.weightKg * (1 + set.reps / 30);
          allTimeBest[ex.exerciseName] = Math.max(
            allTimeBest[ex.exerciseName] || 0,
            e1rm
          );
        });
      });
    });

    // Best set per exercise from the last 7 days only
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentWorkouts = workouts.filter(
      (w) => new Date(w.date) >= sevenDaysAgo
    );
    const prMap: Record<
      string,
      { weight: number; reps: number; date: string; isAllTimeBest: boolean }
    > = {};
    recentWorkouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        const name = ex.exerciseName;
        const exInfo = EXERCISES.find((e) => e.name === name);
        const isBWExercise = exInfo?.equipment === "Bodyweight";
        ex.sets?.forEach((set) => {
          if (!isBWExercise && set.weightKg <= 0) return;
          const e1rm = set.weightKg * (1 + set.reps / 30);
          const score = isBWExercise && set.weightKg === 0 ? set.reps : e1rm;
          const prevScore = prMap[name]
            ? isBWExercise && prMap[name].weight === 0
              ? prMap[name].reps
              : prMap[name].weight * (1 + prMap[name].reps / 30)
            : -1;
          if (score > prevScore) {
            prMap[name] = {
              weight: set.weightKg,
              reps: set.reps,
              date: w.date,
              isAllTimeBest: Math.abs(e1rm - (allTimeBest[name] || 0)) < 0.01,
            };
          }
        });
      });
    });
    const prTimeline = Object.entries(prMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);

    /* Hist5b pin 4 / PR 7a — lifetime PRs for the dedicated PRs tab.
       Distinct from prTimeline above (which is a rolling 7-day
       view scheduled for removal when the PRs tab fully takes
       over). For each exercise, find the single set with the
       highest e1rm-equivalent score across all logged workouts.
       Bodyweight exercises score on reps (weight=0); weighted
       exercises score on weight × (1 + reps/30). */
    const lifetimeBestSet: Record<
      string,
      { weight: number; reps: number; date: string; score: number }
    > = {};
    workouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        const name = ex.exerciseName;
        const exInfo = EXERCISES.find((e) => e.name === name);
        const isBWExercise = exInfo?.equipment === "Bodyweight";
        ex.sets?.forEach((set) => {
          if (!isBWExercise && set.weightKg <= 0) return;
          const e1rm = set.weightKg * (1 + set.reps / 30);
          const score = isBWExercise && set.weightKg === 0 ? set.reps : e1rm;
          const prev = lifetimeBestSet[name];
          if (!prev || score > prev.score) {
            lifetimeBestSet[name] = {
              weight: set.weightKg,
              reps: set.reps,
              date: w.date,
              score,
            };
          }
        });
      });
    });
    const lifetimePRs = Object.entries(lifetimeBestSet)
      .map(([name, data]) => ({
        name,
        weight: data.weight,
        reps: data.reps,
        date: data.date,
      }))
      .sort((a, b) => {
        /* Sort by date desc (most-recently-set PR first). Provides
           a sense of momentum on the PRs tab — the lifts the user
           has been pushing most recently float to the top. */
        return b.date.localeCompare(a.date);
      });

    /* Hist5b pin 4 / PR 7b — Recent bests subsection (rolling 30
       days). Same per-exercise top-set logic as lifetimePRs but
       constrained to the last 30 days. Distinct from prTimeline
       (last 7 days, used by the prior Analytics card we just
       deleted). Lives in the PRs tab as a sublabeled subsection
       so the user reads "Lifetime" vs "Last 30 days" as two
       different scopes. */
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // w.date is a LOCAL "YYYY-MM-DD" string, so the cutoff must be the LOCAL
    // date too (same UTC/local-mixing family as the sparkline axes above).
    const thirtyDaysAgoKey = localDateString(thirtyDaysAgo);
    const recentBestSet: Record<
      string,
      { weight: number; reps: number; date: string; score: number }
    > = {};
    workouts
      .filter((w) => w.date >= thirtyDaysAgoKey)
      .forEach((w) => {
        w.exercises?.forEach((ex) => {
          const name = ex.exerciseName;
          const exInfo = EXERCISES.find((e) => e.name === name);
          const isBWExercise = exInfo?.equipment === "Bodyweight";
          ex.sets?.forEach((set) => {
            if (!isBWExercise && set.weightKg <= 0) return;
            const e1rm = set.weightKg * (1 + set.reps / 30);
            const score = isBWExercise && set.weightKg === 0 ? set.reps : e1rm;
            const prev = recentBestSet[name];
            if (!prev || score > prev.score) {
              recentBestSet[name] = {
                weight: set.weightKg,
                reps: set.reps,
                date: w.date,
                score,
              };
            }
          });
        });
      });
    const recentLiftPRs = Object.entries(recentBestSet)
      .map(([name, data]) => ({
        name,
        weight: data.weight,
        reps: data.reps,
        date: data.date,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      liftCount,
      liftVolume,
      muscleData,
      weeklyVolume,
      weeklyVolumeGranularity: granularity,
      prTimeline,
      lifetimePRs,
      recentLiftPRs,
      prevLiftCount,
      prevLiftVolume,
      volumeSparkline,
      sessionsSparkline,
    };
  }, [workouts, rangeDays]);

  const nutrition = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    const prevSince = new Date(since);
    prevSince.setDate(prevSince.getDate() - rangeDays);

    type DayTotals = { cal: number; prot: number; carbs: number; fat: number };
    const bucketByDate = (ms: typeof meals) => {
      const byDate: Record<string, DayTotals> = {};
      for (const m of ms) {
        if (!byDate[m.date])
          byDate[m.date] = { cal: 0, prot: 0, carbs: 0, fat: 0 };
        byDate[m.date].cal += m.totalCalories || 0;
        byDate[m.date].prot += m.totalProtein || 0;
        byDate[m.date].carbs += m.totalCarbs || 0;
        byDate[m.date].fat += m.totalFat || 0;
      }
      return byDate;
    };
    const avg = (days: DayTotals[], key: keyof DayTotals) =>
      days.length
        ? Math.round(days.reduce((s, d) => s + d[key], 0) / days.length)
        : 0;

    const filtered = meals.filter(
      (m) => new Date(m.date + "T00:00:00") >= since
    );
    const prevFiltered = meals.filter((m) => {
      const d = new Date(m.date + "T00:00:00");
      return d >= prevSince && d < since;
    });

    const byDate = bucketByDate(filtered);
    const prevByDate = bucketByDate(prevFiltered);
    const days = Object.values(byDate);
    const prevDays = Object.values(prevByDate);

    const avgCalories = avg(days, "cal");
    const avgProtein = avg(days, "prot");
    const avgCarbs = avg(days, "carbs");
    const avgFat = avg(days, "fat");
    const prevAvgCalories = avg(prevDays, "cal");
    const prevAvgProtein = avg(prevDays, "prot");
    const prevAvgCarbs = avg(prevDays, "carbs");
    const prevAvgFat = avg(prevDays, "fat");

    const daysLogged = Object.keys(byDate).length;
    const prevDaysLogged = Object.keys(prevByDate).length;
    const adherence =
      daysLogged > 0 ? Math.round((daysLogged / rangeDays) * 100) : 0;

    // Sparkline series: daily values from logged days only, in
    // chronological order. We deliberately do NOT zero-pad missing
    // days because for an intake metric, a missing log day is "unknown
    // intake," not "ate zero." Plotting zero would invent data.
    //
    // Instead, the sparkline is GATED on sufficient data density (see
    // showSparklines below). Below the threshold the sparkline hides
    // entirely rather than render a misleading shape from too few
    // points anchored to logged days. ≥7 logged days AND ≥50%
    // adherence is the floor at which the trend is robust enough to
    // visualise.
    const sortedDates = Object.keys(byDate).sort((a, b) => a.localeCompare(b));
    const caloriesSparkline = sortedDates.map((d) => byDate[d].cal);
    const proteinSparkline = sortedDates.map((d) => byDate[d].prot);
    const carbsSparkline = sortedDates.map((d) => byDate[d].carbs);
    const fatSparkline = sortedDates.map((d) => byDate[d].fat);

    // ≥7 days = one weekly cycle, the minimum for any trend signal to
    // average out. ≥50% = the point at which the unobserved days
    // could no longer plausibly invert the visible trend.
    const showSparklines = daysLogged >= 7 && adherence >= 50;

    // Period-over-period delta requires comparable, well-sampled
    // windows. The selection-bias risk on intake metrics is real:
    // a user logging 17/30 days isn't logging a random sample —
    // they're logging the days they cared about tracking, which
    // tends to skew the mean. Below 60% adherence in either window
    // the comparison can't be trusted, so suppress the chip rather
    // than assert a number that's mostly artifact.
    const showDelta =
      daysLogged >= 7 &&
      prevDaysLogged >= 7 &&
      daysLogged / rangeDays >= 0.6 &&
      prevDaysLogged / rangeDays >= 0.6;

    return {
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      prevAvgCalories,
      prevAvgProtein,
      prevAvgCarbs,
      prevAvgFat,
      adherence,
      daysLogged,
      prevDaysLogged,
      showSparklines,
      showDelta,
      caloriesSparkline,
      proteinSparkline,
      carbsSparkline,
      fatSparkline,
    };
  }, [meals, rangeDays]);

  const itemVariant = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  // Range-adaptive prefix for stat-card labels. The values inside
  // those cards are TOTALS for the selected window (e.g. "Volume" is
  // the sum across rangeDays, not a weekly average), so a static
  // "Weekly" prefix on a 1M view reads as a label bug. Adapt the
  // prefix to match the window the data actually covers.
  const periodLabel = (() => {
    switch (timeRange) {
      case "1W":
        return "Weekly";
      case "1M":
        return "Monthly";
      case "3M":
        return "3-Month";
      case "6M":
        return "6-Month";
      case "1Y":
        return "Annual";
      default:
        return "Weekly";
    }
  })();

  /* Hist5d cross-cut + Hist5 grill Q2 Stress 6 — section auto-hide
     two-tier rule. Only applies on the "all" filter; per-sport
     filtered tabs always render their section (the user explicitly
     chose that sport, so CTA + empty-state belong there).

       Tier 1: lifetime=0 AND window=0 → suppress entire section
                (silent for users who don't use this sport)
       Tier 2: lifetime>0 AND window=0 → section header + inline
                "No X in this period" note (returning user, dormant
                this window)
       Tier 3: window>0 → full content (unchanged) */
  const runningHasLifetime = lifetimeTotals.runCount > 0;
  const runningHasWindow = runs.length > 0;
  const liftingHasLifetime = lifetimeTotals.liftCount > 0;
  const liftingHasWindow = liftingData.liftCount > 0;
  const nutritionHasLifetime = lifetimeTotals.daysLogged > 0;
  const nutritionHasWindow = nutrition.avgCalories > 0;

  /* Hist5b — sport-filtered tabs dropped; sections live as scroll
     anchors inside the Analytics tab now. Tier-1 suppression
     applies when the user is on Analytics (it never applied to
     dedicated sport tabs even before — those got dropped, not
     re-routed). */
  const showRunningSection = runningHasLifetime || runningHasWindow;
  const showLiftingSection = liftingHasLifetime || liftingHasWindow;
  const showNutritionSection = nutritionHasLifetime || nutritionHasWindow;

  const renderRunningEmptyNote = runningHasLifetime && !runningHasWindow;
  const renderLiftingEmptyNote = liftingHasLifetime && !liftingHasWindow;
  const renderNutritionEmptyNote = nutritionHasLifetime && !nutritionHasWindow;

  /* True cold-start: the user has never logged a run, lift, or meal, so
     every sport section is Tier-1 suppressed. Rather than show a wall of
     zeroed rings (PeriodOverview) plus a redundant "PI appears later" strip,
     render ONE calm card that sets the expectation. The moment anything is
     logged, lifetime>0 flips this off and the normal analytics return. */
  const isAnalyticsColdStart =
    !showRunningSection && !showLiftingSection && !showNutritionSection;

  return (
    <motion.div
      {...pullBindProps}
      className="space-y-4 pt-2"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.06 } },
      }}
    >
      <motion.header variants={itemVariant}>
        <h1 className="text-lg font-extrabold text-foreground">Analytics</h1>
      </motion.header>

      {/* Hist4: small refresh indicator while the pull-to-refresh
          gesture is in flight. aria-live polite so screen readers
          announce the transient state without interrupting. */}
      {pullRefreshing && (
        <div
          className="flex justify-center py-1 text-xs text-muted-foreground"
          aria-live="polite"
        >
          Refreshing…
        </div>
      )}

      {/* Hist4: sustained-offline notice (30s threshold). Additive to
          the global Layout banner — surfaces only after the disconnect
          has lasted 30s and clarifies that History reads from the
          Firestore local cache while offline. */}
      <HistoryOfflineBanner />

      <motion.div variants={itemVariant}>
        <FilterPills
          filter={filter}
          setFilter={(next) => {
            setFilter(next);
            trackHistoryEvent("history_tab_selected", {
              tab: next as HistoryTab,
            });
          }}
        />
      </motion.div>

      <Suspense
        fallback={
          <div className="py-8 text-center text-muted-foreground text-sm animate-pulse">
            Loading analytics...
          </div>
        }
      >
        {filter === "badges" ? (
          <BadgeGrid />
        ) : filter === "prs" ? (
          <SectionErrorBoundary sectionName="prs-tab">
            <PRsTab
              runningPRs={runningPRs}
              lifetimePRs={liftingData.lifetimePRs}
              recentLiftPRs={liftingData.recentLiftPRs}
              hasAnyLifetimeRun={lifetimeTotals.runCount > 0}
              hasAnyLifetimeWorkout={lifetimeTotals.liftCount > 0}
            />
          </SectionErrorBoundary>
        ) : (
          <>
            {/* Hist6 — PI hero pinned to the top, range-independent
              ("this week"). The TimeRange control below scopes only the
              historical body (PeriodOverview + sport sections), so changing
              the range never moves the hero — the two mental models
              (current form vs adjustable history) are separated spatially.
              Suppressed in cold-start: the "No analytics yet" card below
              stands in until the first session is logged. Deep-links to
              /history#performance scroll to this section's anchor. */}
            {filter === "analytics" && !isAnalyticsColdStart && (
              <SectionErrorBoundary sectionName="performance-section">
                <PerformanceSection />
              </SectionErrorBoundary>
            )}

            <TimeRangePills selected={timeRange} onChange={setTimeRange} />

            {/* Hist5b pin 1 — sticky anchor chip row. Only renders on
              the Analytics tab AND only when there are 2+ sections
              to jump between (single-section users don't need an
              anchor menu — they ARE always on the only chip). */}
            {/* Hist5 PR 7b follow-up: removed the sticky AnalyticsAnchorChips
              row. Three pill rows stacked above the content (Tabs +
              TimeRange + sticky chips) read as chrome-heavy on iPhone,
              AND the chip row's `backdrop-blur-md` + `position:
              sticky` inside framer-motion's transformed motion.div was
              choking iOS Safari scroll. Reference apps (Strava Stats,
              Hevy Stats, NRC) navigate analytics by single scroll,
              not by anchor chips. The chip set was a recovery of
              affordance lost when sport-filtered tabs dropped — users
              who navigated by sport can still see each section's
              sport-coded header inline as they scroll. */}

            {/* Loading — always show a skeleton while the run/workout/meal
                queries resolve, INCLUDING for eventual cold-start users.
                Previously the cold-start card was gated on `!dataLoading`
                while the skeleton was nested under `!isAnalyticsColdStart`,
                so the `dataLoading && isAnalyticsColdStart` window (a fresh
                user's first Analytics load) rendered NOTHING — a blank tab.
                Splitting the three states keeps them mutually exclusive and
                exhaustive: loading → skeleton, then cold-start → card, else
                → overview. */}
            {filter === "analytics" && dataLoading && (
              <div className="p-4 rounded-2xl bg-card space-y-3">
                <Skeleton className="h-3 w-20" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              </div>
            )}

            {/* Cold-start: one calm expectation-setting card instead of a
                wall of zeroed rings + redundant PI strip. */}
            {filter === "analytics" && !dataLoading && isAnalyticsColdStart && (
              <EmptyState
                icon={LineChart}
                accent={THEME.brand}
                headline="No analytics yet"
                sub="Log a workout, run, or meal and your trends — volume, pace, calories and your Performance Index — will show up here."
                action={{ label: "Start a workout", href: "/program" }}
              />
            )}

            {filter === "analytics" &&
              !dataLoading &&
              !isAnalyticsColdStart && (
                <PeriodOverview
                  runCount={runningTotals.runCount}
                  runDistance={runningTotals.runDistance}
                  liftCount={liftingData.liftCount}
                  liftVolume={liftingData.liftVolume}
                  avgCalories={nutrition.avgCalories}
                  nutritionAdherence={nutrition.adherence}
                  timeRange={timeRange}
                  rangeDays={rangeDays}
                />
              )}

            {showRunningSection && filter === "analytics" && (
              <section id="analytics-running" aria-label="Running analytics">
                <SectionLabel className="mt-6 mb-2 text-running">
                  Running
                </SectionLabel>
                {dataLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                ) : renderRunningEmptyNote ? (
                  <p className="text-xs text-muted-foreground italic px-1">
                    No runs in this period
                  </p>
                ) : runs.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-card flex items-center gap-3 card-shadow">
                    <Footprints className="size-5 shrink-0 text-running" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Complete your first run to see running analytics here
                      </p>
                    </div>
                    <Link
                      to="/run"
                      className={buttonClasses({
                        variant: "sport",
                        className: "shrink-0",
                      })}
                    >
                      Start Run
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <StatCard
                        label={`${periodLabel} Distance`}
                        value={formatDistance(runningTotals.runDistance)}
                        unit="km"
                        direction="up-good"
                        sparklineData={runningTotals.distanceSparkline}
                        accentColor={THEME.running}
                      />
                      <StatCard
                        label="Avg Pace"
                        value={
                          runningTotals.avgPace
                            ? Math.floor(runningTotals.avgPace / 60) +
                              ":" +
                              (runningTotals.avgPace % 60)
                                .toString()
                                .padStart(2, "0")
                            : "--:--"
                        }
                        unit="/km"
                        direction="down-good"
                        sparklineData={runningTotals.paceSparkline}
                        accentColor={THEME.running}
                      />
                    </div>
                    {/* Hist5b PR 7a — Running PRs migrated off Analytics
                      to the dedicated PRs tab (Tier 2 lifetime
                      contract). Tap the PRs tab in the top filter
                      to access them. */}
                    <ShoeMileageSection />
                    <RunningHistorySection />
                  </>
                )}
              </section>
            )}

            {showLiftingSection && filter === "analytics" && (
              <section id="analytics-lifting" aria-label="Lifting analytics">
                <SectionLabel className="mt-6 mb-2 text-lifting">
                  Lifting
                </SectionLabel>
                {dataLoading ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-24 w-full rounded-xl" />
                      <Skeleton className="h-24 w-full rounded-xl" />
                    </div>
                    <ChartSkeleton />
                  </div>
                ) : renderLiftingEmptyNote ? (
                  <p className="text-xs text-muted-foreground italic px-1">
                    No workouts in this period
                  </p>
                ) : liftingData.liftCount === 0 ? (
                  <div className="p-4 rounded-2xl bg-card flex items-center gap-3 card-shadow">
                    <Trophy className="size-5 shrink-0 text-lifting" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">
                        Log a workout to see your lifting analytics here
                      </p>
                    </div>
                    <Link
                      to="/program"
                      className={buttonClasses({
                        variant: "primary",
                        className: "shrink-0",
                      })}
                    >
                      Start Lift
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <StatCard
                        label={`${periodLabel} Volume`}
                        value={formatVolume(liftingData.liftVolume).value}
                        unit={formatVolume(liftingData.liftVolume).unit}
                        delta={buildDelta(
                          liftingData.liftVolume,
                          liftingData.prevLiftVolume
                        )}
                        direction="up-good"
                        sparklineData={liftingData.volumeSparkline}
                        accentColor={THEME.lifting}
                      />
                      <StatCard
                        label={`${periodLabel} Sessions`}
                        value={String(liftingData.liftCount)}
                        delta={buildDelta(
                          liftingData.liftCount,
                          liftingData.prevLiftCount
                        )}
                        direction="up-good"
                        sparklineData={liftingData.sessionsSparkline}
                        accentColor={THEME.lifting}
                      />
                    </div>
                    <SectionErrorBoundary sectionName="volume-chart">
                      <VolumeChart
                        data={liftingData.weeklyVolume}
                        accentColor={THEME.lifting}
                        granularity={liftingData.weeklyVolumeGranularity}
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="muscle-heatmap">
                      <MuscleHeatMap
                        data={liftingData.muscleData}
                        accentColor={THEME.lifting}
                        recovery={muscleRecovery}
                      />
                    </SectionErrorBoundary>
                    {/* Hist5b PR 7a — Lift PRs migrated off Analytics to the
                  dedicated PRs tab (Tier 2 lifetime contract). The
                  prior surface was a 7-day-hardcoded view that
                  disagreed with the section's TimeRange-scoped
                  framing; the new home gives PRs their true
                  lifetime semantics. Tap the PRs tab in the top
                  filter to access them. */}
                  </>
                )}
              </section>
            )}

            {showNutritionSection && filter === "analytics" && (
              <section
                id="analytics-nutrition"
                aria-label="Nutrition analytics"
              >
                <SectionLabel
                  className="mt-6 mb-2"
                  style={{ color: THEME.semantic.nutrition }}
                >
                  Nutrition
                </SectionLabel>
                {dataLoading ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Skeleton className="h-24 w-full rounded-xl" />
                      <Skeleton className="h-24 w-full rounded-xl" />
                    </div>
                    <ChartSkeleton />
                  </div>
                ) : renderNutritionEmptyNote ? (
                  <>
                    <p className="text-xs text-muted-foreground italic px-1">
                      No meals logged in this period
                    </p>
                    {/* TrendWeight stays visible — weight is independent
                      of meal logging. Returning users get their weight
                      chart even when nutrition is dormant for the
                      selected window. */}
                    <SectionErrorBoundary sectionName="trend-weight">
                      <TrendWeight />
                    </SectionErrorBoundary>
                  </>
                ) : nutrition.avgCalories === 0 ? (
                  <>
                    <div className="p-4 rounded-2xl bg-card flex items-center gap-3 card-shadow">
                      <UtensilsCrossed
                        className="size-5 shrink-0"
                        style={{ color: THEME.semantic.nutrition }}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">
                          Log meals to see your nutrition trends here
                        </p>
                      </div>
                      <Link
                        to="/food"
                        className={buttonClasses({
                          variant: "nutrition",
                          className: "shrink-0",
                        })}
                      >
                        Log Meal
                      </Link>
                    </div>
                    {/* Weight tracking is independent of meal logging, so we
                      keep TrendWeight visible even when there's no nutrition
                      data yet — a user logging weight without meals still
                      gets a chart. */}
                    <SectionErrorBoundary sectionName="trend-weight">
                      <TrendWeight />
                    </SectionErrorBoundary>
                  </>
                ) : (
                  <>
                    {/* Adherence row — first-class signal, not a footnote.
                  For a sparse logger this IS the headline metric: the
                  averages below can't be trusted until logging is more
                  consistent. For a consistent logger it's quiet
                  reassurance. Tone scales with adherence:
                    ≥80%   → green (data is reliable)
                    50–80% → muted (data is decent)
                    <50%   → amber (averages below are under-sampled) */}
                    {(() => {
                      const adh = nutrition.adherence;
                      const tone =
                        adh >= 80
                          ? { color: THEME.success, bg: `${THEME.success}1A` }
                          : adh >= 50
                            ? {
                                color: "var(--muted-foreground)",
                                bg: "transparent",
                              }
                            : {
                                color: THEME.amberLight,
                                bg: `${THEME.amberLight}1A`,
                              };
                      return (
                        <div
                          className="flex items-center justify-between mt-2 px-3 py-2 rounded-xl"
                          style={{ background: tone.bg }}
                        >
                          <p className="text-xs text-foreground">
                            Logged{" "}
                            <span className="font-semibold font-mono tabular-nums">
                              {nutrition.daysLogged}
                            </span>{" "}
                            of{" "}
                            <span className="font-mono tabular-nums">
                              {rangeDays}
                            </span>{" "}
                            days
                          </p>
                          <p
                            className="text-xs font-semibold font-mono tabular-nums"
                            style={{ color: tone.color }}
                          >
                            {adh}%
                          </p>
                        </div>
                      );
                    })()}
                    {/* Hist5c pin 9 — sample-size guard. The warning misfires at
                  extreme sparsity: at 1W with 2/7 days logged (28%) the
                  warning fires AND the user is in cold-start mode where
                  the meta-warning adds noise rather than signal. Require
                  ≥5 logged days before the "too few logged days" message
                  appears — below that, the user already understands they
                  haven't logged much. */}
                    {nutrition.adherence < 50 && nutrition.daysLogged >= 5 && (
                      <p className="text-caption text-warning -mt-1 italic">
                        Averages below are based on too few logged days to be
                        reliable.
                      </p>
                    )}
                    {/* Top row: calories + protein. Sparkline + delta both
                  conditionally suppressed when sample is too thin (see
                  showSparklines / showDelta in the nutrition memo). */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <StatCard
                        label="Avg Calories"
                        value={nutrition.avgCalories.toLocaleString()}
                        unit="kcal/day"
                        delta={
                          nutrition.showDelta
                            ? buildDelta(
                                nutrition.avgCalories,
                                nutrition.prevAvgCalories
                              )
                            : null
                        }
                        direction={calorieDirection}
                        target={
                          macroTargets?.calories
                            ? `target ${macroTargets.calories.toLocaleString()} kcal`
                            : undefined
                        }
                        sparklineData={
                          nutrition.showSparklines
                            ? nutrition.caloriesSparkline
                            : undefined
                        }
                        accentColor={THEME.semantic.nutrition}
                      />
                      <StatCard
                        label="Protein"
                        value={nutrition.avgProtein.toString()}
                        unit="g/day"
                        delta={
                          nutrition.showDelta
                            ? buildDelta(
                                nutrition.avgProtein,
                                nutrition.prevAvgProtein
                              )
                            : null
                        }
                        direction="up-good"
                        target={
                          macroTargets?.protein
                            ? `target ${macroTargets.protein}g`
                            : undefined
                        }
                        sparklineData={
                          nutrition.showSparklines
                            ? nutrition.proteinSparkline
                            : undefined
                        }
                        accentColor={THEME.macros.protein}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <StatCard
                        label="Carbs"
                        value={nutrition.avgCarbs.toString()}
                        unit="g/day"
                        delta={
                          nutrition.showDelta
                            ? buildDelta(
                                nutrition.avgCarbs,
                                nutrition.prevAvgCarbs
                              )
                            : null
                        }
                        direction={calorieDirection}
                        target={
                          macroTargets?.carbs
                            ? `target ${macroTargets.carbs}g`
                            : undefined
                        }
                        sparklineData={
                          nutrition.showSparklines
                            ? nutrition.carbsSparkline
                            : undefined
                        }
                        accentColor={THEME.macros.carbs}
                      />
                      <StatCard
                        label="Fat"
                        value={nutrition.avgFat.toString()}
                        unit="g/day"
                        delta={
                          nutrition.showDelta
                            ? buildDelta(nutrition.avgFat, nutrition.prevAvgFat)
                            : null
                        }
                        direction={calorieDirection}
                        target={
                          macroTargets?.fat
                            ? `target ${macroTargets.fat}g`
                            : undefined
                        }
                        sparklineData={
                          nutrition.showSparklines
                            ? nutrition.fatSparkline
                            : undefined
                        }
                        accentColor={THEME.macros.fat}
                      />
                    </div>

                    <MacroDistribution
                      protein={nutrition.avgProtein}
                      carbs={nutrition.avgCarbs}
                      fat={nutrition.avgFat}
                    />

                    <SectionErrorBoundary sectionName="trend-weight">
                      <TrendWeight />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="calorie-balance">
                      <CalorieBalanceChart meals={meals} />
                    </SectionErrorBoundary>
                  </>
                )}
              </section>
            )}

            {filter === "analytics" &&
              !dataLoading &&
              lifetimeTotals.runCount +
                lifetimeTotals.liftCount +
                lifetimeTotals.daysLogged >
                0 && (
                <section id="analytics-lifetime" aria-label="Lifetime totals">
                  <SectionLabel className="mt-6 mb-2">Lifetime</SectionLabel>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-3 rounded-2xl bg-card text-center card-shadow">
                      <Footprints className="size-4 mx-auto mb-1.5 text-running" />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {lifetimeTotals.runKm >= 1000
                          ? (lifetimeTotals.runKm / 1000).toFixed(1) + "k"
                          : Math.round(lifetimeTotals.runKm).toLocaleString()}
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        km · {lifetimeTotals.runCount} runs
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-card text-center card-shadow">
                      <Trophy className="size-4 mx-auto mb-1.5 text-lifting" />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {formatVolume(lifetimeTotals.liftVolume).value}
                        {formatVolume(lifetimeTotals.liftVolume).unit && (
                          <span className="text-xs font-bold ml-0.5">
                            {formatVolume(lifetimeTotals.liftVolume).unit}
                          </span>
                        )}
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        lifted · {lifetimeTotals.liftCount} sessions
                      </p>
                    </div>
                    <div className="p-3 rounded-2xl bg-card text-center card-shadow">
                      <UtensilsCrossed
                        className="size-4 mx-auto mb-1.5"
                        style={{ color: THEME.semantic.nutrition }}
                      />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {lifetimeTotals.daysLogged.toLocaleString()}
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        days logged
                      </p>
                    </div>
                  </div>
                </section>
              )}
          </>
        )}
      </Suspense>
    </motion.div>
  );
}
