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

    return { liftCount, liftVolume, muscleData, weeklyVolume };
  }, [workouts, rangeDays]);

  const nutrition = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    const filtered = meals.filter(
      (m) => new Date(m.date + "T00:00:00") >= since
    );
    const avgCalories = filtered.length
      ? Math.round(
          filtered.reduce((sum, m) => sum + (m.totalCalories || 0), 0) /
            filtered.length
        )
      : 0;
    const avgProtein = filtered.length
      ? Math.round(
          filtered.reduce((sum, m) => sum + (m.totalProtein || 0), 0) /
            filtered.length
        )
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
