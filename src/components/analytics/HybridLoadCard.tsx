import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { THEME } from "@/lib/theme";
import { formatDayMonth } from "@/utils/formatters";
import { parseLocalDate } from "@/lib/dateHelpers";
import {
  CHART_AXIS_TICK,
  CHART_BAR_MAX_WIDTH,
  CHART_GRID_PROPS,
  CHART_TOOLTIP_STYLE,
} from "./chartStyles";
import {
  computeHybridTrainingLoad,
  type ComputeHybridTrainingLoadInput,
  type HybridFormStatus,
  type HybridLoadPoint,
} from "@/lib/hybridTrainingLoad";

const STATUS_LABELS: Record<
  Exclude<HybridFormStatus, "insufficient">,
  string
> = {
  fresh: "Fresh",
  optimal: "Balanced",
  building: "Building",
  overreaching: "Heavy load",
};

function formatSigned(value: number): string {
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return `−${Math.abs(value).toFixed(1)}`;
  return "0.0";
}

function shortDateTick(dateKey: string): string {
  const parsed = parseLocalDate(dateKey);
  if (!parsed || Number.isNaN(parsed.getTime())) return dateKey;
  return formatDayMonth(parsed);
}

interface ChartRow {
  date: string;
  liftLoad: number;
  runLoad: number;
  fitnessActual: number | null;
  fatigueActual: number | null;
  fitnessProjected: number | null;
  fatigueProjected: number | null;
  fitness: number;
  fatigue: number;
  form: number;
  projected: boolean;
}

function buildChartRows(
  series: HybridLoadPoint[],
  projectedSeries: HybridLoadPoint[],
  showProjection: boolean
): ChartRow[] {
  const rows: ChartRow[] = series.map((p, idx) => {
    const isBridge =
      showProjection && projectedSeries.length > 0 && idx === series.length - 1;
    return {
      date: p.date,
      liftLoad: p.liftLoad,
      runLoad: p.runLoad,
      fitnessActual: p.fitness,
      fatigueActual: p.fatigue,
      fitnessProjected: isBridge ? p.fitness : null,
      fatigueProjected: isBridge ? p.fatigue : null,
      fitness: p.fitness,
      fatigue: p.fatigue,
      form: p.form,
      projected: false,
    };
  });
  if (showProjection && projectedSeries.length > 0) {
    for (const p of projectedSeries) {
      rows.push({
        date: p.date,
        liftLoad: p.liftLoad,
        runLoad: p.runLoad,
        fitnessActual: null,
        fatigueActual: null,
        fitnessProjected: p.fitness,
        fatigueProjected: p.fatigue,
        fitness: p.fitness,
        fatigue: p.fatigue,
        form: p.form,
        projected: true,
      });
    }
  }
  return rows;
}

function PmcTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ChartRow }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div style={CHART_TOOLTIP_STYLE} className="space-y-1 shadow-lg">
      <p className="font-medium text-foreground">
        {shortDateTick(row.date)}
        {row.projected ? " · Projected" : ""}
      </p>
      <div className="space-y-1 text-xs font-mono tabular-nums text-muted-foreground">
        <p>Fitness: {row.fitness.toFixed(1)}</p>
        <p>Fatigue: {row.fatigue.toFixed(1)}</p>
        <p>Form: {formatSigned(row.form)}</p>
        {row.liftLoad > 0 && <p>Lift load: {row.liftLoad.toFixed(0)} AU</p>}
        {row.runLoad > 0 && <p>Run load: {row.runLoad.toFixed(0)} AU</p>}
      </div>
    </div>
  );
}

