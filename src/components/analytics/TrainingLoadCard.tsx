import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Activity } from "lucide-react";
import { THEME } from "@/lib/theme";
import type { LoadPoint } from "@/lib/trainingLoad";
import { Skeleton } from "@/components/LoadingSkeleton";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Training load — the daily fitness / fatigue / form curve (competitive
 * teardown #4). Strava's Fitness & Freshness, but spanning BOTH disciplines:
 * every eligible run AND lift feeds one curve (effort-weighted training
 * minutes → 42d/7d impulse-response, src/lib/trainingLoad.ts).
 *
 * Cross-sport surface → PI-family identity: fitness in brand purple,
 * fatigue in the amber data step (a metric, not a warning banner), form as
 * a signed chip (success/destructive by sign). Range-scoped like the rest
 * of the Analytics body — the hook warms the EWMAs up on pre-window
 * history, so the curve is honest at the window edge.
 */

const numberFmt = (n: number) => Math.round(n).toString();

export default function TrainingLoadCard({
  points,
  loading,
}: {
  points: LoadPoint[];
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-56 w-full rounded-2xl" />;
  }

  const hasAnyLoad = points.some((p) => p.load > 0 || p.fitness > 0.5);
  if (!hasAnyLoad) {
    return (
      <div className="p-4 rounded-2xl bg-card card-shadow">
        <EmptyState
          compact
          icon={Activity}
          headline="Your training load curve builds here"
          sub="Every workout and run feeds one fitness/fatigue curve — log a few sessions and the trend appears."
        />
      </div>
    );
  }

  const last = points[points.length - 1];
  const formPositive = last.form >= 0;

  // Sparse x labels: ~5 ticks across the window.
  const tickEvery = Math.max(1, Math.floor(points.length / 5));
  const data = points.map((p, i) => ({
    ...p,
    label: i % tickEvery === 0 ? p.dateKey.slice(5).replace("-", "/") : "",
  }));

  return (
    <div className="p-4 rounded-2xl bg-card card-shadow">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Activity
            className="size-4"
            style={{ color: THEME.brand }}
            aria-hidden="true"
          />
          <h3 className="text-sm font-bold text-foreground">Training load</h3>
        </div>
        {/* Form — the takeaway number: fresh (+) or carrying fatigue (−). */}
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full font-mono tabular-nums ${
            formPositive
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          Form {formPositive ? "+" : ""}
          {numberFmt(last.form)}
        </span>
      </div>

      <p className="text-xs text-muted-foreground mb-2 font-mono tabular-nums">
        <span style={{ color: THEME.brand }}>
          Fitness {numberFmt(last.fitness)}
        </span>
        {" · "}
        <span style={{ color: THEME.amberLight }}>
          Fatigue {numberFmt(last.fatigue)}
        </span>
      </p>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={THEME.chartGrid}
            vertical={false}
          />
          <XAxis
            dataKey="label"
            interval={0}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={[0, "auto"]} />
          <Area
            type="monotone"
            dataKey="fitness"
            stroke={THEME.brand}
            strokeWidth={2}
            fill={THEME.brand}
            fillOpacity={0.12}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="fatigue"
            stroke={THEME.amberLight}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground mt-2">
        Every run and lift feeds one curve — fitness is your 6-week training
        base, fatigue the last 7 days. Positive form = fresh; deep negative =
        time to ease off.
      </p>
    </div>
  );
}
