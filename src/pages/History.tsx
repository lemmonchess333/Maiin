import { useMemo, useEffect, useRef, useCallback, Suspense } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import PageShell from "@/components/ui/PageShell";
import { pageItemVariant } from "@/components/ui/pageMotion";
import { useMeals } from "@/hooks/useMeals";
import { useMealsInRange } from "@/hooks/useMealsInRange";
import { useLifetimeMealStats } from "@/hooks/useLifetimeMealStats";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useStallWatch } from "@/hooks/useStallWatch";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useWorkouts, workoutTonnageKg } from "@/hooks/useWorkouts";
import { runningPageInsight } from "@/lib/runInsights";
import { focusLabel } from "@/features/program/trainingBlock";
import type { PrimaryGoal } from "@/features/program/programTypes";
import { useLifetimeRunStats } from "@/hooks/useLifetimeRunStats";
import { useAuth, useUid } from "@/lib/auth";
import { useEffectiveTargets } from "@/hooks/useEffectiveTargets";
import { THEME } from "@/lib/theme";
import { adherenceTone } from "@/lib/adherenceTone";
import { buildDelta } from "@/lib/deltaFormat";
import TimeRangePills from "@/components/analytics/TimeRangePills";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import SectionHeading from "@/components/ui/SectionHeading";
import { Button } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import PeriodSummaryCard, {
  type SummaryFigure,
} from "@/components/analytics/PeriodSummaryCard";
import PerformanceOverviewCard from "@/components/analytics/PerformanceOverviewCard";
import AnalyticsTrends from "@/components/analytics/AnalyticsTrends";
import AnalyticsMuscles from "@/components/analytics/AnalyticsMuscles";
import TrainingWeeksCard from "@/components/analytics/TrainingWeeksCard";
import {
  liftingBins,
  liftingFigures,
  runningBins,
  runningFigures,
} from "@/lib/trainingWeeks";
import LiftProgressCard from "@/components/analytics/LiftProgressCard";
import MuscleVolumeCard from "@/components/analytics/MuscleVolumeCard";
import RunPaceCard from "@/components/analytics/RunPaceCard";
import FastestKilometresCard from "@/components/analytics/FastestKilometresCard";
import WeightRateCard from "@/components/analytics/WeightRateCard";
import FoodDaysCard from "@/components/analytics/FoodDaysCard";
import { foodDaysReading } from "@/lib/foodDays";
import { useDailyTargetsInRange } from "@/hooks/useDailyTargetsInRange";
import {
  bodyLine,
  foodLine,
  goDeeperLines,
  liftingLine,
  runningLine,
} from "@/components/analytics/goDeeperLines";
import { currentWeightRate } from "@/utils/weightTrend";
import { attestedWeeklyRateKg } from "@/lib/goalWeightPlan";
import {
  nutritionRows,
  predictionRow,
  weightRow,
  type TrendRow,
} from "@/components/analytics/trendRows";
import {
  countChange,
  distanceChange,
  previousRangeLabel,
  rollingRangeLabel,
  volumeChange,
} from "@/lib/periodSummary";
import { useBodyweightTrend } from "@/hooks/useBodyweightTrend";
import { predictedRaceTimesFromFitness } from "@/lib/runPaces";
import StatCard from "@/components/analytics/StatCard";
import WorkoutHistoryList from "@/components/workout/WorkoutHistoryList";
import SectionEmptyCTA from "@/components/analytics/SectionEmptyCTA";
import AnalyticsGoDeeper, {
  AnalyticsBackRow,
  type AnalyticsPage,
} from "@/components/analytics/AnalyticsGoDeeper";
import RacePredictionsCard from "@/components/analytics/RacePredictionsCard";
import TrainingLoadCard from "@/components/analytics/TrainingLoadCard";
import { useTrainingLoadSeries } from "@/hooks/useTrainingLoadSeries";
import { distanceLabel } from "@/lib/runLabels";
import { distanceIn, distanceUnitLabel } from "@/lib/distanceUnits";
import { useDistanceUnit } from "@/hooks/useDistanceUnit";
import { Footprints, Trophy, UtensilsCrossed, LineChart } from "lucide-react";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Skeleton, ChartSkeleton } from "@/components/LoadingSkeleton";
import {
  formatVolume,
  formatDistance,
  abbreviateK,
  formatDayMonth,
} from "@/utils/formatters";
import {
  track as trackHistoryEvent,
  type HistoryRange,
  type HistoryTab,
} from "@/lib/historyAnalytics";
import HistoryOfflineBanner from "@/components/analytics/HistoryOfflineBanner";
/* AnalyticsAnchorChips removed PR 7b follow-up — see note inline
   below where it would have rendered. */
import { getWeeklyRunTarget } from "@/lib/scheduleUtils";
import {
  historyRange,
  liftFigures,
  liftingPageFigures,
  nutritionFigures,
  periodSummaryFigures,
  runRecordRows,
} from "@/lib/historyFigures";
import { localDateString, parseLocalDate } from "@/lib/dateHelpers";
import {
  computeMuscleRecovery,
  hitsFromWorkoutDocs,
  recoveryForHeatMapGroups,
  RECOVERY_LOOKBACK_DAYS,
} from "@/lib/muscleRecovery";

const MuscleHeatMap = lazyRetry(
  () => import("@/components/analytics/MuscleHeatMap")
);
const MacroDistribution = lazyRetry(
  () => import("@/components/analytics/MacroDistribution")
);
const ShoeMileageSection = lazyRetry(
  () => import("@/components/run/ShoeMileageSection")
);
/* Hist5b pin 3 — PerformanceTab is now lazy-loaded INSIDE
   PerformanceSection (the inline accordion's expanded body), not
   rendered as a top-level tab. The dedicated `performance` tab was
   removed; deep-links to /history#performance route to the section
   anchor inside Analytics. */
const PerformanceSection = lazyRetry(
  () => import("@/components/analytics/PerformanceSection")
);
import Card from "@/components/ui/Card";
import { CALORIE_UNIT } from "@/utils/formatNutrition";

