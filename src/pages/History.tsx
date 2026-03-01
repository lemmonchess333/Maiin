import { useMemo, useState } from 'react';
import { useMeals } from '@/hooks/useMeals';
import { useRunningStats } from '@/hooks/useRunningStats';
import { useWorkouts } from '@/hooks/useWorkouts';
import { THEME } from '@/lib/theme';
import TimeRangePills from '@/components/analytics/TimeRangePills';
import WeeklyOverview from '@/components/analytics/WeeklyOverview';
import StatCard from '@/components/analytics/StatCard';
import VolumeChart from '@/components/analytics/VolumeChart';
import MuscleHeatMap from '@/components/analytics/MuscleHeatMap';
import PRCard from '@/components/analytics/PRCard';
import RunningHistorySection from '@/components/run/RunningHistorySection';

export default function History() {
  const [filter, setFilter] = useState<'all' | 'running' | 'lifting' | 'nutrition'>('all');
  const [timeRange, setTimeRange] = useState('1M');
  const rangeDays = timeRange === '1W' ? 7 : timeRange === '1M' ? 30 : timeRange === '3M' ? 90 : timeRange === '6M' ? 180 : 365;

  const { weeklyData } = useRunningStats(rangeDays);
  const { workouts } = useWorkouts();
  const { meals } = useMeals();

  const runningTotals = useMemo(() => {
    const runCount = weeklyData.reduce((sum, week) => sum + week.runCount, 0);
    const runDistance = weeklyData.reduce((sum, week) => sum + week.totalDistance, 0);
    const paceSamples = weeklyData.filter((w) => w.avgPace > 0).map((w) => w.avgPace);
    const avgPace = paceSamples.length ? Math.round(paceSamples.reduce((a, b) => a + b, 0) / paceSamples.length) : 0;
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
        const group = ex.category || 'Other';
        muscleData[group] = (muscleData[group] || 0) + (ex.sets?.length || 0);
      });
    });

    const weeklyVolume = filtered.map((w) => ({
      week: w.date,
      volume: w.exercises.reduce((sum, ex) => sum + ex.sets.reduce((s, set) => s + set.weightKg * set.reps, 0), 0),
    }));

    return { liftCount, liftVolume, muscleData, weeklyVolume };
  }, [workouts, rangeDays]);

  const nutrition = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    const filtered = meals.filter((m) => new Date(`${m.date}T00:00:00`) >= since);
    const avgCalories = filtered.length
      ? Math.round(filtered.reduce((sum, m) => sum + (m.totalCalories || 0), 0) / filtered.length)
      : 0;
    const avgProtein = filtered.length
      ? Math.round(filtered.reduce((sum, m) => sum + (m.totalProtein || 0), 0) / filtered.length)
      : 0;
    return { avgCalories, avgProtein, adherence: filtered.length ? 78 : 0 };
  }, [meals, rangeDays]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">Analytics</h1>

      {/* Filter pills with sport-specific colours */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(['all', 'running', 'lifting', 'nutrition'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`shrink-0 text-xs px-4 py-2 rounded-full font-medium transition-all ${
              filter === f
                ? f === 'running' ? 'bg-[#FF6B6B]/15 text-[#FF6B6B]'
                  : f === 'lifting' ? 'bg-[#6C7CFF]/15 text-[#6C7CFF]'
                  : f === 'nutrition' ? 'bg-emerald-500/15 text-emerald-500'
                  : 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
            }`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <TimeRangePills selected={timeRange} onChange={setTimeRange} />

      {filter === 'all' && (
        <WeeklyOverview
          runCount={runningTotals.runCount}
          runDistance={runningTotals.runDistance}
          liftCount={liftingData.liftCount}
          liftVolume={liftingData.liftVolume}
          caloriesBurned={Math.round(runningTotals.runDistance * 65 + liftingData.liftCount * 200)}
          nutritionAdherence={nutrition.adherence}
        />
      )}

      {/* RUNNING SECTION */}
      {(filter === 'all' || filter === 'running') && (
        <>
          {filter === 'all' && (
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: THEME.running }}>Running</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Weekly Distance"
              value={runningTotals.runDistance.toFixed(1)}
              unit="km"
              sparklineData={weeklyData.map((w) => w.totalDistance).slice(-6)}
              accentColor={THEME.running}
            />
            <StatCard
              label="Avg Pace"
              value={runningTotals.avgPace ? `${Math.floor(runningTotals.avgPace / 60)}:${(runningTotals.avgPace % 60).toString().padStart(2, '0')}` : '--:--'}
              unit="/km"
              sparklineData={weeklyData.map((w) => w.avgPace || 0).slice(-6)}
              accentColor={THEME.running}
            />
          </div>
          <PRCard
            title="Running PRs"
            prs={[
              { label: 'Fastest 1K', value: '4:12', date: '24 Feb', isNew: false },
              { label: 'Fastest 5K', value: '24:32', date: '20 Feb', isNew: true },
              { label: 'Longest Run', value: `${Math.max(...weeklyData.map((w) => w.totalDistance), 0).toFixed(1)} km`, date: 'Recent', isNew: false },
            ]}
            accentColor={THEME.running}
          />
          <RunningHistorySection />
        </>
      )}

      {/* LIFTING SECTION */}
      {(filter === 'all' || filter === 'lifting') && (
        <>
          {filter === 'all' && (
            <p className="text-xs font-semibold uppercase tracking-wider mt-4" style={{ color: THEME.lifting }}>Lifting</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Weekly Volume" value={(liftingData.liftVolume / 1000).toFixed(1)} unit="t" accentColor={THEME.lifting} />
            <StatCard label="Sessions" value={String(liftingData.liftCount)} unit="/period" accentColor={THEME.lifting} />
          </div>
          <VolumeChart data={liftingData.weeklyVolume} accentColor={THEME.lifting} />
          <MuscleHeatMap data={liftingData.muscleData} accentColor={THEME.lifting} />
        </>
      )}

      {/* NUTRITION SECTION */}
      {(filter === 'all' || filter === 'nutrition') && (
        <>
          {filter === 'all' && (
            <p className="text-xs font-semibold uppercase tracking-wider mt-4" style={{ color: THEME.success }}>Nutrition</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Avg Calories" value={nutrition.avgCalories.toLocaleString()} unit="/day" accentColor={THEME.success} />
            <StatCard label="Protein" value={nutrition.avgProtein.toString()} unit="g/day" accentColor={THEME.success} />
          </div>
        </>
      )}
    </div>
  );
}
