import { useMemo } from "react";
import { useMeals } from "@/hooks/useMeals";
import { useWorkouts } from "@/hooks/useWorkouts";
import { useRunningStats } from "@/hooks/useRunningStats";
import { useAuth } from "@/lib/auth";
import { THEME } from "@/lib/theme";
import { format, subDays } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ReferenceLine,
  Cell,
  Tooltip,
} from "recharts";
import { estimateBMR, calcDayBalance, getBalanceColor } from "@/utils/calorieBalance";

export default function CalorieBalanceChart() {
  const { meals } = useMeals();
  const { workouts } = useWorkouts();
  const { runs } = useRunningStats(14);
  const { profile } = useAuth();

  const weightKg = profile?.weightKg ?? 70;
  const heightCm = profile?.heightCm ?? 175;
  const age = profile?.age ?? 30;
  const sex = (profile?.sex as "male" | "female") ?? "male";
  const goal = profile?.program?.goal;

  const bmr = useMemo(() => estimateBMR(weightKg, heightCm, age, sex), [weightKg, heightCm, age, sex]);

  const data = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const date = subDays(now, 13 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayLabel = format(date, "EEE");

      const dayMeals = meals.filter((m) => m.date === dateStr);
      const consumed = dayMeals.reduce((sum, m) => sum + (m.totalCalories || 0), 0);

      let activityBurn = 0;
      const dayWorkouts = workouts.filter((w) => w.date === dateStr);
      const dayRuns = runs.filter(
        (r) => format(r.completedAt, "yyyy-MM-dd") === dateStr
      );

      dayRuns.forEach((r) => {
        const distKm = (r.distance || 0) / 1000;
        activityBurn += Math.round(weightKg * distKm * 1.036);
      });

      dayWorkouts.forEach((w) => {
        const mins = w.durationMinutes || 0;
        activityBurn += Math.round((weightKg * mins * 5) / 60);
      });

      return calcDayBalance(dateStr, dayLabel, consumed, bmr, activityBurn);
    });
  }, [meals, workouts, runs, bmr, weightKg]);

  const avgBalance = data.length
    ? Math.round(data.reduce((s, d) => s + d.balance, 0) / data.length)
    : 0;
  const deficitDays = data.filter((d) => d.balance > 0).length;

  const phaseLabel =
    goal === "cut"
      ? "Cut"
      : goal === "lean bulk"
        ? "Bulk"
        : goal === "recomp"
          ? "Recomp"
          : "Maintain";

  return (
    <div className="p-4 rounded-2xl bg-card border border-border/50 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Calorie Balance
        </p>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: THEME.brand + "18",
              color: THEME.brand,
            }}
          >
            {phaseLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">14 days</span>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        BMR + workout burn − food intake
      </p>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis
              dataKey="day"
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v) =>
                Math.abs(v) >= 1000
                  ? `${(v / 1000).toFixed(1)}k`
                  : String(v)
              }
            />
            <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value: unknown) => {
                const v = Number(value);
                return [
                  `${v >= 0 ? "+" : ""}${v} cal`,
                  v >= 0 ? "Deficit" : "Surplus",
                ];
              }}
              labelFormatter={(label) => String(label)}
            />
            <Bar dataKey="balance" radius={[3, 3, 3, 3]} barSize={12}>
              {data.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={getBalanceColor(entry.balance, goal)}
                  opacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-around pt-1 border-t border-border/30">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Avg daily</p>
          <p
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: getBalanceColor(avgBalance, goal) }}
          >
            {avgBalance >= 0 ? "+" : ""}
            {avgBalance} cal
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Deficit days</p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {deficitDays} / {data.length}
          </p>
        </div>
      </div>
    </div>
  );
}
