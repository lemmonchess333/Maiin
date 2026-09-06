import { useMemo } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import type { Meal } from "@/hooks/useMeals";
import { useAuth } from "@/lib/auth";
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
import { calcDayBalance, getBalanceColor } from "@/utils/calorieBalance";
import { calculateTDEE, type ActivityLevel } from "@/lib/tdee";

export default function CalorieBalanceChart({ meals }: { meals: Meal[] }) {
  const { profile } = useAuth();
  const maintenance = calculateTDEE(
    profile?.weightKg ?? 70,
    profile?.heightCm ?? 175,
    profile?.age ?? 30,
    (profile?.activityLevel as ActivityLevel) ?? "moderate",
    "recomp",
    (profile?.sex as "male" | "female") ?? "male"
  ).tdee;
  const today = format(new Date(), "yyyy-MM-dd");
  const data = useMemo(() => {
    const now = new Date(today + "T12:00:00");
    return Array.from({ length: 14 }, (_, i) => {
      const date = subDays(now, 13 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const entries = meals.filter((meal) => meal.date === dateStr);
      const consumed = entries.reduce(
        (sum, meal) => sum + (meal.totalCalories || 0),
        0
      );
      const point = calcDayBalance(
        dateStr,
        format(date, "EEE"),
        consumed,
        maintenance
      );
      return {
        ...point,
        // No entry is unknown, not zero intake. Today is still in progress.
        // Even past days are estimates: a meal entry does not prove a full log.
        balance: entries.length > 0 && dateStr !== today ? point.balance : null,
      };
    });
  }, [meals, maintenance, today]);
  const loggedDays = data.filter((day) => day.balance !== null);
  const average = loggedDays.length
    ? Math.round(
        loggedDays.reduce((sum, day) => sum + (day.balance ?? 0), 0) /
          loggedDays.length
      )
    : null;

  return (
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Calorie Balance</SectionLabel>
        <span className="text-xs text-muted-foreground">14 days</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Estimated maintenance − logged food. Today is excluded.
      </p>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(value) =>
                Math.abs(value) >= 1000
                  ? `${(value / 1000).toFixed(1)}k`
                  : String(value)
              }
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip
              cursor={false}
              content={(props) => {
                if (!props.active || !props.payload?.length) return null;
                const entry = props.payload[0];
                if (entry.value == null) return null;
                const value = Number(entry.value);
                if (!Number.isFinite(value)) return null;
                const point = entry.payload as { date: string };
                return (
                  <div className="rounded-xl border border-border bg-card p-3 text-xs text-foreground shadow-sm">
                    <p className="font-semibold">
                      {format(new Date(point.date + "T12:00:00"), "d MMM yyyy")}
                    </p>
                    <p>
                      Estimated gap: {value > 0 ? "+" : ""}
                      {Math.round(value).toLocaleString()} kcal
                    </p>
                    <p className="text-muted-foreground">
                      Based on logged food; entries may be incomplete.
                    </p>
                  </div>
                );
              }}
            />
            <Bar dataKey="balance" radius={[3, 3, 3, 3]} barSize={12}>
              {data.map((entry) => (
                <Cell
                  key={entry.date}
                  fill={getBalanceColor(
                    entry.balance ?? 0,
                    profile?.program?.goal
                  )}
                  opacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-around border-t border-border/30 pt-2">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Average logged-day gap
          </p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {average === null
              ? "Not enough data"
              : `${average >= 0 ? "+" : ""}${average} kcal`}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            Past days with entries
          </p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {loggedDays.length} / 13
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Gaps mean no food was logged. Partial logs can overstate a deficit, so
        this chart does not predict weight change or confirm progress toward
        your goal.
      </p>
    </div>
  );
}
