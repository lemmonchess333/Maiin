import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  Tooltip,
} from "recharts";
import { formatBinLabel, type ChartGranularity } from "@/lib/chartGranularity";
import { track as trackHistoryEvent } from "@/lib/historyAnalytics";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  CHART_AXIS_TICK,
} from "./chartStyles";
import { THEME } from "@/lib/theme";
import { abbreviateK } from "@/utils/formatters";

interface VolumeChartProps {
  data: { week: string; volume: number }[];
  accentColor?: string;
  /** Hist5c pin 7 — drives X-axis label formatting. Defaults to
   *  weekly for backwards compatibility with any legacy callers. */
  granularity?: ChartGranularity;
}

export default function VolumeChart({
  data,
  accentColor = THEME.lifting,
  granularity = "weekly",
}: VolumeChartProps) {
  return (
    <div className="p-4 rounded-2xl bg-card">
      {/* No "Weekly Volume" heading here — the StatCard directly above
          already carries that label ("WEEKLY VOLUME"). Redundant heading
          stacked two cards deep was part of the "too many labels" feel
          flagged on the Analytics tab. Keeping only the "kg lifted" axis
          hint, right-aligned to keep the card's top edge useful. */}
      <div className="flex items-center justify-end mb-3">
        <p className="text-xs text-muted-foreground">kg lifted</p>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[140px] gap-2">
          <div
            className="size-10 rounded-xl flex items-center justify-center"
            style={{ background: `${accentColor}15` }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={accentColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="12" width="4" height="8" rx="1" />
              <rect x="10" y="8" width="4" height="12" rx="1" />
              <rect x="17" y="4" width="4" height="16" rx="1" />
            </svg>
          </div>
          <p className="text-xs text-muted-foreground">
            Complete workouts to see your volume trend
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={140}>
          <BarChart
            data={data}
            barCategoryGap="25%"
            /* Hist5f S1: tap-attempt telemetry on the bar chart.
             onClick fires on bar tap with the data point payload.
             Hist5f P6 honour: bars with volume === 0 are
             dataConfidence-suppressed; skip telemetry for those
             (they aren't interactive-eligible).
             Recharts' typed MouseHandlerDataParam omits the
             `activePayload` field that exists at runtime — narrow
             via a local cast to a shape we know is populated when
             the chart fires onClick with a hit. */
            onClick={(state) => {
              const s = state as {
                activePayload?: Array<{
                  payload?: { week: string; volume: number };
                }>;
              };
              const payload = s.activePayload?.[0]?.payload;
              if (!payload || payload.volume === 0) return;
              trackHistoryEvent("history_chart_tap_attempted", {
                chart: "volume",
                binKey: payload.week,
                value: payload.volume,
              });
            }}
          >
            <CartesianGrid {...CHART_GRID_PROPS} />
            <XAxis
              dataKey="week"
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatBinLabel(String(v), granularity)}
            />
            <YAxis
              tick={CHART_AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={35}
              /* abbreviateK keeps the axis on the SAME 1-decimal
                 precision as the tooltip below — the old 0-decimal
                 axis labelled a 1500 kg gridline "2k" while the
                 tooltip said "1.5k kg" for the same value. */
              tickFormatter={(v) => abbreviateK(Number(v))}
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              labelFormatter={(v) => formatBinLabel(String(v), granularity)}
              formatter={(value) => {
                const n =
                  typeof value === "number" ? value : Number(value ?? 0);
                const display = `${abbreviateK(n)} kg`;
                return [display, "Volume"] as [string, string];
              }}
              cursor={{ fill: "currentColor", fillOpacity: 0.05 }}
            />
            <Bar dataKey="volume" radius={[4, 4, 0, 0]} minPointSize={2}>
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.volume === 0 ? "hsl(var(--border))" : accentColor}
                  fillOpacity={
                    entry.volume === 0 ? 0.4 : i === data.length - 1 ? 1 : 0.5
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
