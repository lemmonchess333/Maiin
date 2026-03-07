import { useMemo, useState } from "react";
import { useMeals } from "@/hooks/useMeals";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { format, subDays, startOfWeek, addDays } from "date-fns";
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
  const { profile } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);

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

      // Burned: workouts + base TDEE
      const dayWorkouts = workouts.filter((w) => w.date === dateStr);
      let burned = profile?.tdeeBase || 2200; // Base metabolic
      dayWorkouts.forEach((w) => {
        burned += w.totalCalories || 0;
      });

      return { day: dayLabel, consumed, burned };
    });

    return days;
  }, [meals, workouts, profile, weekOffset]);

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

  const handleBarClick = (dayData: any) => {
    if (!dayData?.activeLabel) return;
    const idx = data.findIndex((d) => d.day === dayData.activeLabel);
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
        <span style={{ color: THEME.warning }}>Burned: {selected.burned.toLocaleString()} cal</span>
        <span style={{ color: THEME.success }}>Consumed: {selected.consumed.toLocaleString()} cal</span>
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
            <Bar dataKey="burned" fill={THEME.warning} radius={[4, 4, 0, 0]} barSize={14} />
            <Bar dataKey="consumed" fill={THEME.success} radius={[4, 4, 0, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