export default function HybridLoadCard({
  workouts,
  runs,
  todayKey,
  programState,
}: ComputeHybridTrainingLoadInput) {
  const [showProjection, setShowProjection] = useState(true);
  const load = useMemo(
    () => computeHybridTrainingLoad({ workouts, runs, todayKey, programState }),
    [workouts, runs, todayKey, programState]
  );

  if (load.status === "insufficient") return null;

  const hasProjection = load.projectedSeries.length > 0;
  const chartRows = buildChartRows(
    load.series,
    load.projectedSeries,
    hasProjection && showProjection
  );
  const statusLabel = STATUS_LABELS[load.status];
  const deltaAbs = Math.abs(load.fitnessDelta14d).toFixed(1);
  const trendLead =
    load.fitnessDelta14d >= 0.5
      ? "up"
      : load.fitnessDelta14d <= -0.5
        ? "down"
        : "steady";

  const guidance =
    load.status === "overreaching"
      ? "Recent fatigue is well above your 6-week base. A lighter day or two helps absorb the work."
      : load.status === "building"
        ? "Recent load is ahead of your 6-week base. Keep easy sessions genuinely easy."
        : load.status === "fresh"
          ? "Fatigue has cleared below your 6-week base, leaving room for a harder effort."
          : "Recent load and your 6-week base are in balance for steady training.";

  const xTickInterval = Math.max(0, Math.floor(chartRows.length / 4) - 1);

  return (
    <Card size="compact" tone="flat" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-foreground">Fitness and form</span>
        <div className="flex items-center gap-2">
          {hasProjection && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowProjection((v) => !v)}
              aria-pressed={showProjection}
              className="-my-2 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {showProjection ? "Hide forecast" : "Show forecast"}
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{statusLabel}</span>
        </div>
      </div>

      <div className="@container">
        <div className="grid grid-cols-3 @max-[17em]:grid-cols-1 gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Fitness</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {load.fitness.toFixed(1)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Fatigue</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {load.fatigue.toFixed(1)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Form</p>
            <p className="text-lg font-bold font-figure tabular-nums text-foreground">
              {formatSigned(load.form)}
            </p>
          </div>
        </div>
      </div>

      {chartRows.length >= 2 && (
        <div className="space-y-2">
          <div
            role="img"
            className="h-[152px] w-full"
            aria-label="Fitness and fatigue trajectory"
          >
            <ResponsiveContainer width="100%" height={152}>
              <ComposedChart
                data={chartRows}
                margin={{ top: 6, right: 4, bottom: 0, left: -16 }}
              >
                <CartesianGrid {...CHART_GRID_PROPS} />
                <XAxis
                  dataKey="date"
                  tick={CHART_AXIS_TICK}
                  tickFormatter={shortDateTick}
                  interval={xTickInterval}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                />
                <Tooltip content={<PmcTooltip />} />
                {hasProjection && showProjection && (
                  <ReferenceLine
                    x={todayKey}
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                  />
                )}
                {load.hasLift && (
                  <Bar
                    dataKey="liftLoad"
                    stackId="daily"
                    fill={THEME.brand}
                    fillOpacity={0.18}
                    maxBarSize={CHART_BAR_MAX_WIDTH}
                    isAnimationActive={false}
                  />
                )}
                {load.hasRun && (
                  <Bar
                    dataKey="runLoad"
                    stackId="daily"
                    fill={THEME.running}
                    fillOpacity={0.2}
                    maxBarSize={CHART_BAR_MAX_WIDTH}
                    isAnimationActive={false}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="fitnessActual"
                  stroke={THEME.brand}
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="fatigueActual"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {hasProjection && showProjection && (
                  <>
                    <Line
                      type="monotone"
                      dataKey="fitnessProjected"
                      stroke={THEME.brand}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigueProjected"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3 rounded-full bg-primary"
                aria-hidden="true"
              />
              Fitness
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-3 rounded-full bg-muted-foreground"
                aria-hidden="true"
              />
              Fatigue
            </span>
            {load.hasLift && load.hasRun && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm bg-primary/35"
                    aria-hidden="true"
                  />
                  Lift
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm bg-running/35"
                    aria-hidden="true"
                  />
                  Run
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {load.raceDayProjection && showProjection && (
        <p className="text-xs leading-relaxed text-foreground">
          Race day ({shortDateTick(load.raceDayProjection.date)}): projected
          form{" "}
          <span className="font-mono tabular-nums font-medium">
            {formatSigned(load.raceDayProjection.form)}
          </span>{" "}
          ({STATUS_LABELS[load.raceDayProjection.status].toLowerCase()}).
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {trendLead === "steady" ? (
          <>
            Fitness is steady over the last{" "}
            <span className="font-mono tabular-nums">14</span> days. {guidance}
          </>
        ) : (
          <>
            Fitness is {trendLead}{" "}
            <span className="font-mono tabular-nums">{deltaAbs}</span> over the
            last <span className="font-mono tabular-nums">14</span> days.{" "}
            {guidance}
          </>
        )}
      </p>

      <p className="text-xs text-muted-foreground">
        {load.hasLift && load.hasRun
          ? "Combined lifting and running"
          : load.hasLift
            ? "Lifting load"
            : "Running load"}{" "}
        · <span className="font-mono tabular-nums">{load.activeDays42d}</span>{" "}
        active days in <span className="font-mono tabular-nums">6</span> weeks
      </p>
    </Card>
  );
}
