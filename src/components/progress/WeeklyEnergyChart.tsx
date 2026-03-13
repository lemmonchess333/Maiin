import { useMemo, useState } from "react";
import { useMeals } from "@/hooks/useMeals";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { format, subDays, startOfWeek, addDays } from "date-fns";
import { Info } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from "recharts";

const WEEK_OPTIONS = ["This wk", "Last wk", "2 wk ago", "3 wk ago"];

export function WeeklyEnergyChart() {
  const { meals } = useMeals();
  const { workouts } = useWorkouts();
  const { runs } = useRunningStats(30);
  const { profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);

  const weightKg = profile?.weightKg ?? 70;

  const data = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(subDays(now, weekOffset * 7), { weekStartsOn: 1 });

    const days = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayLabel = format(date, "EEE");

      // Consumed
      const dayMeals = meals.filter((m) => m.date === dateStr);
      const consumed = dayMeals.reduce((sum, m) => sum + m.totalCalories, 0);

      // Estimated burn from logged activities only
      const dayWorkouts = workouts.filter((w) => w.date === dateStr);
      const dayRuns = runs.filter((r) => format(r.completedAt, "yyyy-MM-dd") === dateStr);

      const hasActivity = dayWorkouts.length > 0 || dayRuns.length > 0;

      let burned = 0;

      // Runs: weight_kg x distance_km x 1.036
      dayRuns.forEach((r) => {
        const distKm = (r.distance || 0) / 1000;
        burned += Math.round(weightKg * distKm * 1.036);
      });

      // Workouts: weight_kg x duration_minutes x MET(~5) / 60
      dayWorkouts.forEach((w) => {
        const mins = w.durationMinutes || 0;
        burned += Math.round(weightKg * mins * 5 / 60);
      });

      return { day: dayLabel, consumed, burned, hasActivity };
    });

    return days;
  }, [meals, workouts, runs, weekOffset, weightKg]);

  // Default selectedDay to today's index in the week (Mon=0)
  const todayWeekIndex = useMemo(() => {
    const jsDay = new Date().getDay(); // 0=Sun
    return jsDay === 0 ? 6 : jsDay - 1; // Mon=0 ... Sun=6
  }, []);

  const [selectedDay, setSelectedDay] = useState(todayWeekIndex);

  const totals = useMemo(() => {
    const consumed = data.reduce((s, d) => s + d.consumed, 0);
    const burned = data.reduce((s, d) => s + d.burned, 0);
    return { consumed, burned, balance: burned - consumed };
  }, [data]);

  const selected = data[selectedDay] || data[0];

  const handleBarClick = (dayData: { activeLabel?: string | number } | null) => {
    if (!dayData?.activeLabel) return;
    const label = String(dayData.activeLabel);
    const idx = data.findIndex((d) => d.day === label);
    if (idx >= 0) setSelectedDay(idx);
  };

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Energy Balance
        </p>
        <div className="flex gap-1">
          {WEEK_OPTIONS.map((label, i) => (
            <button
              key={i}
              onClick={() => setWeekOffset(i)}
              className={`text-[10px] px-2 py-1 rounded-full transition-all ${
                weekOffset === i
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Persistent summary bar for selected day */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span className="font-medium text-foreground">{selected.day}</span>
        <span style={{ color: THEME.warning }}>
          {selected.hasActivity
            ? `Est. burn: ${selected.burned.toLocaleString()} cal`
            : "No activity tracked"}
        </span>
        <span style={{ color: THEME.success }}>Consumed: {selected.consumed.toLocaleString()} cal</span>
      </div>

      {/* Info subtitle */}
      <div className="flex items-center gap-1.5">
        <Info className="w-3 h-3 text-muted-foreground flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground">
          Based on your logged workouts and runs
        </p>
      </div>

      {totals.consumed === 0 && (
        <p className="text-[11px] text-muted-foreground text-center">Log meals to see your energy balance</p>
      )}

      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} onClick={handleBarClick}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={30}
              tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
            />
            <Bar dataKey="burned" name="Estimated burn" fill={THEME.warning} radius={[4, 4, 0, 0]} barSize={14} />
            <Bar dataKey="consumed" fill={THEME.success} radius={[4, 4, 0, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
