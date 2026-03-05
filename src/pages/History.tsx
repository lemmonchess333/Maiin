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

  const { weeklyData } = useRunningStats(rangeDays);
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

    const weeklyVolume = filtered.map((w) => ({
      week: w.date,
      volume: w.exercises.reduce(
        (sum, ex) =>
          sum +
          ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0),
        0
      ),
    }));

    // Build PR timeline: best set per exercise across all time, with date
    const allTime = workouts; // use all workouts, not filtered
    const prMap: Record<string, { weight: number; reps: number; date: string }> = {};
    allTime.forEach((w) => {
      w.exercises?.forEach((ex) => {
        const name = ex.name;
        ex.sets?.forEach((set) => {
          const e1rm = set.weightKg * (1 + set.reps / 30); // Epley formula
          if (!prMap[name] || e1rm > prMap[name].weight * (1 + prMap[name].reps / 30)) {
            prMap[name] = { weight: set.weightKg, reps: set.reps, date: w.date };
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

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
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
                prs={[
                  {
                    label: "Fastest 1K",
                    value: "4:12",
                    date: "24 Feb",
                    isNew: false,
                  },
                  {
                    label: "Fastest 5K",
                    value: "24:32",
                    date: "20 Feb",
                    isNew: true,
                  },
                  {
                    label: "Longest Run",
                    value:
                      Math.max(
                        ...weeklyData.map((w) => w.totalDistance),
                        0
                      ).toFixed(1) + " km",
                    date: "Recent",
                    isNew: false,
                  },
                ]}
                accentColor={THEME.running}
              />
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
                  value={(liftingData.liftVolume / 1000).toFixed(1)}
                  unit="t"
                  accentColor={THEME.lifting}
                />
                <StatCard
                  label="Sessions"
                  value={String(liftingData.liftCount)}
                  unit="/period"
                  accentColor={THEME.lifting}
                />
              </div>
              <VolumeChart
                data={liftingData.weeklyVolume}
                accentColor={THEME.lifting}
              />
              <MuscleHeatMap
                data={liftingData.muscleData}
                accentColor={THEME.lifting}
              />
              {liftingData.prTimeline.length > 0 && (
                <div className="rounded-2xl bg-card border border-border/50 overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${THEME.lifting}08 0%, transparent 60%)` }}>
                  <div className="px-4 pt-4 pb-3 flex items-center gap-2 border-b border-border/30">
                    <span className="text-base">🏆</span>
                    <h3 className="text-sm font-semibold text-foreground flex-1">Lift PRs</h3>
                    <span className="text-[10px] text-muted-foreground">Est. 1RM</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {liftingData.prTimeline.map((pr) => {
                      const e1rm = Math.round(pr.weight * (1 + pr.reps / 30));
                      const dateLabel = new Date(pr.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                      return (
                        <div key={pr.name} className="flex items-center justify-between px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground truncate">{pr.name}</p>
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
                </div>
              )}
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

              <TrendWeight />
              <WeeklyEnergyChart />
            </>
          )}
        </>
      )}
    </div>
  );
}