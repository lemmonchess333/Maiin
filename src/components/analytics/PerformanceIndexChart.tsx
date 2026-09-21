// src/components/analytics/PerformanceIndexChart.tsx
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceArea,
  Line,
  Tooltip,
} from "recharts";
import type { PerformanceWeekDoc } from "@/lib/performanceTypes";
import { THEME } from "@/lib/theme";
import { track as trackHistoryEvent } from "@/lib/historyAnalytics";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  CHART_AXIS_TICK,
} from "./chartStyles";
import ChartAreaGradient from "./ChartAreaGradient";
import { formatDayMonth } from "@/utils/formatters";
import {
  averageCaption,
  averagePerformanceIndex,
  averageWeekCount,
  rollingAverageSeries,
} from "@/lib/performanceAverage";
import { formatBinLabel } from "@/lib/chartGranularity";

interface Props {
  weeks: PerformanceWeekDoc[];
}

/**
 * The bands, as y-ranges, read straight off `computeLoadBand`'s
 * thresholds. Written here as a table rather than re-derived so the
 * boundaries are legible beside the labels they carry; the cross-test
 * above keeps the two engines honest about the numbers themselves.
 */
const BANDS = [
  { label: "Deload", from: 0, to: 25, warn: false },
  { label: "Low", from: 25, to: 45, warn: false },
  { label: "Moderate", from: 45, to: 70, warn: false },
  { label: "High", from: 70, to: 85, warn: false },
  { label: "Overreach", from: 85, to: 100, warn: true },
] as const;