const PRsTab = lazyRetry(() => import("@/components/analytics/PRsTab"));
const BadgeGrid = lazyRetry(() =>
  import("@/features/streaks/BadgeGrid").then((m) => ({ default: m.BadgeGrid }))
);
const TrendWeight = lazyRetry(() =>
  import("@/components/progress/TrendWeight").then((m) => ({
    default: m.TrendWeight,
  }))
);
const CalorieBalanceChart = lazyRetry(
  () => import("@/components/progress/CalorieBalanceChart")
);
const ProgressPhotos = lazyRetry(
  () => import("@/components/progress/ProgressPhotos")
);

/* Hist5b pin 1 + 3 + 4 — tab consolidation 6→3 after the
   Performance fold (PR 6) + PRs tab introduction (PR 7a).
   Sport-filtered tabs were dropped in PR 5a; the Performance tab
   folded into Analytics in PR 6. "All" was renamed "analytics" to
   match the page's frame commitment (Hist5a).

   Tabs are Analytics + PRs + Badges. The third slot briefly held a
   MILESTONES chronology; do not bring it back. Its dominant entry
   kind was `lift-pr`, which the PRs tab already shows as a
   current-bests table and `ExerciseHistory` — one tap down the
   chevron on every PR row — already shows as a per-lift
   progression chart, and the PRs tab carries "Recent bests · Last
   30 days" on top of that. A third, flatter projection of the same
   lifts is not a third role.

   Its shape also failed in both directions: on day one every first
   log is a "first logged best", so it floods with rows mirroring
   the PR list, and in steady state new PRs get rare and it thins
   to a few rows a month.

   Nothing was orphaned — every non-PR entry kind already has a
   badge (`first-workout` → `first_step`, `block-complete` →
   `programme_complete`, `race-complete` → the distance badges),
   and its `badge` entries were badges listed twice on one screen,
   once in the chronology and again in the grid below it. */
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
  /* "badges" is the live tab again, so the redirect points the other way
     now: bookmarks saved while the third tab was the Milestones
     chronology land on the badge collection. Both values have been the
     canonical one at some point, which is exactly why the map has to keep
     an entry rather than silently 404 one of them. */
  milestones: "badges",
};

/* The section anchors Performance used to be scrolled to. Home's
   Performance row still links to `#performance`, and so do older
   bookmarks; each now opens the Performance page. */
const PERFORMANCE_ANCHORS = new Set([
  "performance",
  "performance-expanded",
  "analytics-performance",
  "analytics-performance-detail",
]);

/* DS3: the Analytics tab is a short overview with pages behind it,
   chosen by `?view=`. Absent or unknown is the overview. Four pages hold
   one discipline's charts each, which used to stack into a single scroll
   about 4,700 px tall on a phone; the fifth, Performance, holds the
   index's gauge, chart, insights and training load, opened from the
   overview's Performance card and from Home. */
type AnalyticsView = "overview" | AnalyticsPage | "performance";
const ANALYTICS_VIEWS: AnalyticsView[] = [
  "lifting",
  "running",
  "body",
  "food",
  "performance",
];

/* Pre-Hist5 `?tab=` values that named a discipline land on its page now,
   rather than on the top of one long scroll. */
