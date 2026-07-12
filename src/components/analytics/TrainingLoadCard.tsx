import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Activity } from "lucide-react";
import { THEME } from "@/lib/theme";
import { CHART_GRID_PROPS, CHART_AXIS_TICK } from "./chartStyles";
import ChartAreaGradient from "./ChartAreaGradient";
import type { LoadPoint } from "@/lib/trainingLoad";
import { Skeleton } from "@/components/LoadingSkeleton";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Training load — the daily fitness / fatigue / form curve (competitive
 * teardown #4), drawn in the Tropos register rather than a Strava clone:
 *
 *  - ONE smooth line: fitness (brand purple, PI-chart gradient family).
 *    Fatigue is deliberately NOT a line — a 7-day EWMA over train/rest days
 *    sawtooths into visual noise ("the yellow squiggly"); it reads as a
 *    NUMBER next to fitness, and its meaning ships in the Form chip.
 *  - Daily load as short sport-coded bars along the baseline — coral run,
 *    purple lift, stacked. That makes the run+lift span (the differentiator)
 *    visible at a glance, and gives training days texture without a second
 *    squiggle. Bars ride their own hidden axis scaled so they stay in the
 *    bottom third under the fitness curve.
 *
 * Range-scoped like the rest of the Analytics body — the hook warms the
 * EWMAs on pre-window history, so the curve is honest at the window edge.
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

  // The load bars ride a separate hidden axis stretched to ~3× the peak
  // day, pinning them to the bottom third so the fitness curve owns the
  // card and training days read as baseline texture.
  const maxDayLoad = Math.max(1, ...points.map((p) => p.load));

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
        <span>Fatigue {numberFmt(last.fatigue)}</span>
      </p>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="25%"
        >
          <ChartAreaGradient
            id="load-fitness"
            color={THEME.brand}
            topOpacity={0.3}
          />
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="label"
            interval={0}
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis yAxisId="fitness" hide domain={[0, "auto"]} />
          <YAxis yAxisId="load" hide domain={[0, maxDayLoad * 3]} />
          {/* Daily training, sport-coded: coral run + purple lift. */}
          <Bar
            yAxisId="load"
            dataKey="runLoad"
            stackId="day"
            fill={THEME.running}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          <Bar
            yAxisId="load"
            dataKey="liftLoad"
            stackId="day"
            fill={THEME.brand}
            fillOpacity={0.55}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Area
            yAxisId="fitness"
            type="monotone"
            dataKey="fitness"
            stroke={THEME.brand}
            strokeWidth={2}
            fill="url(#load-fitness)"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground mt-2">
        The purple curve is your 6-week training base; the bars are daily
        sessions (<span style={{ color: THEME.running }}>runs</span> ·{" "}
        <span style={{ color: THEME.brand }}>lifts</span>). Positive form =
        fresh; deep negative = time to ease off.
      </p>
    </div>
  );
}