export default function PerformanceIndexChart({ weeks }: Props) {
  const average = rollingAverageSeries(weeks);
  const data = weeks.map((d, i) => ({
    week: d.weekKey,
    pi: d.performanceIndex,
    liftLoad: d.breakdown.liftLoadScore,
    runLoad: d.breakdown.runLoadScore,
    recovery: d.breakdown.recoveryScore,
    avg: average[i],
  }));

  if (data.length === 0) return null;

  const avgValue = averagePerformanceIndex(weeks);
  const avgWeeks = averageWeekCount(weeks);

  return (
    <div className="p-4 rounded-2xl bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          Performance Index
        </h3>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          0–100 · last {data.length}w
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          aria-label="Performance Index over recent weeks, scored 0 to 100"
          data={data}
          /* No NEGATIVE left margin. Pulling the plot 10px left reclaims
             gutter on a chart whose labels are short, and this one's are
             not: the domain is fixed [0, 100] and the caption above says
             so, so the top gridline must render three digits. 28px of
             axis minus 10px of margin left 18, and "100" clipped to "00"
             — the chart could not draw the number it advertises. */
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          /* Hist5f S1: tap-attempt telemetry on the PI chart.
             onClick on the AreaChart fires when a data-point's
             activeDot is tapped. activePayload[0].payload is the
             tapped week's full record; we only emit chart + binKey
             + the PI value (not the sub-scores) per the locked
             event payload.
             Recharts' typed MouseHandlerDataParam omits the
             `activePayload` field that exists at runtime — narrow
             via a local cast. */
          onClick={(state) => {
            const s = state as {
              activePayload?: Array<{ payload?: { week: string; pi: number } }>;
            };
            const payload = s.activePayload?.[0]?.payload;
            if (!payload) return;
            trackHistoryEvent("history_chart_tap_attempted", {
              chart: "pi",
              binKey: payload.week,
              value: payload.pi,
            });
          }}
        >
          <ChartAreaGradient id="pi-gradient" color={THEME.brand} />

          <CartesianGrid {...CHART_GRID_PROPS} />

          {/* The bands, in the plot, where they belong.

              `computeLoadBand` is a pure function of the PI value —
              85 / 70 / 45 / 25, identical in `src/lib/performanceEngine`
              and `functions/lib/perfScoring`, pinned by
              `performanceEngineParity.cross.test.ts`. So a band IS a
              y-range on this axis, and the two dashed threshold lines
              this replaces were already drawing two of its four
              boundaries. Drawing all five as zones states the same fact
              once, positionally, and retires the five-item dot legend
              that existed to decode a colour the y-position had already
              given away.

              NOT five hues. `performanceColour.ts` locks PI to two —
              brand purple, amber when backing off — and a rainbow behind
              a purple line would invent a sixth vocabulary on a surface
              that has two. The lower four zones are one neutral at
              alternating weight so the strips separate; only Overreach
              carries a colour, because only Overreach is a caution. */}
          {BANDS.map((b, i) => (
            <ReferenceArea
              key={b.label}
              y1={b.from}
              y2={b.to}
              fill={b.warn ? THEME.amber : "hsl(var(--muted-foreground))"}
              fillOpacity={b.warn ? 0.12 : i % 2 === 0 ? 0.09 : 0.05}
              stroke="none"
              /* Pinned to the zone's own top edge, not floated in its
                 middle. Filmed at `insideRight` first and the reader it
                 was drawn for walked straight into it: this account sits
                 at PI 88-92, so "Overreach" printed across its own data
                 line. A label on a boundary reads as an annotation of
                 that boundary; one in the middle of a band reads as
                 something the series has to get around.

                 Half opacity for the same reason — the bands are the
                 reference scale, and a scale that competes with the
                 series it exists to calibrate has the hierarchy
                 backwards. */
              label={{
                value: b.label,
                position: "insideTopRight",
                fill: "hsl(var(--muted-foreground))",
                fillOpacity: 0.65,
                fontSize: 9,
              }}
            />
          ))}

          <XAxis
            dataKey="week"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            /* The shared formatter. Its NaN guard moved into
               `formatBinLabel` with the parsing, so an unparseable key
               still yields an empty tick rather than "NaN/NaN". */
            tickFormatter={(v: string | number) =>
              formatBinLabel(
                typeof v === "string" ? v : String(v ?? ""),
                "daily"
              )
            }
          />

          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            /* 32, not the 28 its siblings use: theirs label single digits
               (RunningHistorySection) or abbreviate (VolumeChart's 35 for
               "2.4k"). Three digits need the room. */
            width={32}
          />

          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelFormatter={(label) => {
              const s = typeof label === "string" ? label : String(label ?? "");
              const d = new Date(s + "T00:00:00");
              if (Number.isNaN(d.getTime())) return "";
              return `Week of ${formatDayMonth(d)}`;
            }}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                pi: "PI",
                liftLoad: "Lift load",
                runLoad: "Run load",
                recovery: "Recovery",
              };

              const n = typeof name === "string" ? name : String(name ?? "");
              const v = typeof value === "number" ? value : Number(value ?? 0);

              return [v, labels[n] || n] as [number, string];
            }}
          />

          <Area
            type="monotone"
            dataKey="pi"
            stroke={THEME.brand}
            strokeWidth={2.5}
            fill="url(#pi-gradient)"
            /* Recharts sweeps an area in from the left on mount, over
               about a second and a half, driven by requestAnimationFrame
               — so it is not a CSS animation and Playwright's
               `animations: "disabled"` does not touch it. Adding the
               average line shifted this chart's render timing enough for
               a capture to land mid-sweep: the frame showed the fill
               ending at x=233 of a 357-wide plot, with a hard vertical
               edge, which measured as a real difference against the
               pre-change frame rather than as noise.

               Off, for two reasons beyond the rig. Nothing gates it on
               `prefers-reduced-motion` — `useReducedMotion` covers
               framer, and Recharts has never been wired to it — so the
               sweep plays for a reader who asked the OS for no motion.
               And the chart's content is a six-point trend that is
               readable the instant it paints; an entrance that hides the
               left half of it for a second buys nothing. */
            isAnimationActive={false}
            /* One colour, because the zone behind the dot now says what
               band the week was in. The dot was painted from
               `resolveLoadBand`, which resolves to `computeLoadBand(pi)`
               — so its colour was a function of its own height, and the
               legend under the chart existed to translate a y-position
               back into the y-position. That redundancy is what went.

               Still a custom renderer rather than a `dot` object, for
               the card-coloured cutout ring: `THEME.surface` (#1A1A1F)
               as a fixed stroke drew a dark halo on the white light-mode
               card, and the ring is what keeps the dots legible where
               the line doubles back on itself. */
            dot={(props) => {
              const { cx, cy, payload } = props as {
                cx: number;
                cy: number;
                payload: { week: string };
              };
              return (
                <circle
                  key={payload.week}
                  cx={cx}
                  cy={cy}
                  r={3.5}
                  strokeWidth={1.5}
                  style={{ fill: THEME.brand, stroke: "hsl(var(--card))" }}
                />
              );
            }}
            activeDot={{ r: 5, stroke: THEME.brand, strokeWidth: 2 }}
          />

          {/* P2d pin 5 — "dashed muted-gray average line vs solid
              colored PI series". Specified in the lock, never built.
              After the Area so it draws over the fill rather than under
              it, and `connectNulls` so a week with no baseline behind it
              leaves a gap instead of a drop to zero. */}
          <Line
            type="monotone"
            dataKey="avg"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* The five-item legend is gone with the dot colours it decoded.
          What stands here instead is pin 6's tertiary caption — "average
          is context not headline" — naming the figure and, crucially,
          the number of weeks it actually covers. */}
      {avgValue !== null && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          {averageCaption(avgValue, avgWeeks)}
        </p>
      )}
    </div>
  );
}