const LEGACY_TAB_TO_VIEW: Partial<Record<string, AnalyticsView>> = {
  running: "running",
  lifting: "lifting",
  nutrition: "food",
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

/**
 * "runs", "runs and meals", "runs, workouts and meals".
 *
 * The stall notice names the stuck source because that is what makes a
 * recurrence diagnosable — but the user reads this sentence, so it has
 * to be a sentence. `useStallWatch` returns sorted internal keys, which
 * happen to be readable here; anything less obvious would need a label
 * map rather than being printed raw.
 */
function formatSourceList(sources: string[]): string {
  if (sources.length <= 1) return sources[0] ?? "data";
  return `${sources.slice(0, -1).join(", ")} and ${sources[sources.length - 1]}`;
}

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

  /* Which Analytics page is open. A legacy `?tab=running` resolves to its
     page on this very render, before the reconciliation below rewrites
     the URL, so the overview never flashes first. */
  const viewFromUrl = searchParams.get("view");
  /* Read here rather than after the reconciliation below rewrites it, so
     a `#performance` link opens on the Performance page, not on the
     overview for a frame. */
  const hashOpensPerformance =
    typeof window !== "undefined" &&
    PERFORMANCE_ANCHORS.has(window.location.hash.replace(/^#/, ""));
  const view: AnalyticsView = ANALYTICS_VIEWS.includes(
    viewFromUrl as AnalyticsView
  )
    ? (viewFromUrl as AnalyticsView)
    : ((tabFromUrl ? LEGACY_TAB_TO_VIEW[tabFromUrl] : undefined) ??
      (hashOpensPerformance ? "performance" : "overview"));
  /* A push, not a replace: the back gesture on a page returns to the
     overview, the way a pushed screen would. */
  const setView = useCallback(
    (next: AnalyticsView) => {
      setSearchParams((params) => {
        const updated = new URLSearchParams(params);
        if (next === "overview") updated.delete("view");
        else updated.set("view", next);
        return updated;
      });
    },
    [setSearchParams]
  );
  // A page opens at its top. Skipped on mount, where the browser owns
  // the scroll position.
  const viewMountedRef = useRef(false);
  useEffect(() => {
    if (!viewMountedRef.current) {
      viewMountedRef.current = true;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [view]);

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
       new contract once they arrive. A value that named a page —
       a discipline, or Performance — opens that page. */
    if (tabFromUrl && LEGACY_TAB_REDIRECTS[tabFromUrl]) {
      const legacyView = LEGACY_TAB_TO_VIEW[tabFromUrl];
      if (legacyView) {
        // One update: two setSearchParams calls in a tick overwrite
        // each other.
        setSearchParams(
          (params) => {
            const updated = new URLSearchParams(params);
            updated.delete("tab");
            updated.set("view", legacyView);
            return updated;
          },
          { replace: true }
        );
      } else {
        setFilter(LEGACY_TAB_REDIRECTS[tabFromUrl]);
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
      /* `#performance` (Home's Performance row, PR #635) and the other
         Performance anchors named a section of one long scroll; the
         section is a page now. The render above already opened it; this
         moves that into the URL, which drops the hash. Skipped when a
         legacy `?tab=` rewrite is in flight: two updates in one tick
         overwrite each other, and that rewrite names its own page.
         Every other hash was a one-shot tab hint, and is stripped. */
      const currentHash = window.location.hash.replace(/^#/, "");
      const legacyRewrite = !!(tabFromUrl && LEGACY_TAB_REDIRECTS[tabFromUrl]);
      if (
        PERFORMANCE_ANCHORS.has(currentHash) &&
        !viewFromUrl &&
        !legacyRewrite
      ) {
        setSearchParams(
          (params) => {
            const updated = new URLSearchParams(params);
            updated.set("view", "performance");
            return updated;
          },
          { replace: true }
        );
      } else {
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
    failed: runsError,
    refresh: refreshRuns,
  } = useRunningStats(rangeDays);
  // Lifetime totals below need EVERY workout, not just the newest 50.
  const { workouts, loading: workoutsLoading } = useWorkouts({
    coverage: "complete",
  });
  // Training-load curve feed — self-fetching (needs warmup history beyond
  // the visible range, so it can't reuse the range-scoped runs above).
  const trainingLoad = useTrainingLoadSeries(rangeDays);
  const uid = useUid();
  const { meals, loading: mealsLoading } = useMeals();
  /* The nutrition section reads its OWN range-scoped query rather than
     slicing the 400-doc `useMeals` window, which silently truncated 3M / 6M
     / 1Y for anyone logging more than a couple of meals a day. `* 2` because
     every stat card carries a delta against the preceding comparable period,
     so the fetch has to cover both halves. */
  const { meals: rangeMeals, loading: rangeMealsLoading } = useMealsInRange(
    uid,
    rangeDays * 2
  );
  const lifetimeRuns = useLifetimeRunStats();
  const lifetimeMeals = useLifetimeMealStats();
  const { profile } = useAuth();
  /* The range the pill names, read once for every figure below: its
     window, the range before it, and the days an account younger than
     the range has had (`historyFigures`). Such an account has nothing in
     the range before it to compare with. */
  const range = useMemo(
    () => historyRange(rangeDays, { createdAt: profile?.createdAt }),
    [rangeDays, profile?.createdAt]
  );
  const { startKey, joinedInRange } = range;
  const unit = useDistanceUnit();
  /**
   * The cross-cutting gate. Only the surfaces that genuinely SPAN all
   * three disciplines may use it — the period summary counts runs and
   * lifts together, and the cold-start decision needs to know that all
   * three came back empty.
   *
   * The per-sport sections below each gate on their OWN hook instead.
   * They used to share this flag, which meant the slowest of the three
   * held every section: a user whose meals query was slow (it pages 400
   * docs) sat looking at skeletons under "Running" and "Lifting" whose
   * data had already arrived. Worse as a failure mode than as a
   * slowdown — one listener that never settles blanks the entire tab
   * with no partial content and no recovery affordance, which is what
   * "analytics doesn't load" looks like from the outside.
   *
   * Splitting them means a stuck discipline costs you that discipline,
   * not the page.
   */
  const dataLoading =
    runsLoading || workoutsLoading || mealsLoading || rangeMealsLoading;

  /* Names whichever reads are still outstanding after 15s. Purely
     diagnostic — it never cancels or fakes a result, because a slow read
     on a bad connection is a wait, not a fault. See useStallWatch. */
  const stalledSources = useStallWatch(
    {
      runs: runsLoading,
      workouts: workoutsLoading,
      meals: mealsLoading,
    },
    15_000
  );

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

  /* The nutrition StatCards' "target N" reference line.
   *
   * This read `profile.macroTargets` — a field written ONCE, by Onboarding,
   * and by nothing since. The goal-weight recipe
   * (`buildGoalWeightPersistPayload`) writes `targetCalories` and the three
   * gram fields but not this one, and neither does the weigh-in patch. So a
   * user who onboarded at maintenance and later set a goal weight kept
   * seeing their onboarding-day plan here — "target 2,650 kcal" against a
   * plan that had been 2,100 for months, widening with every goal change,
   * weigh-in and adaptive retune.
   *
   * Reads the same effective targets Home and Food render, so the number on
   * this page cannot disagree with the number on those. */
  const effectiveTargets = useEffectiveTargets();
  const macroTargets = {
    calories: effectiveTargets.finalTarget,
    protein: effectiveTargets.protein,
    carbs: effectiveTargets.carbs,
    fat: effectiveTargets.fat,
  };

  // Lifetime totals — all-time aggregates shown only on the "All" tab,
  // pinned at the very bottom as a quiet "you've come this far" footer.
  /* Runs and meals each come from a one-shot whole-collection read, so
     records older than any window still count toward a total that claims to
     be lifetime. `useMeals` cannot serve this: it subscribes to the newest
     400 meal docs, so both meal figures would saturate there — silently,
     since a capped count looks exactly like a real one.

     Workouts still read `useWorkouts`. Whether that hook is bounded the
     same way is a separate question on a separate surface — not assumed
     either way here, and not fixed blind. */
  const lifetimeTotals = useMemo(() => {
    const liftVolume = workouts.reduce(
      (sum, workout) => sum + workoutTonnageKg(workout),
      0
    );
    return {
      runCount: lifetimeRuns.runCount,
      runKm: lifetimeRuns.totalDistanceM / 1000,
      liftCount: workouts.length,
      liftVolume,
      mealCount: lifetimeMeals.mealCount,
      daysLogged: lifetimeMeals.daysLogged,
    };
  }, [
    workouts,
    lifetimeMeals.mealCount,
    lifetimeMeals.daysLogged,
    lifetimeRuns.runCount,
    lifetimeRuns.totalDistanceM,
  ]);

  const runningTotals = useMemo(() => {
    const runCount = weeklyData.reduce((sum, week) => sum + week.runCount, 0);
    const runDistance = weeklyData.reduce(
      (sum, week) => sum + week.totalDistance,
      0
    );
    return { runCount, runDistance };
  }, [weeklyData]);

  /* The PRs tab's running records, from every run rather than the
     range's: all-time and last-30-days outdoor records, and indoor ones
     apart. `unit` too: the values are written in it. */
  const runningPRs = useMemo(
    () => runRecordRows(lifetimeRuns.runs, range, unit),
    [lifetimeRuns.runs, range, unit]
  );

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

  /* The range's sessions, kilograms and sets per muscle, the range
     before for the changes, and the PRs tab's lift records. */
  const liftingData = useMemo(
    () => liftFigures(workouts, range),
    [workouts, range]
  );

  /* Daily food across the range, out of the days this account has had
     in it. */
  const nutrition = useMemo(
    () => nutritionFigures(rangeMeals, range),
    [rangeMeals, range]
  );

  /* The read of every run has settled: the best-ever claims and the
     range before wait for it. */
  const allRunsKnown = !lifetimeRuns.loading && !lifetimeRuns.failed;

  /* DS3 period summary — the overview's first card. Sessions, kilograms
     and distance bar by bar across the range, and the range before it
     for the changes. */
  const periodSummary = useMemo(
    () =>
      periodSummaryFigures({
        range,
        workouts,
        windowRuns: runs,
        allRuns: lifetimeRuns.runs,
        allRunsKnown,
      }),
    [range, workouts, runs, lifetimeRuns.runs, allRunsKnown]
  );

  /* The Lifting page's reading of the range: each main lift's progress,
     the sets each muscle got a week against the range for the user's
     focus, the range's sets, and the weekly average the volume bars stand
     against. */
  const liftGoal = profile?.primaryGoal as PrimaryGoal | undefined;
  const liftingInsight = useMemo(
    () =>
      liftingPageFigures(workouts, range, {
        primaryGoal: liftGoal,
        bins: periodSummary.bins,
      }),
    [workouts, range, liftGoal, periodSummary.bins]
  );

  /* The Running page's reading of the range (`runningPageInsight`): pace
     by kind of run, best efforts, the longest run, time on the move and
     the weekly average. The best-ever claims wait for the one-shot read
     of every run; the function's header says why. */
  const runningInsight = useMemo(
    () => ({
      ...runningPageInsight({
        windowRuns: runs,
        allRuns: lifetimeRuns.runs,
        allRunsKnown,
        sinceKey: range.sinceKey,
        prevSinceKey: range.prevSinceKey,
        todayKey: range.todayKey,
        bins: periodSummary.bins,
      }),
      newSinceKey: range.newSinceKey,
    }),
    [runs, lifetimeRuns.runs, allRunsKnown, range, periodSummary.bins]
  );

  const summarySessions = liftingData.liftCount + runningTotals.runCount;
  const summaryFigures: SummaryFigure[] = [
    {
      metric: "sessions",
      value: String(summarySessions),
      unit: summarySessions === 1 ? "session" : "sessions",
      change: countChange(
        summarySessions,
        periodSummary.prevRunCount === null
          ? null
          : liftingData.prevLiftCount + periodSummary.prevRunCount
      ),
    },
    {
      metric: "volume",
      value:
        liftingData.liftVolume > 0
          ? formatVolume(liftingData.liftVolume).value
          : "0",
      unit: "kg lifted",
      change: volumeChange(liftingData.liftVolume, liftingData.prevLiftVolume),
    },
    {
      metric: "distance",
      value:
        runningTotals.runDistance > 0
          ? formatDistance(distanceIn(runningTotals.runDistance * 1000, unit))
          : "0",
      unit: `${distanceUnitLabel(unit)} run`,
      change: distanceChange(
        runningTotals.runDistance * 1000,
        periodSummary.prevRunM,
        unit
      ),
    },
  ];

  /* The overview's Trends: the measures that move, each with the page
     that charts it. Weight comes from the same trend read as the Body
     page's chart, so the row quotes the figure the chart draws. */
  const bodyweight = useBodyweightTrend();

  /* The Food page's day-by-day reading (`foodDays`): each finished day
     against the target it had that day, and protein over the trend
     weight. Hidden-number users get no protein per kg: with the protein
     figure beside it, it would give the weight away. */
  const { targets: dayTargets, loading: dayTargetsLoading } =
    useDailyTargetsInRange(uid, rangeDays);
  const foodDays = useMemo(
    () =>
      foodDaysReading({
        meals: rangeMeals,
        targets: dayTargets,
        sinceKey: range.sinceKey,
        todayKey: range.todayKey,
      }),
    [rangeMeals, dayTargets, range]
  );
  const latestTrendKg =
    bodyweight.points.length > 0
      ? bodyweight.points[bodyweight.points.length - 1].trend
      : null;
  /* Finished days only, as the card's other rows count them: the card
     says "Before today". */
  const proteinPerKg =
    !profile?.hideWeightNumber &&
    latestTrendKg !== null &&
    latestTrendKg > 0 &&
    foodDays.averageProtein !== null &&
    foodDays.averageProtein > 0
      ? foodDays.averageProtein / latestTrendKg
      : null;
  /* The card is drawn once all three reads are in. Each fills different
     rows, so drawn as they arrive, the target rows would push in above
     the weekend rows and the protein row would land last. */
  const foodDaysSettled =
    !rangeMealsLoading && !dayTargetsLoading && !bodyweight.loading;

  /* A live line on each Go deeper tile, from what its page shows. */
  const goDeeper = useMemo(
    () =>
      goDeeperLines({
        lifting: liftingLine(liftingInsight.progress),
        running: runningLine({
          pace: runningInsight.pace.rows,
          longest: runningInsight.longest,
          unit,
        }),
        body: bodyLine({
          kgPerWeek: currentWeightRate(bodyweight.points)?.kgPerWeek ?? null,
          unit: profile?.preferredWeightUnit === "lbs" ? "lbs" : "kg",
          hideNumber: !!profile?.hideWeightNumber,
        }),
        food: foodLine({
          daysLogged: nutrition.daysLogged,
          rangeDays: nutrition.days,
        }),
      }),
    [
      liftingInsight.progress,
      runningInsight.pace.rows,
      runningInsight.longest,
      unit,
      bodyweight.points,
      profile?.preferredWeightUnit,
      profile?.hideWeightNumber,
      nutrition.daysLogged,
      nutrition.days,
    ]
  );
  const targetCalories = effectiveTargets.finalTarget ?? 0;
  const targetProtein = effectiveTargets.protein ?? 0;
  const trendRows = useMemo(() => {
    const rows: TrendRow[] = [];
    const weight = weightRow({
      points: bodyweight.points,
      sinceKey: range.sinceKey,
      unit: profile?.preferredWeightUnit === "lbs" ? "lbs" : "kg",
      hideNumber: !!profile?.hideWeightNumber,
    });
    if (weight) rows.push(weight);
    rows.push(
      ...nutritionRows({
        daysLogged: nutrition.daysLogged,
        avgCalories: nutrition.avgCalories,
        avgProtein: nutrition.avgProtein,
        caloriesSeries: nutrition.caloriesSparkline,
        proteinSeries: nutrition.proteinSparkline,
        showSeries: nutrition.showSparklines,
        targetCalories,
        targetProtein,
      })
    );
    const fitness = profile?.runFitness ?? null;
    const times = predictedRaceTimesFromFitness(fitness);
    const prediction = predictionRow({
      tenKSeconds: times ? times["10k"] : null,
      source: fitness?.source,
    });
    if (prediction) rows.push(prediction);
    return rows;
  }, [
    bodyweight.points,
    range,
    profile?.preferredWeightUnit,
    profile?.hideWeightNumber,
    profile?.runFitness,
    nutrition,
    targetCalories,
    targetProtein,
  ]);

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
  /**
   * A failed runs read produces `runs: []` and `lifetimeRuns.runCount: 0`
   * — byte-identical to a user who has never run. Tier-1 suppression then
   * removes the Running section entirely, so the ONE surface that could
   * have told the user something went wrong is the surface that deletes
   * itself. Keeping the section visible on failure is what makes the
   * error reportable at all.
   */
  const runsFailed = runsError || lifetimeRuns.failed;
  const showRunningSection =
    runningHasLifetime || runningHasWindow || runsFailed;
  const showLiftingSection = liftingHasLifetime || liftingHasWindow;
  const showNutritionSection = nutritionHasLifetime || nutritionHasWindow;

  const renderRunningEmptyNote = runningHasLifetime && !runningHasWindow;
  const renderLiftingEmptyNote = liftingHasLifetime && !liftingHasWindow;
  const renderNutritionEmptyNote = nutritionHasLifetime && !nutritionHasWindow;

  /* True cold-start: the user has never logged a run, lift, or meal, so
     every sport section is Tier-1 suppressed. Rather than show a wall of
     zeroed figures plus a redundant "PI appears later" strip,
     render ONE calm card that sets the expectation. The moment anything is
     logged, lifetime>0 flips this off and the normal analytics return. */
  const isAnalyticsColdStart =
    !showRunningSection && !showLiftingSection && !showNutritionSection;

  return (
    <PageShell
      {...pullBindProps}
      title="Analytics"
      /* Hist4: sustained-offline notice (30s threshold). Additive to the
         global Layout banner — surfaces only after the disconnect has
         lasted 30s and clarifies that Analytics reads from the Firestore
         local cache while offline. In the shell's banner slot, above the
         title, where Food and Train keep theirs. */
      banner={<HistoryOfflineBanner />}
    >
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

      <motion.div variants={pageItemVariant}>
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
          <div className="py-8 text-center text-muted-foreground text-sm motion-safe:animate-pulse">
            Loading analytics...
          </div>
        }
      >
        {filter === "badges" ? (
          <SectionErrorBoundary sectionName="badges-tab">
            {/* The grid alone. It answers what the chronology above it could
                not: what is still in PROGRESS and how close it is. That was
                the one thing the Milestones arrangement got right, and it
                was an argument for the grid rather than for the list on top
                of it — a list of things that already happened is
                structurally incapable of showing the next one. */}
            <BadgeGrid />
          </SectionErrorBoundary>
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
            {/* Hist6 — Performance pinned to the top, range-independent
              ("this week"). The TimeRange control below scopes only the
              history under it, so changing the range never moves the
              index — the two mental models (current form vs adjustable
              history) are separated spatially. Suppressed in cold-start:
              the "No analytics yet" card below stands in until the first
              session is logged. `/history#performance` opens the
              Performance page. */}
            {/* A deeper page's way back to the overview. */}
            {filter === "analytics" && view !== "overview" && (
              <AnalyticsBackRow onBack={() => setView("overview")} />
            )}

            {/* The week's index, range-independent, above the range
                pills (Hist6): the pills scope everything below them. The
                overview shows the card; its Details open the page. */}
            {filter === "analytics" &&
              view === "overview" &&
              !isAnalyticsColdStart && (
                <SectionErrorBoundary sectionName="performance-section">
                  <PerformanceOverviewCard
                    hasLoggedSession={
                      workouts.length > 0 || lifetimeRuns.runCount > 0
                    }
                    onOpenDetails={() => setView("performance")}
                  />
                </SectionErrorBoundary>
              )}
            {filter === "analytics" && view === "performance" && (
              <SectionErrorBoundary sectionName="performance-section">
                <PerformanceSection
                  /* A meal alone clears the cold-start gate, so this can
                     render for someone with no session at all — and the
                     perf doc is server-written, so a user who has just
                     logged their first workout reaches it too. */
                  hasLoggedSession={
                    workouts.length > 0 || lifetimeRuns.runCount > 0
                  }
                  distanceUnit={unit}
                />
              </SectionErrorBoundary>
            )}

            {/* The range scopes the history below it. The Body page's
                weight chart keeps its own, so it gets none here. */}
            {view !== "body" && (
              <TimeRangePills selected={timeRange} onChange={setTimeRange} />
            )}

            {/* Fitness, fatigue and form across lifting and running: the
                load behind the index, so it sits on the Performance page,
                under the range it follows. */}
            {filter === "analytics" && view === "performance" && (
              <SectionErrorBoundary sectionName="training-load">
                <TrainingLoadCard
                  points={trainingLoad.points}
                  loading={trainingLoad.loading}
                />
              </SectionErrorBoundary>
            )}

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
            {filter === "analytics" && view === "overview" && dataLoading && (
              <div className="p-4 rounded-2xl bg-card space-y-3">
                <Skeleton className="h-3 w-20" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              </div>
            )}

            {/*
              Skeletons that never resolve were the shape of the original
              "analytics doesn't load" report, and the shape nothing could
              observe: a Firestore listener that neither fires nor errors
              logs nothing, and `navigator.onLine` stays true because the
              network is fine — it's the SDK stream that's dead. So the
              user waited forever and there was no evidence afterwards.

              This says so out loud after 15s and names the source, which
              is also what makes a second report diagnosable. Reload
              rather than retry: two of the three are onSnapshot
              subscriptions with no re-subscribe handle from here, and
              remounting the page genuinely re-establishes them.
            */}
            {filter === "analytics" &&
              view === "overview" &&
              stalledSources.length > 0 && (
                <div
                  role="status"
                  className="p-4 rounded-2xl bg-card space-y-2 card-shadow"
                >
                  <p className="text-sm font-semibold text-foreground">
                    Still loading your {formatSourceList(stalledSources)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This is taking longer than it should. Your data is safe —
                    the connection to it has stalled.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => window.location.reload()}
                  >
                    Reload
                  </Button>
                </div>
              )}

            {/* Cold-start: one calm expectation-setting card instead of a
                wall of zeroed rings + redundant PI strip. */}
            {filter === "analytics" &&
              view === "overview" &&
              !dataLoading &&
              isAnalyticsColdStart && (
                <EmptyState
                  icon={LineChart}
                  accent={THEME.brand}
                  headline="No analytics yet"
                  sub="Log a workout, run or meal and your trends will show up here."
                  action={{ label: "Start a workout", href: "/program" }}
                />
              )}

            {filter === "analytics" &&
              view === "overview" &&
              !dataLoading &&
              !isAnalyticsColdStart && (
                <>
                  <SectionErrorBoundary sectionName="period-summary">
                    <PeriodSummaryCard
                      title={rollingRangeLabel(timeRange)}
                      comparedWith={
                        joinedInRange ? null : previousRangeLabel(timeRange)
                      }
                      sinceLabel={
                        startKey
                          ? `Since you joined on ${formatDayMonth(parseLocalDate(startKey))}`
                          : undefined
                      }
                      figures={summaryFigures}
                      bins={periodSummary.bins}
                      granularity={periodSummary.granularity}
                      /* The user's own weekly targets. `daysPerWeek` is what
                         onboarding asked for and, capped at 6, is never
                         reshaped by the engine's 7-day cap — so requested
                         and actual agree. The run side goes through the
                         canonical resolver rather than reading either of
                         the two drifted profile fields directly. */
                      plannedThisWeek={
                        (profile?.daysPerWeek ?? 0) +
                        getWeeklyRunTarget(profile)
                      }
                      distanceUnit={unit}
                    />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="trends">
                    <AnalyticsTrends rows={trendRows} onOpen={setView} />
                  </SectionErrorBoundary>
                  <SectionErrorBoundary sectionName="muscles">
                    <AnalyticsMuscles
                      data={liftingData.muscleData}
                      onOpen={() => setView("lifting")}
                    />
                  </SectionErrorBoundary>
                </>
              )}

            {/* The way into the four pages. Shown in cold start too: the
                Body page holds a weight chart that needs no session. */}
            {filter === "analytics" && view === "overview" && !dataLoading && (
              <AnalyticsGoDeeper onOpen={setView} lines={goDeeper} />
            )}

            {/* On its own page a section renders whatever its data: each
                one's own branches say "log your first run" and the like,
                which the overview's "has anything" gates never let it. */}
            {filter === "analytics" && view === "running" && (
              <section
                id="analytics-running"
                aria-label="Running analytics"
                className="space-y-2"
              >
                <SectionHeading className="text-running-strong">
                  Running
                </SectionHeading>
                {runsLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                ) : runsFailed ? (
                  /* Ordered BEFORE the empty branches deliberately: a
                     failed read arrives as `runs: []`, so any empty-state
                     check above this would claim the user has never run.
                     Retry re-issues the same one-shot getDocs — the read
                     is idempotent, and the usual cause (a transient
                     network or a wedged stream) clears on a second go. */
                  <div className="p-4 rounded-2xl bg-card space-y-2 card-shadow">
                    <p className="text-sm font-semibold text-foreground">
                      Couldn&apos;t load your runs
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Your runs are safe — this was a problem reading them, not
                      a problem with your data.
                    </p>
                    <Button
                      variant="sport-tinted"
                      onClick={() => refreshRuns()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : renderRunningEmptyNote ? (
                  <>
                    <p className="text-xs text-muted-foreground italic px-1">
                      No runs in this period
                    </p>
                    {/* Predictions are a today-snapshot (see the card's
                        carve-out footnote), so an empty WINDOW doesn't
                        hide them — only an empty lifetime does. */}
                    <RacePredictionsCard />
                  </>
                ) : runs.length === 0 ? (
                  <SectionEmptyCTA
                    icon={
                      <Footprints className="size-5 shrink-0 text-running" />
                    }
                    text="Complete your first run to see running analytics here"
                    to="/run"
                    ctaLabel="Start run"
                    variant="sport"
                  />
                ) : (
                  <>
                    <SectionErrorBoundary sectionName="run-weeks">
                      <TrainingWeeksCard
                        title="Distance"
                        subtitle={rollingRangeLabel(timeRange)}
                        figures={runningFigures({
                          distanceM: runningTotals.runDistance * 1000,
                          runs: runningTotals.runCount,
                          seconds: runningInsight.seconds,
                          unit,
                        })}
                        bins={periodSummary.bins}
                        granularity={periodSummary.granularity}
                        sport="running"
                        reading={runningBins(unit)}
                        onPick={(b) =>
                          trackHistoryEvent("history_chart_tap_attempted", {
                            chart: "distance",
                            binKey: b.key,
                            value: b.distanceM,
                          })
                        }
                        average={
                          runningInsight.averageM === null
                            ? null
                            : distanceIn(runningInsight.averageM, unit)
                        }
                        averageText={
                          runningInsight.averageM === null
                            ? ""
                            : distanceLabel(runningInsight.averageM, unit)
                        }
                        footer={
                          runningInsight.longest && (
                            <p className="text-sm text-muted-foreground">
                              Longest run{" "}
                              <span className="font-mono tabular-nums font-semibold text-foreground">
                                {distanceLabel(
                                  runningInsight.longest.distanceM,
                                  unit
                                )}
                              </span>{" "}
                              ·{" "}
                              {formatDayMonth(
                                parseLocalDate(runningInsight.longest.date)
                              )}
                            </p>
                          )
                        }
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="fastest-kilometres">
                      <FastestKilometresCard
                        rows={runningInsight.efforts}
                        unit={unit}
                        subtitle={rollingRangeLabel(timeRange)}
                        newSinceKey={runningInsight.newSinceKey}
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="run-pace">
                      <RunPaceCard
                        rows={runningInsight.pace.rows}
                        intervalsLeftOut={runningInsight.pace.intervalsLeftOut}
                        unit={unit}
                        subtitle={rollingRangeLabel(timeRange)}
                        comparedWith={previousRangeLabel(timeRange)}
                      />
                    </SectionErrorBoundary>
                    <RacePredictionsCard />
                    <ShoeMileageSection />
                  </>
                )}
              </section>
            )}

            {filter === "analytics" && view === "lifting" && (
              <section
                id="analytics-lifting"
                aria-label="Lifting analytics"
                className="space-y-2"
              >
                <SectionHeading className="text-lifting-strong">
                  Lifting
                </SectionHeading>
                {workoutsLoading ? (
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
                  <SectionEmptyCTA
                    icon={<Trophy className="size-5 shrink-0 text-lifting" />}
                    text="Log a workout to see your lifting analytics here"
                    to="/program"
                    ctaLabel="Start lift"
                    variant="primary"
                  />
                ) : (
                  <>
                    <SectionErrorBoundary sectionName="lift-progress">
                      <LiftProgressCard
                        rows={liftingInsight.progress}
                        subtitle={rollingRangeLabel(timeRange)}
                        hasSessions={liftingData.liftCount > 0}
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="lift-weeks">
                      <TrainingWeeksCard
                        title="Volume"
                        subtitle={rollingRangeLabel(timeRange)}
                        figures={liftingFigures({
                          volumeKg: liftingData.liftVolume,
                          sessions: liftingData.liftCount,
                          sets: liftingInsight.sets,
                        })}
                        bins={periodSummary.bins}
                        granularity={periodSummary.granularity}
                        sport="lifting"
                        reading={liftingBins}
                        onPick={(b) =>
                          trackHistoryEvent("history_chart_tap_attempted", {
                            chart: "volume",
                            binKey: b.key,
                            value: b.volumeKg,
                          })
                        }
                        average={liftingInsight.averageKg}
                        averageText={
                          liftingInsight.averageKg === null
                            ? ""
                            : `${abbreviateK(liftingInsight.averageKg)} kg`
                        }
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="muscle-volume">
                      <MuscleVolumeCard
                        rows={liftingInsight.muscles}
                        weeks={liftingInsight.muscleWeeks}
                        focus={focusLabel(liftGoal ?? "general")}
                      />
                    </SectionErrorBoundary>
                    <SectionErrorBoundary sectionName="muscle-heatmap">
                      <MuscleHeatMap
                        data={liftingData.muscleData}
                        accentColor={THEME.lifting}
                        recovery={muscleRecovery}
                      />
                    </SectionErrorBoundary>
                  </>
                )}
              </section>
            )}

            {filter === "analytics" &&
              view === "lifting" &&
              !workoutsLoading && <WorkoutHistoryList workouts={workouts} />}

            {/* Weight is a body measurement, not a food one, and the code
                said so three times before it said it once: TrendWeight was
                rendered in all three branches of the Nutrition section,
                each with a comment noting that weight is independent of
                meal logging. The section's own gate disagreed —
                `showNutritionSection` is meal-based, so a user who logged
                weight and never logged a meal got no weight chart at all.
                Its own section, gated on nothing but the tab, settles both:
                the workaround comments go, and the weight-only user gets
                their chart. */}
            {filter === "analytics" && view === "body" && (
              <section
                id="analytics-body"
                aria-label="Body analytics"
                className="space-y-2"
              >
                <SectionHeading>Body</SectionHeading>
                <SectionErrorBoundary sectionName="trend-weight">
                  <TrendWeight />
                </SectionErrorBoundary>
                <SectionErrorBoundary sectionName="weight-rate">
                  <WeightRateCard
                    points={bodyweight.points}
                    unit={profile?.preferredWeightUnit === "lbs" ? "lbs" : "kg"}
                    targetKgPerWeek={attestedWeeklyRateKg(profile)}
                    hideNumber={!!profile?.hideWeightNumber}
                    today={new Date()}
                  />
                </SectionErrorBoundary>
              </section>
            )}

            {/* Photos show what the weight chart above cannot, so they sit
                under it. The section carries its own heading. */}
            {filter === "analytics" && view === "body" && (
              <SectionErrorBoundary sectionName="progress-photos">
                <ProgressPhotos />
              </SectionErrorBoundary>
            )}

            {filter === "analytics" && view === "food" && (
              <section
                id="analytics-nutrition"
                aria-label="Food analytics"
                className="space-y-2"
              >
                {/* Its sport-coded peers on this page are section
                    headings coloured by a `-strong` utility. This one once
                    rendered at the in-card caption weight in the bare
                    `--nutrition` identity, which measures 2.54:1 on the
                    page against a 4.5:1 floor. The identity is for fills
                    and icons; `-strong` is the theme-aware AA step. */}
                <SectionHeading className="text-nutrition-strong">
                  Food
                </SectionHeading>
                {mealsLoading ? (
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
                  </>
                ) : nutrition.avgCalories === 0 ? (
                  <>
                    <SectionEmptyCTA
                      icon={
                        <UtensilsCrossed
                          className="size-5 shrink-0"
                          style={{ color: THEME.semantic.nutrition }}
                        />
                      }
                      text="Log meals to see your nutrition trends here"
                      to="/food"
                      ctaLabel="Log meal"
                      variant="nutrition"
                    />
                  </>
                ) : (
                  <>
                    {/* Adherence row — first-class signal, not a footnote.
                  The bands, why they exist and why every one of them
                  takes an AA text step live in `adherenceTone`, which is
                  pure and pinned. */}
                    {(() => {
                      const tone = adherenceTone(nutrition.adherence);
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
                              {nutrition.days}
                            </span>{" "}
                            days
                          </p>
                          <p
                            className="text-xs font-semibold font-mono tabular-nums"
                            style={{ color: tone.color }}
                          >
                            {nutrition.adherence}%
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
                      <p className="text-caption text-warning-strong -mt-1 italic">
                        Averages below are based on too few logged days to be
                        reliable.
                      </p>
                    )}
                    {foodDaysSettled && (
                      <SectionErrorBoundary sectionName="food-days">
                        <FoodDaysCard
                          reading={foodDays}
                          proteinPerKg={proteinPerKg}
                        />
                      </SectionErrorBoundary>
                    )}
                    {/* Top row: calories + protein. Sparkline + delta both
                  conditionally suppressed when sample is too thin (see
                  showSparklines / showDelta in `nutritionFigures`). */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <StatCard
                        label="Avg calories"
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
                        target={
                          macroTargets?.calories
                            ? `target ${macroTargets.calories.toLocaleString()} ${CALORIE_UNIT}`
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
                      avgCalories={nutrition.avgCalories}
                    />

                    <SectionErrorBoundary sectionName="calorie-balance">
                      <CalorieBalanceChart meals={meals} />
                    </SectionErrorBoundary>
                  </>
                )}
              </section>
            )}

            {filter === "analytics" &&
              view === "overview" &&
              !dataLoading &&
              lifetimeTotals.runCount +
                lifetimeTotals.liftCount +
                lifetimeTotals.daysLogged >
                0 && (
                <section
                  id="analytics-lifetime"
                  aria-label="Lifetime totals"
                  className="space-y-2"
                >
                  <SectionHeading>Lifetime</SectionHeading>
                  {/* Three peer tiles, one unit treatment. The runs tile
                      used to push its `km` down into the caption ("km ·
                      1 runs") while the lifting tile beside it carried
                      `kg` inline on the figure — so the same information
                      sat in two different places in one row, and the runs
                      caption opened on a dangling unit that only parsed if
                      you read upward. Unit inline on the figure, caption
                      as a plain descriptor, for all three. The unit span
                      also dropped from 700 to font-medium: at 700 beside
                      an 800 figure it was the weight-mixing DESIGN_GUIDE
                      bars, and `text-sm font-medium` is what the Home
                      weight tile already uses for exactly this role. */}
                  <div className="grid grid-cols-3 gap-2">
                    <Card size="compact" className="text-center">
                      <Footprints className="size-4 mx-auto mb-1.5 text-running" />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {/* In the reader's unit: it read "km" to everyone. */}
                        {abbreviateK(
                          distanceIn(lifetimeTotals.runKm * 1000, unit)
                        )}
                        <span className="text-xs font-medium ml-0.5">
                          {distanceUnitLabel(unit)}
                        </span>
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {lifetimeTotals.runCount}{" "}
                        {lifetimeTotals.runCount === 1 ? "run" : "runs"}
                      </p>
                    </Card>
                    <Card size="compact" className="text-center">
                      <Trophy className="size-4 mx-auto mb-1.5 text-lifting" />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {formatVolume(lifetimeTotals.liftVolume).value}
                        {formatVolume(lifetimeTotals.liftVolume).unit && (
                          <span className="text-xs font-medium ml-0.5">
                            {formatVolume(lifetimeTotals.liftVolume).unit}
                          </span>
                        )}
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        {lifetimeTotals.liftCount}{" "}
                        {lifetimeTotals.liftCount === 1
                          ? "session"
                          : "sessions"}
                      </p>
                    </Card>
                    <Card size="compact" className="text-center">
                      <UtensilsCrossed
                        className="size-4 mx-auto mb-1.5"
                        style={{ color: THEME.semantic.nutrition }}
                      />
                      <p className="text-base font-extrabold font-mono tabular-nums text-foreground leading-tight">
                        {lifetimeTotals.daysLogged.toLocaleString()}
                        <span className="text-xs font-medium ml-0.5">
                          {lifetimeTotals.daysLogged === 1 ? "day" : "days"}
                        </span>
                      </p>
                      <p className="text-caption text-muted-foreground mt-0.5">
                        logged
                      </p>
                    </Card>
                  </div>
                </section>
              )}
          </>
        )}
      </Suspense>
    </PageShell>
  );
}
