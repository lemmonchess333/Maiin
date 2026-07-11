import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { Split } from "../../lib/gps";
import { paceLabel } from "../../lib/runLabels";
import { THEME } from "@/lib/theme";
import { CHART_AXIS_TICK } from "./chartStyles";

interface SplitsBarChartProps {
  splits: Split[];
  avgPaceSeconds: number;
  accentColor?: string;
}

export default function SplitsBarChart({
  splits,
  avgPaceSeconds,
  accentColor = THEME.teal,
}: SplitsBarChartProps) {
  if (splits.length === 0) return null;

  const maxPace = Math.max(...splits.map((s) => s.paceSeconds));
  const data = splits.map((s) => ({
    km: `${s.km}`,
    pace: s.paceSeconds,
    invertedPace: maxPace - s.paceSeconds + 60,
    paceLabel: s.pace,
    isFast: s.paceSeconds < avgPaceSeconds * 0.97,
    isSlow: s.paceSeconds > avgPaceSeconds * 1.03,
  }));

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Splits</h3>
        <p className="text-xs font-mono tabular-nums text-muted-foreground">
          avg {paceLabel(avgPaceSeconds)}
        </p>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barCategoryGap="20%">
          <XAxis
            dataKey="km"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Bar dataKey="invertedPace" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={accentColor}
                fillOpacity={entry.isFast ? 1 : entry.isSlow ? 0.35 : 0.65}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex justify-around mt-1">
        {data.map((d, i) => (
          <p
            key={i}
            className={`text-xs font-mono tabular-nums ${
              d.isFast
                ? "text-success"
                : d.isSlow
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {d.paceLabel}
          </p>
        ))}
      </div>
    </div>
  );
}
