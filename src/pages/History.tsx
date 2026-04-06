import { useMemo, useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useMeals } from "@/hooks/useMeals";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useWorkouts } from "@/hooks/useWorkouts";
import { THEME } from "@/lib/theme";
import { EXERCISES } from "@/lib/exercises";
import TimeRangePills from "@/components/analytics/TimeRangePills";
import WeeklyOverview from "@/components/analytics/WeeklyOverview";
import StatCard from "@/components/analytics/StatCard";
import PRCard from "@/components/analytics/PRCard";
import { Footprints, Trophy, UtensilsCrossed } from "lucide-react";
import PRBadge from "@/components/analytics/PRBadge";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { Skeleton, ChartSkeleton } from "@/components/LoadingSkeleton";
import { formatVolume, formatDistance } from "@/utils/formatters";

const VolumeChart = lazy(() => import("@/components/analytics/VolumeChart"));
const MuscleHeatMap = lazy(() => import("@/components/analytics/MuscleHeatMap"));
const RunningHistorySection = lazy(() => import("@/components/run/RunningHistorySection"));
const PerformanceTab = lazy(() => import("@/components/analytics/PerformanceTab"));
const BadgeGrid = lazy(() => import("@/features/streaks/BadgeGrid").then(m => ({ default: m.BadgeGrid })));
const TrendWeight = lazy(() => import("@/components/progress/TrendWeight").then(m => ({ default: m.TrendWeight })));
const CalorieBalanceChart = lazy(() => import("@/components/progress/CalorieBalanceChart"));


type FilterTab = "all" | "running" | "lifting" | "nutrition" | "performance" | "badges";

const VALID_TABS: FilterTab[] = [
  "all",
  "running",
  "lifting",
  "nutrition",
  "badges",
  "performance",
];

