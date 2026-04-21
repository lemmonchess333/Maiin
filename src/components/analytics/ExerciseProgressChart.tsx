import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

export interface ExerciseProgressPoint {
  date: string;
  value: number;
  // Whether this session was a new all-time best for the active metric.
  // Drives a distinctive star-like dot so "here's where I PR'd" reads
  // from a glance — the pattern Hevy + Caliber use on their per-exercise
  // charts.
  isPR: boolean;
}

interface Props {
  data: ExerciseProgressPoint[];
  accent: string;
}

// Custom dot factory: larger filled marker for PR sessions, small dot
// for regular ones. Recharts passes cx/cy already adjusted to the chart
// coordinate system, so the drawing code here is geometry-only.
function dotRenderer(accent: string) {
  const nonPrFill = `${accent}CC`; // slight transparency on normal dots
  return (props: { cx?: number; cy?: number; payload?: { isPR?: boolean } }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return <g />;
    if (payload?.isPR) {
      // Filled ring with a bright centre — reads as a "milestone" marker
      // without needing a true star polygon (which gets noisy at small
      // sizes). Same visual language the Weight Trend chart uses.
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill={accent} opacity={0.2} />
          <circle cx={cx} cy={cy} r={4} fill={accent} stroke="hsl(var(--card))" strokeWidth={1.5} />
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={2.5} fill={nonPrFill} />;
  };
}

export default function ExerciseProgressChart({ data, accent }: Props) {
  const tickFormatter = (v: string) => {
    const d = new Date(v + "T12:00:00");
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };
  const DotFn = useMemo(() => dotRenderer(accent), [accent]);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center">
        <p className="text-xs text-muted-foreground">
          No sessions in this range
        </p>
      </div>
    );
  }

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 5, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickFormatter={tickFormatter}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
            content={(props) => {
              if (!props.active || !props.payload?.length) return null;
              const point = props.payload[0].payload as ExerciseProgressPoint;
              const label = new Date(point.date + "T12:00:00").toLocaleDateString(
                "en-GB",
                { day: "numeric", month: "short", year: "numeric" },
              );
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
                  <div style={{ color: accent }}>
                    {Math.round(point.value).toLocaleString()}
                    {point.isPR && (
                      <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700 }}>PR</span>
                    )}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={accent}
            strokeWidth={2}
            dot={DotFn}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
