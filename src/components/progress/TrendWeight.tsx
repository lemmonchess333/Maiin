import { useMemo, useState, useEffect } from "react";
import SectionLabel from "@/components/ui/SectionLabel";
import { useAuth } from "@/lib/auth";
import { fetchBodyweightLogs, type BodyweightLog } from "@/lib/api";
import { calculateEMA } from "@/utils/weightTrend";
import { THEME } from "@/lib/theme";
import {
  computeDataConfidence,
  T3_PROJECTION_MIN_POINTS,
} from "@/lib/dataConfidence";
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
  // #984 "Hide the number" anti-anxiety mode. When on, every raw
  // weight FIGURE is suppressed (header readouts, Y-axis ticks,
  // tooltip values) and replaced with qualitative direction/progress
  // copy — but the trend line, EMA, goal ReferenceLine and projection
  // still RENDER (the shape conveys direction without a number).
  const hideNumber = !!profile?.hideWeightNumber;
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
        <SectionLabel>Weight Trend</SectionLabel>
        {hideNumber ? (
          <p className="text-lg font-bold text-foreground">First weigh-in</p>
        ) : (
          <p className="text-lg font-bold text-foreground font-mono tabular-nums">
            {convert(entry.weight)} {unit}
          </p>
        )}
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

  const trendDisplay = Number.isFinite(currentTrend)
    ? convert(currentTrend)
    : null;
  const goalDisplay =
    goalWeight && Number.isFinite(goalWeight) ? convert(goalWeight) : null;
  const goalDiff =
    goalWeight && Number.isFinite(currentTrend) && Number.isFinite(goalWeight)
      ? convert(Math.abs(currentTrend - goalWeight))
      : null;

  // Span the dataset covers. Used both by the projection gate
  // below AND by the Hist5d T3 thin-data check (≥1M window AND
  // ≥5 points OR the projection lies — see hasEnoughForProjection).
  const firstDate = data.length > 0 ? new Date(data[0].date) : null;
  const lastDate =
    data.length > 0 ? new Date(data[data.length - 1].date) : null;
  const daysSpan =
    firstDate && lastDate
      ? (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      : 0;

  /* Hist5d pin 3 / PR 3 — T3 projection gate, via the unified
     `computeDataConfidence` util. Single source of truth for the
     threshold across every surface that could lie about thin data.
     Replaces the prior 14-day / 2-point threshold which let
     TrendWeight emit a goal projection ("goal by 24 Jul") fitted to
     3-4 noisy points across a short window. Confidence input here
     uses weight data points as the unit (per-metric correct unit
     pattern from Hist5d pin 2) — distinct from the sport-day or
     logged-day units used by Running/Lifting/Nutrition surfaces.
     Plain function call (not useMemo) because the early returns
     above would shift hook order. The util is O(1) pure — fine to
     recompute per render. */
  const dataConfidence = computeDataConfidence({
    pointsInWindow: data.length,
    pointsInPriorWindow: 0,
    windowDays: daysSpan,
  });
  const hasEnoughForProjection = dataConfidence.hasProjection;

  // Projected goal-reach date. Linear extrapolation from the current
  // trend slope — not a prediction engine, just a motivational
  // "at this rate, about X weeks away." Only shown when:
  //   1. hasEnoughForProjection (T3 gate above),
  //   2. The trend is moving in the direction of the goal, and
  //   3. The projected ETA is under ~2 years (otherwise it becomes
  //      demotivating noise — "your goal is 847 days away").
  const projectedGoal: { date: string; weeks: number } | null = (() => {
    if (!goalWeight || !Number.isFinite(goalWeight)) return null;
    if (!hasEnoughForProjection) return null;
    const slope = (data[data.length - 1].trend - data[0].trend) / daysSpan; // kg/day
    const remaining = goalWeight - currentTrend; // +ve if goal is higher, -ve if lower
    // Directions mismatch → not on track for goal, suppress.
    if (slope === 0) return null;
    if (remaining > 0 !== slope > 0) return null;
    const daysToGoal = remaining / slope;
    if (!Number.isFinite(daysToGoal) || daysToGoal <= 0) return null;
    if (daysToGoal > 730) return null;
    const eta = new Date();
    eta.setDate(eta.getDate() + Math.round(daysToGoal));
    const dateLabel = eta.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year:
        eta.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
    return { date: dateLabel, weeks: Math.round(daysToGoal / 7) };
  })();

  // #984 — qualitative header copy for the hidden-number path. Reads
  // the trend slope (start vs current smoothed value) and, when a
  // goal exists, whether that movement is toward or away from it.
  // Never reads a figure aloud.
  const hiddenHeadline = (() => {
    if (!hideNumber) return null;
    const slope = data[data.length - 1].trend - data[0].trend;
    const isFlat = Math.abs(slope) < 0.2;
    if (goalWeight && Number.isFinite(goalWeight)) {
      const remaining = goalWeight - currentTrend;
      if (isFlat) return "Holding steady";
      const towardGoal = remaining > 0 === slope > 0;
      return towardGoal
        ? "Trending toward your goal"
        : "Trending away from goal";
    }
    if (isFlat) return "Holding steady";
    return slope < 0 ? "Trending down" : "Trending up";
  })();

  return (
    <div className="p-4 rounded-2xl bg-card space-y-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Weight Trend</SectionLabel>
        <p className="text-xs text-foreground font-medium">
          {hideNumber ? (
            <span className="text-primary font-bold">{hiddenHeadline}</span>
          ) : trendDisplay != null ? (
            <>
              Trending at{" "}
              <span className="text-primary font-bold font-mono tabular-nums">
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
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
          >
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
            {/* #984 — when hiding the number, suppress the Y-axis tick
                figures and the unit label (the line shape still
                conveys direction). Narrow the axis gutter so the chart
                doesn't leave an empty 45px column. */}
            <YAxis
              domain={["auto", "auto"]}
              tick={
                hideNumber
                  ? false
                  : { fontSize: 10, fill: "hsl(var(--muted-foreground))" }
              }
              axisLine={false}
              tickLine={false}
              width={hideNumber ? 8 : 45}
              tickFormatter={hideNumber ? () => "" : (v) => `${convert(v)}`}
              label={
                hideNumber
                  ? undefined
                  : {
                      value: unit,
                      angle: -90,
                      position: "insideLeft",
                      offset: 0,
                      style: {
                        fontSize: 10,
                        fill: "hsl(var(--muted-foreground))",
                        textAnchor: "middle",
                      },
                    }
              }
            />
            {/* Custom tooltip content — Recharts' Scatter inside ComposedChart
                emits extra payload entries (including the date string as a value,
                which convert() turns into "0 kg"). Filtering to only actual/trend
                entries with valid positive values eliminates the phantom row. */}
            <Tooltip
              cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
              offset={30}
              position={{ y: 0 }}
              allowEscapeViewBox={{ x: false, y: false }}
              wrapperStyle={{ outline: "none", zIndex: 10 }}
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
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: hideNumber ? 0 : 4,
                        color: "hsl(var(--foreground))",
                      }}
                    >
                      {label}
                    </div>
                    {/* #984 — hidden mode shows the date only, never
                        the weight figures. */}
                    {!hideNumber &&
                      relevant.map((entry, i) => (
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
                  // #984 — keep the goal LINE (motivational shape) but
                  // drop the figure from its label when hidden.
                  value: hideNumber ? "Goal" : `Goal: ${goalDisplay}`,
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
              strokeOpacity={0.5}
            />

            <Scatter
              dataKey="actual"
              fill="hsl(var(--muted-foreground))"
              opacity={0.7}
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
      {projectedGoal && (
        <p className="text-xs text-muted-foreground text-center pt-1">
          At this rate, goal by{" "}
          <span className="text-foreground font-medium">
            {projectedGoal.date}
          </span>
          {" · "}~{projectedGoal.weeks}{" "}
          {projectedGoal.weeks === 1 ? "week" : "weeks"}
        </p>
      )}
      {/* Hist5d pin 3 — surface the thin-data reason when the user
          has a goal set but we suppressed the projection. Silent for
          goal-not-set users (no projection promised) and silent for
          on-track users (projection rendered above). Only fires when
          the user has a goal AND we're holding back because the data
          isn't yet trustworthy. */}
      {!projectedGoal &&
        goalWeight &&
        Number.isFinite(goalWeight) &&
        !hasEnoughForProjection && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            Building trend · log{" "}
            {T3_PROJECTION_MIN_POINTS - data.length > 0
              ? `${T3_PROJECTION_MIN_POINTS - data.length} more`
              : "more"}{" "}
            for projection
          </p>
        )}
    </div>
  );
}
