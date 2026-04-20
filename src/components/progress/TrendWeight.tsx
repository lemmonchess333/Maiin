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

  const data = useMemo(() => {
    const filtered = entries
      .filter((e) => e.weight > 0 && Number.isFinite(e.weight))
      .map((e) => ({ date: e.date, weight: e.weight }));

    // Deduplicate by date — keep the last entry for each date.
    // Defence against upstream Firestore data with multiple logs per day.
    const byDate = new Map<string, { date: string; weight: number }>();
    for (const entry of filtered) {
      byDate.set(entry.date, entry);
    }

    return calculateEMA([...byDate.values()]);
  }, [entries]);

  const unit = profile?.preferredWeightUnit === "lbs" ? "lbs" : "kg";
  const convert = (v: number) => {
    if (!Number.isFinite(v)) return 0;
    return Math.round(v * (unit === "lbs" ? 2.205 : 1) * 10) / 10;
  };

  // Single entry: show simple display instead of chart
  if (data.length === 1) {
    const entry = entries[0];
    const d = new Date(entry.date);
    return (
      <div className="p-4 rounded-2xl bg-card text-center py-6 space-y-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Weight Trend
        </p>
        <p className="text-lg font-bold text-foreground">
          {convert(entry.weight)} {unit}
        </p>
        <p className="text-xs text-muted-foreground">
          on {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
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
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
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
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => {
                const d = new Date(v);
                return `${d.getDate()}/${d.getMonth() + 1}`;
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(v) => `${convert(v)}`}
              label={{
                value: unit,
                angle: -90,
                position: "insideLeft",
                offset: 0,
                style: { fontSize: 10, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" },
              }}
            />
            {/* Custom tooltip content — Recharts' Scatter inside ComposedChart
                emits extra payload entries (including the date string as a value,
                which convert() turns into "0 kg"). Filtering to only actual/trend
                entries with valid positive values eliminates the phantom row. */}
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              content={(props) => {
                if (!props.active || !props.payload?.length) return null;

                const relevant = props.payload.filter(
                  (entry) =>
                    (entry.dataKey === "actual" || entry.dataKey === "trend") &&
                    Number.isFinite(Number(entry.value)) &&
                    Number(entry.value) > 0
                );
                if (relevant.length === 0) return null;

                const label = props.label
                  ? new Date(String(props.label)).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "";

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
                    <div style={{ fontWeight: 600, marginBottom: 4, color: "hsl(var(--foreground))" }}>
                      {label}
                    </div>
                    {relevant.map((entry, i) => (
                      <div
                        key={i}
                        style={{
                          color:
                            entry.dataKey === "trend"
                              ? THEME.brand
                              : "hsl(var(--muted-foreground))",
                        }}
                      >
                        {entry.dataKey === "trend" ? "Trend" : "Actual"}:{" "}
                        {convert(Number(entry.value))} {unit}
                      </div>
                    ))}
                  </div>
                );
              }}
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
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="4 4"
              strokeOpacity={0.3}
            />

            <Scatter
              dataKey="actual"
              fill="hsl(var(--muted-foreground))"
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
