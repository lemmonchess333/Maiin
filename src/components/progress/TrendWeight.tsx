import { useMemo, useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs, type BodyweightLog } from "@/lib/api";
import { THEME } from "@/lib/theme";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
} from "recharts";

function calculateEMA(
  weights: { date: string; weight: number }[],
  factor = 0.1
): { date: string; actual: number; trend: number }[] {
  if (weights.length === 0) return [];

  const sorted = [...weights].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  let trend = sorted[0].weight;
  return sorted.map((w) => {
    trend = trend + factor * (w.weight - trend);
    return {
      date: w.date,
      actual: w.weight,
      trend: Math.round(trend * 10) / 10,
    };
  });
}

export function TrendWeight() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<BodyweightLog[]>([]);

  useEffect(() => {
    if (!user) return;
    fetchBodyweightLogs(user.uid).then(setEntries);
  }, [user]);

  const data = useMemo(
    () =>
      calculateEMA(
        entries.map((e) => ({ date: e.date, weight: e.weight }))
      ),
    [entries]
  );

  const unit = profile?.preferredWeightUnit === "lbs" ? "lbs" : "kg";
  const convert = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    return unit === "lbs" ? Math.round(v * 2.205 * 10) / 10 : v;
  };

  // Single entry: show simple display instead of chart
  if (data.length === 1) {
    const entry = entries[0];
    const d = new Date(entry.date);
    return (
      <div className="p-4 rounded-2xl bg-card text-center py-6 space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Weight Trend
        </p>
        <p className="text-lg font-bold text-foreground">
          {convert(entry.weight)} {unit}
        </p>
        <p className="text-xs text-muted-foreground">
          on {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">
          Log daily for better trend tracking
        </p>
      </div>
    );
  }

  // Less than 3 entries: show message
  if (data.length < 3) {
    return (
      <div className="p-4 rounded-2xl bg-card text-center py-8">
        <p className="text-sm text-muted-foreground">
          Log 3+ weigh-ins to see your trend
        </p>
      </div>
    );
  }

  const startWeight = data[0].actual;
  const currentTrend = data[data.length - 1].trend;
  const goalWeight = profile?.program?.startWeight
    ? profile.program.goal === "cut"
      ? profile.program.startWeight - 5
      : profile.program.goal === "lean bulk"
        ? profile.program.startWeight + 3
        : profile.program.startWeight
    : undefined;

  const trendDisplay = Number.isFinite(currentTrend) ? convert(currentTrend) : null;
  const goalDisplay = goalWeight && Number.isFinite(goalWeight) ? convert(goalWeight) : null;
  const goalDiff = goalWeight && Number.isFinite(currentTrend) && Number.isFinite(goalWeight)
    ? convert(Math.abs(currentTrend - goalWeight))
    : null;

  return (
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Weight Trend
        </p>
        <p className="text-xs text-foreground font-medium">
          {trendDisplay != null ? (
            <>
              Trending at{" "}
              <span className="text-primary font-bold">
                {trendDisplay} {unit}
              </span>
              {goalDiff != null && (
                <span className="text-muted-foreground">
                  {" "}
                  — {goalDiff} {unit} to goal
                </span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Log more to see trend</span>
          )}
        </p>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <XAxis
              dataKey="date"
              allowDuplicatedCategory={false}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v) => `${convert(v)}`}
              label={{
                value: unit,
                angle: -90,
                position: "insideLeft",
                offset: 0,
                style: { fontSize: 10, fill: "var(--muted-foreground)", textAnchor: "middle" },
              }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value: unknown, name?: string) => [
                `${convert(Number(value))} ${unit}`,
                name === "trend" ? "Trend" : "Actual",
              ]}
              labelFormatter={(label) => new Date(label).toLocaleDateString()}
            />

            {goalDisplay != null && (
              <ReferenceLine
                y={goalWeight!}
                stroke={THEME.success}
                strokeDasharray="4 4"
                label={{
                  value: `Goal: ${goalDisplay}`,
                  position: "right",
                  fontSize: 10,
                  fill: THEME.success,
                }}
              />
            )}

            <ReferenceLine
              y={startWeight}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.3}
            />

            <Scatter
              dataKey="actual"
              fill="var(--muted-foreground)"
              opacity={0.4}
              r={3}
            />
            <Line
              dataKey="trend"
              stroke={THEME.brand}
              strokeWidth={2}
              dot={false}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
