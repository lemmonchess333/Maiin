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
import { THEME } from "@/lib/theme";

interface VolumeChartProps {
  data: { week: string; volume: number }[];
  accentColor?: string;
  /** Hist5c pin 7 — drives X-axis label formatting. Defaults to
   *  weekly for backwards compatibility with any legacy callers. */
  granularity?: ChartGranularity;
}

/* Hist5f S2 + P3: Tooltip matches PerformanceIndexChart's existing
   style (THEME.chartTooltipBg). Reference style per Hist5f-P3 so
   the three Analytics charts read as a coherent set. */
const TOOLTIP_STYLE = {
  background: THEME.chartTooltipBg,
  border: "none" as const,
  borderRadius: 12,
  fontSize: 12,
  color: THEME.textPrimary,
  padding: "8px 12px",
};

export default function VolumeChart({
  data,
  accentColor = "#6B74E0",
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
            className="w-10 h-10 rounded-xl flex items-center justify-center"
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
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.3 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => formatBinLabel(String(v), granularity)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "currentColor", opacity: 0.2 }}
              axisLine={false}
              tickLine={false}
              width={35}
              tickFormatter={(v) =>
                Number(v) >= 1000
                  ? `${(Number(v) / 1000).toFixed(0)}k`
                  : String(v)
              }
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(v) => formatBinLabel(String(v), granularity)}
              formatter={(value) => {
                const n =
                  typeof value === "number" ? value : Number(value ?? 0);
                const display =
                  n >= 1000
                    ? `${(n / 1000).toFixed(1)}k kg`
                    : `${Math.round(n)} kg`;
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
