import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { CHART_TOOLTIP_STYLE, CHART_AXIS_TICK } from "./chartStyles";
import { formatDayMonth, formatDayMonthYear } from "@/utils/formatters";
import { formatBinLabel } from "@/lib/chartGranularity";

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
  return (props: {
    cx?: number;
    cy?: number;
    payload?: { isPR?: boolean };
  }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null) return <g />;
    if (payload?.isPR) {
      // Filled ring with a bright centre — reads as a "milestone" marker
      // without needing a true star polygon (which gets noisy at small
      // sizes). Same visual language the Weight trend chart uses.
      return (
        <g>
          <circle cx={cx} cy={cy} r={6} fill={accent} opacity={0.2} />
          <circle
            cx={cx}
            cy={cy}
            r={4}
            fill={accent}
            stroke="hsl(var(--card))"
            strokeWidth={1.5}
          />
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={2.5} fill={nonPrFill} />;
  };
}

export default function ExerciseProgressChart({ data, accent }: Props) {
  /* One formatter for every date axis in the app. This copy was
     CORRECT — the "T12:00:00" suffix forced a local parse to match the
     local `getDate()` — but two of its four siblings were not, and four
     hand-rolled copies of the same three lines is how one of them
     drifts. `chartGranularityUsage.test.ts` bans new copies. */
  const tickFormatter = (v: string) => formatBinLabel(v, "daily");
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

  // Screen-reader summary. Recharts renders raw SVG with no built-in
  // accessible name, so VoiceOver users hit a silent rectangle without
  // this. Includes session count, range, latest value, and PR count
  // — enough to convey the trend without the visual.
  const prCount = data.filter((d) => d.isPR).length;
  const firstDate = formatDayMonth(new Date(data[0].date + "T12:00:00"));
  const lastDate = formatDayMonth(
    new Date(data[data.length - 1].date + "T12:00:00")
  );
  const latestValue = Math.round(data[data.length - 1].value).toLocaleString();
  const ariaLabel = `Progression chart, ${data.length} session${data.length === 1 ? "" : "s"} from ${firstDate} to ${lastDate}. Latest value: ${latestValue}. ${prCount} personal record${prCount === 1 ? "" : "s"}.`;

  return (
    <div className="h-44" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        {/* `accessibilityLayer={false}`, because the wrapper above has
            already done this properly: it declares the graphic atomic
            with `role="img"` and gives it the full text alternative —
            session count, range, latest value, PR count.

            Recharts 3 defaults the layer to TRUE, which puts
            `tabIndex="0"` and `role="application"` on the <svg> INSIDE
            that `role="img"`. A focusable application region inside an
            element the author declared to be a single image is the same
            shape as a tab stop inside `aria-hidden`: the reader is
            invited into a subtree that is not supposed to be entered,
            and once there its own navigation keys stop working. The
            sentence above is the accessible version of this chart; a
            second, unnamed way in is not an improvement. */}
        <LineChart
          accessibilityLayer={false}
          data={data}
          margin={{ top: 10, right: 12, bottom: 5, left: 0 }}
        >
          <XAxis
            dataKey="date"
            tick={CHART_AXIS_TICK}
            tickFormatter={tickFormatter}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={CHART_AXIS_TICK}
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
              const label = formatDayMonthYear(
                new Date(point.date + "T12:00:00")
              );
              // Container style comes from the shared token so this
              // chart's tooltip matches the other analytics charts — it
              // had drifted into a fourth bespoke treatment (bordered,
              // shadowed, different padding).
              return (
                <div style={CHART_TOOLTIP_STYLE}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {label}
                  </div>
                  <div style={{ color: accent }}>
                    {Math.round(point.value).toLocaleString()}
                    {point.isPR && (
                      <span
                        style={{ marginLeft: 6, fontSize: 10, fontWeight: 700 }}
                      >
                        PR
                      </span>
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