function FilterPills({ filter, setFilter }: { filter: FilterTab; setFilter: (f: FilterTab) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) setScrolled(scrollRef.current.scrollLeft > 4);
  }, []);

  return (
    <div className="relative">
      {scrolled && (
        <div className="pointer-events-none absolute left-0 top-0 bottom-1 w-4 bg-gradient-to-r from-background to-transparent z-10" />
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {VALID_TABS.map((f) => {
          const active = filter === f;
          const tabColor = f === "running" ? THEME.running
            : f === "lifting" ? THEME.lifting
            : f === "nutrition" ? THEME.success
            : f === "performance" ? THEME.brand
            : THEME.brand;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={[
                "shrink-0 text-xs px-4 py-2 rounded-full font-medium transition-all",
                active ? "text-white" : "bg-muted text-muted-foreground",
              ].join(" ")}
              style={active ? { backgroundColor: tabColor, boxShadow: `0 2px 12px ${tabColor}59` } : undefined}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          );
        })}
      </div>
      <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent z-10" />
    </div>
  );
}

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab") as FilterTab | null;
  const [filter, setFilter] = useState<FilterTab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "all"
  );

  useEffect(() => {
    if (searchParams.has("tab")) {
      const clear = () => { setSearchParams({}, { replace: true }); };
      clear();
    }
  }, [searchParams, setSearchParams]);

  const [timeRange, setTimeRange] = useState("1M");
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

  const { weeklyData, runs, loading: runsLoading } = useRunningStats(rangeDays);
  const { workouts, loading: workoutsLoading } = useWorkouts();
  const { meals, loading: mealsLoading } = useMeals();
  const dataLoading = runsLoading || workoutsLoading || mealsLoading;

  const runningTotals = useMemo(() => {
    const runCount = weeklyData.reduce(
      (sum, week) => sum + week.runCount,
      0
    );
    const runDistance = weeklyData.reduce(
      (sum, week) => sum + week.totalDistance,
      0
    );
    const paceSamples = weeklyData
      .filter((w) => w.avgPace > 0)
      .map((w) => w.avgPace);
    const avgPace = paceSamples.length
      ? Math.round(
          paceSamples.reduce((a, b) => a + b, 0) / paceSamples.length
        )
      : 0;
    return { runCount, runDistance, avgPace };
  }, [weeklyData]);

  const runningPRs = useMemo(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const formatPace = (secPerKm: number) => {
      const m = Math.floor(secPerKm / 60);
      const s = Math.round(secPerKm % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const runs1k = runs.filter((r) => r.distance >= 1000 && r.avgPace > 0);
    const best1k = runs1k.length
      ? runs1k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
      : null;

    const runs5k = runs.filter((r) => r.distance >= 5000 && r.avgPace > 0);
    const best5k = runs5k.length
      ? runs5k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
      : null;

    const longestRun = runs.length
      ? runs.reduce((best, r) => (r.distance > best.distance ? r : best))
      : null;

    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    return [
      {
        label: "Fastest 1K",
        value: best1k ? formatPace(best1k.avgPace) : "--",
        date: best1k ? fmtDate(best1k.completedAt) : "",
        isNew: best1k ? best1k.completedAt >= sevenDaysAgo : false,
      },
      {
        label: "Fastest 5K",
        value: best5k ? formatPace(best5k.avgPace) : "--",
        date: best5k ? fmtDate(best5k.completedAt) : "",
        isNew: best5k ? best5k.completedAt >= sevenDaysAgo : false,
      },
      {
        label: "Longest Run",
        value: longestRun
          ? (longestRun.distance / 1000).toFixed(1) + " km"
          : "--",
        date: longestRun ? fmtDate(longestRun.completedAt) : "",
        isNew: longestRun ? longestRun.completedAt >= sevenDaysAgo : false,
      },
    ];
  }, [runs]);

  const liftingData = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);

    const filtered = workouts.filter((w) => new Date(w.date) >= since);
    const liftCount = filtered.length;
    let liftVolume = 0;
    const muscleData: Record<string, number> = {};

    filtered.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          liftVolume += set.weightKg * set.reps;
        });
        const group = ex.category || "Other";
        muscleData[group] = (muscleData[group] || 0) + (ex.sets?.length || 0);
      });
    });

    const weekMap: Record<string, number> = {};
    filtered.forEach((w) => {
      const d = new Date(w.date);
      d.setDate(d.getDate() - d.getDay());
      const key = d.toISOString().split('T')[0];
      const vol = w.exercises.reduce(
        (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0), 0
      );
      weekMap[key] = (weekMap[key] || 0) + vol;
    });
    const weeklyVolume = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, volume]) => ({ week, volume }));

    // Build all-time best e1rm per exercise
    const allTimeBest: Record<string, number> = {};
    workouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        ex.sets?.forEach((set) => {
          const e1rm = set.weightKg * (1 + set.reps / 30);
          allTimeBest[ex.exerciseName] = Math.max(allTimeBest[ex.exerciseName] || 0, e1rm);
        });
      });
    });

    // Best set per exercise from the last 7 days only
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentWorkouts = workouts.filter((w) => new Date(w.date) >= sevenDaysAgo);
    const prMap: Record<string, { weight: number; reps: number; date: string; isAllTimeBest: boolean }> = {};
    recentWorkouts.forEach((w) => {
      w.exercises?.forEach((ex) => {
        const name = ex.exerciseName;
        const exInfo = EXERCISES.find(e => e.name === name);
        const isBWExercise = exInfo?.equipment === "Bodyweight";
        ex.sets?.forEach((set) => {
          if (!isBWExercise && set.weightKg <= 0) return;
          const e1rm = set.weightKg * (1 + set.reps / 30);
          const score = isBWExercise && set.weightKg === 0 ? set.reps : e1rm;
          const prevScore = prMap[name]
            ? (isBWExercise && prMap[name].weight === 0 ? prMap[name].reps : prMap[name].weight * (1 + prMap[name].reps / 30))
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

    return { liftCount, liftVolume, muscleData, weeklyVolume, prTimeline };
  }, [workouts, rangeDays]);

  const nutrition = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    const filtered = meals.filter(
      (m) => new Date(m.date + "T00:00:00") >= since
    );
    // Group by date so we average per day, not per meal
    const byDate: Record<string, { cal: number; prot: number }> = {};
    for (const m of filtered) {
      if (!byDate[m.date]) byDate[m.date] = { cal: 0, prot: 0 };
      byDate[m.date].cal += m.totalCalories || 0;
      byDate[m.date].prot += m.totalProtein || 0;
    }
    const days = Object.values(byDate);
    const avgCalories = days.length
      ? Math.round(days.reduce((sum, d) => sum + d.cal, 0) / days.length)
      : 0;
    const avgProtein = days.length
      ? Math.round(days.reduce((sum, d) => sum + d.prot, 0) / days.length)
      : 0;
    const daysLogged = Object.keys(byDate).length;
    const adherence = daysLogged > 0 ? Math.round((daysLogged / rangeDays) * 100) : 0;
    return { avgCalories, avgProtein, adherence };
  }, [meals, rangeDays]);

  return (
    <div className="space-y-4 pt-2">
      <header>
        <h1 className="text-lg font-extrabold text-foreground">Analytics</h1>
      </header>

      <FilterPills filter={filter} setFilter={setFilter} />

      <Suspense fallback={<div className="py-8 text-center text-muted-foreground text-sm animate-pulse">Loading analytics...</div>}>
      {filter === "badges" ? (
        <BadgeGrid />
      ) : filter === "performance" ? (
        <PerformanceTab />
      ) : (
        <>
          <TimeRangePills selected={timeRange} onChange={setTimeRange} />

          {filter === "all" && (
            dataLoading ? (
              <div className="p-4 rounded-2xl bg-card space-y-3">
                <Skeleton className="h-3 w-20" />
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              </div>
            ) : (
              <WeeklyOverview
                runCount={runningTotals.runCount}
                runDistance={runningTotals.runDistance}
                liftCount={liftingData.liftCount}
                liftVolume={liftingData.liftVolume}
                caloriesBurned={Math.round(
                  runningTotals.runDistance * 65 + liftingData.liftCount * 200
                )}
                nutritionAdherence={nutrition.adherence}
                timeRange={timeRange}
              />
            )
          )}

          {(filter === "all" || filter === "running") && (
            <section aria-label="Running analytics">
              {filter === "all" && (
                <p
                  className="text-sm font-semibold uppercase tracking-wider"
                  style={{ color: THEME.running }}
                >
                  Running
                </p>
              )}
              {dataLoading ? (
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-24 w-full rounded-xl" />
                  <Skeleton className="h-24 w-full rounded-xl" />
                </div>
              ) : runs.length === 0 ? (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ backgroundColor: `${THEME.running}14` }}>
                  <Footprints className="w-5 h-5 shrink-0" style={{ color: THEME.running }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Complete your first run to see running analytics here</p>
                  </div>
                  <Link to="/run" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${THEME.running}, ${THEME.runningLight})` }}>
                    Start Run
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 border-t-2 pt-2" style={{ borderColor: THEME.running }}>
                    <StatCard
                      label="Weekly Distance"
                      value={formatDistance(runningTotals.runDistance)}
                      unit="km"
                      sparklineData={weeklyData
                        .map((w) => w.totalDistance)
                        .slice(-6)}
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
                      sparklineData={weeklyData
                        .map((w) => w.avgPace || 0)
                        .slice(-6)}
                      accentColor={THEME.running}
                    />
                  </div>
                  <PRCard
                    title="Running PRs"
                    prs={runningPRs}
                    accentColor={THEME.running}
                  />
                  <RunningHistorySection />
                </>
              )}
            </section>
          )}

          {(filter === "all" || filter === "lifting") && (
            <section aria-label="Lifting analytics">
              {filter === "all" && (
                <p
                  className="text-sm font-semibold uppercase tracking-wider mt-6"
                  style={{ color: THEME.lifting }}
                >
                  Lifting
                </p>
              )}
              {dataLoading ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                  <ChartSkeleton />
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-2 border-t-2 pt-2" style={{ borderColor: THEME.lifting }}>
                <StatCard
                  label="Weekly Volume"
                  value={formatVolume(liftingData.liftVolume).value}
                  unit={formatVolume(liftingData.liftVolume).unit}
                  accentColor={THEME.lifting}
                />
                <StatCard
                  label="Sessions"
                  value={String(liftingData.liftCount)}
                  unit={timeRange === "1W" ? "/week" : timeRange === "1M" ? "/month" : timeRange === "3M" ? "/3mo" : timeRange === "6M" ? "/6mo" : "/year"}
                  accentColor={THEME.lifting}
                />
              </div>
              <SectionErrorBoundary sectionName="volume-chart">
                <VolumeChart
                  data={liftingData.weeklyVolume}
                  accentColor={THEME.lifting}
                />
              </SectionErrorBoundary>
              <MuscleHeatMap
                data={liftingData.muscleData}
                accentColor={THEME.lifting}
              />
              <div className="rounded-xl bg-card overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${THEME.lifting}08 0%, transparent 60%)` }}>
                <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
                  <Trophy size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-foreground flex-1">Lift PRs</h3>
                  <span className="text-xs text-muted-foreground">This week</span>
                </div>
                {liftingData.prTimeline.length > 0 ? (
                  <div className="divide-y divide-border/20">
                    {liftingData.prTimeline.map((pr) => {
                      const e1rm = Math.round(pr.weight * (1 + pr.reps / 30));
                      const dateLabel = new Date(pr.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                      const exercise = EXERCISES.find(e => e.name === pr.name);
                      const isBW = exercise?.equipment === "Bodyweight";
                      return (
                        <div key={pr.name} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {pr.isAllTimeBest && (
                                <>
                                  <PRBadge isNew={pr.isAllTimeBest} />
                                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold tracking-wider flex-shrink-0"
                                    style={{ background: THEME.semantic.nutrition, color: 'white' }}>
                                    NEW
                                  </span>
                                  <span className="text-xs text-muted-foreground ml-1">{pr.reps}RM</span>
                                </>
                              )}
                              <p className="text-xs font-medium text-foreground truncate">{pr.name}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{dateLabel}</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-bold font-mono tabular-nums" style={{ color: THEME.lifting }}>
                              {isBW && pr.weight === 0 ? "BW" : isBW && pr.weight > 0 ? `+${pr.weight}kg` : pr.weight > 0 ? `${pr.weight}kg` : <span className="text-muted-foreground">&mdash; kg</span>} &times; {pr.reps}
                            </p>
                            {isBW && pr.weight === 0 ? null : pr.weight > 0 ? (
                              <p className="text-xs text-muted-foreground">~{e1rm}kg 1RM</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center space-y-2">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto" style={{ background: `${THEME.lifting}15` }}>
                      <Trophy size={20} style={{ color: THEME.lifting }} />
                    </div>
                    <p className="text-xs font-medium text-foreground">No lifts logged this week</p>
                    <p className="text-xs text-muted-foreground">Keep pushing — your best lifts will show here</p>
                  </div>
                )}
              </div>
              </>
              )}
            </section>
          )}

          {(filter === "all" || filter === "nutrition") && (
            <section aria-label="Nutrition analytics">
              {filter === "all" && (
                <p
                  className="text-sm font-semibold uppercase tracking-wider mt-6"
                  style={{ color: THEME.success }}
                >
                  Nutrition
                </p>
              )}
              {dataLoading ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                  <ChartSkeleton />
                </div>
              ) : (
              <>
              <div className="grid grid-cols-2 gap-2 border-t-2 pt-2" style={{ borderColor: THEME.success }}>
                <StatCard
                  label="Avg Calories"
                  value={nutrition.avgCalories.toLocaleString()}
                  unit="/day"
                  accentColor={THEME.success}
                />
                <StatCard
                  label="Protein"
                  value={nutrition.avgProtein.toString()}
                  unit="g/day"
                  accentColor={THEME.success}
                />
              </div>

              <SectionErrorBoundary sectionName="trend-weight">
                <TrendWeight />
              </SectionErrorBoundary>
              <SectionErrorBoundary sectionName="calorie-balance">
                <CalorieBalanceChart />
              </SectionErrorBoundary>

              {nutrition.avgCalories === 0 && (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ backgroundColor: `${THEME.success}14` }}>
                  <UtensilsCrossed className="w-5 h-5 shrink-0" style={{ color: THEME.success }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Log meals to see your nutrition trends here</p>
                  </div>
                  <Link to="/food" className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${THEME.success}, ${THEME.teal})` }}>
                    Log Meal
                  </Link>
                </div>
              )}
              </>
              )}
            </section>
          )}
        </>
      )}
      </Suspense>
    </div>
  );
}
