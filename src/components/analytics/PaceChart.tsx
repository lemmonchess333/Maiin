import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { THEME } from "@/lib/theme";
import { CHART_GRID_PROPS, CHART_AXIS_TICK } from "./chartStyles";

interface PaceChartProps {
  data: { label: string; paceSeconds: number }[];
  accentColor?: string;
}

export default function PaceChart({ data, accentColor }: PaceChartProps) {
  if (!data.length) return null;

  const lineColor = accentColor || THEME.running;

  return (
    <div className="p-4 rounded-2xl bg-card border border-border">
      <h3 className="text-sm font-semibold text-foreground mb-3">Pace Trend</h3>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} />
          <XAxis
            dataKey="label"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide />
          <Line
            type="monotone"
            dataKey="paceSeconds"
            stroke={lineColor}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
