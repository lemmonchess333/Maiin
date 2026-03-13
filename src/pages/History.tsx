import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMeals } from "@/hooks/useMeals";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useWorkouts } from "@/hooks/useWorkouts";
import { THEME } from "@/lib/theme";
import TimeRangePills from "@/components/analytics/TimeRangePills";
import WeeklyOverview from "@/components/analytics/WeeklyOverview";
import StatCard from "@/components/analytics/StatCard";
import VolumeChart from "@/components/analytics/VolumeChart";
import MuscleHeatMap from "@/components/analytics/MuscleHeatMap";
import PRCard from "@/components/analytics/PRCard";
import RunningHistorySection from "@/components/run/RunningHistorySection";
import PerformanceTab from "@/components/analytics/PerformanceTab";
import { BadgeGrid } from "@/features/streaks/BadgeGrid";
import { TrendWeight } from "@/components/progress/TrendWeight";
import { WeeklyEnergyChart } from "@/components/progress/WeeklyEnergyChart";
import { Footprints, Trophy } from "lucide-react";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";


type FilterTab = "all" | "running" | "lifting" | "nutrition" | "performance" | "badges";

const VALID_TABS: FilterTab[] = [
  "all",
  "running",
  "lifting",
  "nutrition",
  "badges",
  "performance",
];

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab = searchParams.get("tab") as FilterTab | null;
  const [filter, setFilter] = useState<FilterTab>(
    initialTab && VALID_TABS.includes(initialTab) ? initialTab : "all"
  );

  useEffect(() => {
    if (searchParams.has("tab")) {
      setSearchParams({}, { replace: true });
    }
  }, []);

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

  const { weeklyData, runs } = useRunningStats(rangeDays);
  const { workouts } = useWorkouts();
  const { meals } = useMeals();

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

    // Fastest 1K
    const runs1k = runs.filter((r) => r.distance >= 1000 && r.avgPace > 0);
    const best1k = runs1k.length
      ? runs1k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
      : null;

    // Fastest 5K
    const runs5k = runs.filter((r) => r.distance >= 5000 && r.avgPace > 0);
    const best5k = runs5k.length
      ? runs5k.reduce((best, r) => (r.avgPace < best.avgPace ? r : best))
      : null;

    // Longest Run
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
        ex.sets?.forEach((set) => {
          const e1rm = set.weightKg * (1 + set.reps / 30);
          if (!prMap[name] || e1rm > prMap[name].weight * (1 + prMap[name].reps / 30)) {
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
    return { avgCalories, avgProtein, adherence: filtered.length ? 78 : 0 };
  }, [meals, rangeDays]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">Analytics</h1>

      <div className="relative">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {VALID_TABS.map((f) => {
            const active = filter === f;
            let activeStyle = "bg-purple-500 text-white shadow-[var(--ds-shadow-purple-glow)]";
            if (f === "running")
              activeStyle =
                "bg-[#FF6B6B] text-white shadow-[0_2px_12px_rgba(255,107,107,0.35)]";
            else if (f === "lifting")
              activeStyle =
                "bg-[#6C7CFF] text-white shadow-[0_2px_12px_rgba(108,124,255,0.35)]";
            else if (f === "nutrition")
              activeStyle =
                "bg-emerald-500 text-white shadow-[0_2px_12px_rgba(52,211,153,0.35)]";
            else if (f === "performance")
              activeStyle =
                "bg-[#8b5cf6] text-white shadow-[0_2px_12px_rgba(139,92,246,0.35)]";
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={[
                  "shrink-0 text-xs px-4 py-2 rounded-full font-medium transition-all",
                  active ? activeStyle : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            );
          })}
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-background to-transparent" />
      </div>

      {filter === "badges" ? (
        <BadgeGrid />
      ) : filter === "performance" ? (
        <PerformanceTab />
      ) : (
        <>
          <TimeRangePills selected={timeRange} onChange={setTimeRange} />

          {filter === "all" && (
            <WeeklyOverview
              runCount={runningTotals.runCount}
              runDistance={runningTotals.runDistance}
              liftCount={liftingData.liftCount}
              liftVolume={liftingData.liftVolume}
              caloriesBurned={Math.round(
                runningTotals.runDistance * 65 + liftingData.liftCount * 200
              )}
              nutritionAdherence={nutrition.adherence}
            />
          )}

          {(filter === "all" || filter === "running") && (
            <>
              {filter === "all" && (
                <p
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: THEME.running }}
                >
                  Running
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Weekly Distance"
                  value={runningTotals.runDistance.toFixed(1)}
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
              {runs.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-2">
                  <Footprints size={14} className="text-green-500 inline" /> Complete your first run to set records here
                </p>
              )}
              <RunningHistorySection />
            </>
          )}

          {(filter === "all" || filter === "lifting") && (
            <>
              {filter === "all" && (
                <p
                  className="text-xs font-semibold uppercase tracking-wider mt-4"
                  style={{ color: THEME.lifting }}
                >
                  Lifting
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Weekly Volume"
                  value={liftingData.liftVolume >= 1000 ? (liftingData.liftVolume / 1000).toFixed(1) + "k" : String(Math.round(liftingData.liftVolume))}
                  unit="kg"
                  accentColor={THEME.lifting}
                />
                <StatCard
                  label="Sessions"
                  value={String(liftingData.liftCount)}
                  unit="/period"
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
              <div className="rounded-2xl bg-card border border-border/50 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${THEME.lifting}08 0%, transparent 60%)` }}>
                <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
                  <Trophy size={16} className="text-amber-500" />
                  <h3 className="text-sm font-semibold text-foreground flex-1">Lift PRs</h3>
                  <span className="text-[10px] text-muted-foreground">This week</span>
                </div>
                {liftingData.prTimeline.length > 0 ? (
                  <div className="divide-y divide-border/20">
                    {liftingData.prTimeline.map((pr) => {
                      const e1rm = Math.round(pr.weight * (1 + pr.reps / 30));
                      const dateLabel = new Date(pr.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                      return (
                        <div key={pr.name} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {pr.isAllTimeBest && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wider flex-shrink-0"
                                  style={{ background: `${THEME.lifting}20`, color: THEME.lifting }}>
                                  NEW
                                </span>
                              )}
                              <p className="text-xs font-medium text-foreground truncate">{pr.name}</p>
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-0.5">{dateLabel}</p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-3">
                            <p className="text-sm font-bold font-mono tabular-nums" style={{ color: THEME.lifting }}>
                              {pr.weight}kg × {pr.reps}
                            </p>
                            <p className="text-[9px] text-muted-foreground">~{e1rm}kg 1RM</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-xs text-muted-foreground">No lifts logged this week</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Keep pushing — your best lifts will show here</p>
                  </div>
                )}
              </div>
            </>
          )}

          {(filter === "all" || filter === "nutrition") && (
            <>
              {filter === "all" && (
                <p
                  className="text-xs font-semibold uppercase tracking-wider mt-4"
                  style={{ color: THEME.success }}
                >
                  Nutrition
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
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
              <SectionErrorBoundary sectionName="weekly-energy">
                <WeeklyEnergyChart />
              </SectionErrorBoundary>
            </>
          )}
        </>
      )}
    </div>
  );
}