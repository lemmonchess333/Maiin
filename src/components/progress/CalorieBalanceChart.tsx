import { useMemo } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import type { Meal } from "@/hooks/useMeals";
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
import { AlertTriangle } from "lucide-react";
import {
  calcDayBalance,
  getBalanceColor,
  getPhaseAlignment,
} from "@/utils/calorieBalance";
import { calculateTDEE, type ActivityLevel } from "@/lib/tdee";

interface CalorieBalanceChartProps {
  // Passed down from History, which already holds the live meals listener.
  meals: Meal[];
}

export default function CalorieBalanceChart({
  meals,
}: CalorieBalanceChartProps) {
  const { profile } = useAuth();

  const weightKg = profile?.weightKg ?? 70;
  const heightCm = profile?.heightCm ?? 175;
  const age = profile?.age ?? 30;
  const sex = (profile?.sex as "male" | "female") ?? "male";
  const activityLevel = (profile?.activityLevel as ActivityLevel) ?? "moderate";
  const goal = profile?.program?.goal;

  // Expenditure baseline = MAINTENANCE TDEE (BMR × activity multiplier) — the
  // same value calculateTDEE uses everywhere else. Expenditure-inclusive
  // (Nutr1): logged exercise is already captured by the multiplier, so it is
  // NOT added per-day. The prior bare-BMR baseline understated expenditure by
  // ~20-40% and showed a "surplus" to a user eating at maintenance (NUTR-H1).
  // tdee is goal-independent, so a fixed goal arg is passed.
  const maintenance = useMemo(
    () =>
      calculateTDEE(weightKg, heightCm, age, activityLevel, "recomp", sex).tdee,
    [weightKg, heightCm, age, activityLevel, sex]
  );

  const data = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, i) => {
      const date = subDays(now, 13 - i);
      const dateStr = format(date, "yyyy-MM-dd");
      const dayLabel = format(date, "EEE");

      const dayMeals = meals.filter((m) => m.date === dateStr);
      const consumed = dayMeals.reduce(
        (sum, m) => sum + (m.totalCalories || 0),
        0
      );

      return calcDayBalance(dateStr, dayLabel, consumed, maintenance);
    });
  }, [meals, maintenance]);

  const rawAvg = data.length
    ? data.reduce((s, d) => s + d.balance, 0) / data.length
    : 0;
  const avgBalance = Number.isFinite(rawAvg) ? Math.round(rawAvg) : 0;
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
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Calorie Balance</SectionLabel>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              backgroundColor: THEME.brand + "18",
              color: THEME.brand,
            }}
          >
            {phaseLabel}
          </span>
          <span className="text-xs text-muted-foreground">14 days</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Maintenance − food intake</p>

      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
            <XAxis
              dataKey="day"
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v) =>
                Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)
              }
            />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
            {/* Custom tooltip matches TrendWeight — full-date heading, then
                label: value line. Previously rendered the day abbrev ("Sun")
                as the heading; now both History charts show a consistent
                "22 Mar 2026 / Deficit: 1,736 cal" template. */}
            <Tooltip
              cursor={false}
              offset={20}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ outline: "none", zIndex: 10 }}
              content={(props) => {
                if (!props.active || !props.payload?.length) return null;
                const entry = props.payload[0];
                const v = Number(entry.value);
                if (!Number.isFinite(v)) return null;
                const point = entry.payload as { date?: string } | undefined;
                const heading = point?.date
                  ? new Date(point.date + "T12:00:00").toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short", year: "numeric" }
                    )
                  : String(props.label ?? "");
                const abs = Math.abs(Math.round(v)).toLocaleString();
                const label = v >= 0 ? "Deficit" : "Surplus";
                return (
                  <div
                    style={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                      padding: "10px 14px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 4,
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {heading}
                    </div>
                    <div style={{ color: "hsl(var(--muted-foreground))" }}>
                      {label}: {abs} cal
                    </div>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="balance"
              radius={[3, 3, 3, 3]}
              barSize={12}
              minPointSize={2}
            >
              {data.map((entry) => {
                const noData = entry.consumed === 0 && entry.balance !== 0;
                return (
                  <Cell
                    key={entry.date}
                    fill={
                      noData
                        ? "hsl(var(--muted-foreground))"
                        : getBalanceColor(entry.balance, goal)
                    }
                    opacity={noData ? 0.25 : 0.75}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-around pt-1 border-t border-border/30">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Avg daily</p>
          <p
            className="text-sm font-bold font-mono tabular-nums"
            style={{ color: getBalanceColor(avgBalance, goal) }}
          >
            {avgBalance >= 0 ? "+" : ""}
            {avgBalance} cal
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Deficit days</p>
          <p className="text-sm font-bold font-mono tabular-nums text-foreground">
            {deficitDays} / {data.length}
          </p>
        </div>
      </div>

      {/* Hist5c pin 5 (audit E1) — phase-aware framing. Reconciles
          the user's chosen phase (Bulk / Cut / Recomp) with their
          actual 14-day balance. At-odds states (Bulk+deficit,
          Cut+surplus) surface as an amber warning so the user
          reads the conflict explicitly instead of synthesising it
          from two raw lines. On-track / maintaining states stay as
          quiet centered text — the chart already tells that story.
          Replaces the prior "Currently in deficit" line that
          contradicted the Bulk chip without flagging the conflict. */}
      {(() => {
        const alignment = getPhaseAlignment(goal, avgBalance);
        if (!alignment) return null;

        if (alignment.state === "at-odds") {
          return (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2 rounded-lg"
              style={{ background: THEME.amber + "1A" }}
            >
              <AlertTriangle
                className="size-3.5 shrink-0"
                style={{ color: THEME.amber }}
                aria-hidden="true"
              />
              <p className="text-xs font-medium" style={{ color: THEME.amber }}>
                {alignment.message}
              </p>
            </div>
          );
        }

        return (
          <p
            className="text-xs font-medium text-center pt-1"
            style={{
              color:
                alignment.state === "on-track"
                  ? getBalanceColor(avgBalance, goal)
                  : "hsl(var(--muted-foreground))",
            }}
          >
            {alignment.message}
          </p>
        );
      })()}

      {/* Projected weekly weight change — rule-of-thumb 7700 cal ≈ 1 kg.
          Suppressed under ±100 cal/day because the "projection" becomes
          meaningless noise at maintenance. Positive avgBalance = deficit
          convention (see data computation above), so positive → weight
          down, negative → weight up. */}
      {Math.abs(avgBalance) >= 100 &&
        (() => {
          const kgPerWeek = (Math.abs(avgBalance) * 7) / 7700;
          const direction = avgBalance > 0 ? "down" : "up";
          return (
            <p className="text-xs text-muted-foreground text-center">
              At this rate, ~{kgPerWeek.toFixed(1)} kg/week {direction}
            </p>
          );
        })()}
    </div>
  );
}
