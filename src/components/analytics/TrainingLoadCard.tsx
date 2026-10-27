import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import TimeRangePills from "./TimeRangePills";
import { Activity, Info } from "lucide-react";
import { THEME } from "@/lib/theme";
import UITooltip from "@/components/ui/Tooltip";
import {
  CHART_GRID_PROPS,
  CHART_AXIS_TICK,
  CHART_TOOLTIP_STYLE,
  CHART_TOOLTIP_SEPARATOR,
} from "./chartStyles";
import { formatBinLabel } from "@/lib/chartGranularity";
import ChartAreaGradient from "./ChartAreaGradient";
import { evaluateLoadGuardrails, type LoadPoint } from "@/lib/trainingLoad";
import { Skeleton } from "@/components/LoadingSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { formatSigned } from "@/utils/formatters";

/* The card's own legend, moved off the surface and behind the ⓘ. The
   sport words keep their `-strong` steps: an identity is a fill value
   and measures 3.87:1 for purple / 3.58:1 for coral at this size, under
   the 4.5:1 floor 12px words need. Pinned by identityColour.test.ts. */
const TRAINING_LOAD_EXPLAINER = (
  <>
    The purple curve is your 6-week training base; the dashed line is the
    fatigue you are carrying now, and the bars are daily sessions (
    <span className="text-running-strong">runs</span> ·{" "}
    <span className="text-lifting-strong">lifts</span>). All three are
    effort-weighted minutes. The curves read against the left scale and the bars
    against the right. Positive form = fresh; deep negative = time to ease off.
  </>
);

/**
 * Training load — the daily fitness / fatigue / form curve (competitive
 * teardown #4), drawn in the Tropos register rather than a Strava clone:
 *
 *  - Fitness as the one filled curve (brand purple, PI-chart gradient
 *    family), and fatigue as a muted dashed line, so Form, the chip in the
 *    header, is the gap between them.
 *  - Daily load as sport-coded bars, coral run and purple lift, stacked,
 *    which makes the run+lift span (the differentiator) visible at a
 *    glance. The bars have their own scale, on the right.
 *
 * Range-scoped like the rest of the Analytics body — the hook warms the
 * EWMAs on pre-window history, so the curve is honest at the window edge.
 */

const numberFmt = (n: number) => Math.round(n).toString();

/** The daily bars' own scale. The curves keep Recharts' default axis. */
const DAY_AXIS = "day";

export default function TrainingLoadCard({
  points,
  loading,
  range,
}: {
  points: LoadPoint[];
  loading: boolean;
  /** The range the curve covers, as the card's own control: on the
   *  Performance page it scopes this card and nothing else, so it sits
   *  under the card's title rather than across the page. It stays put
   *  while a new range loads. */
  range?: { selected: string; onChange: (value: string) => void };
}) {
  const rangeRow = range ? (
    <div className="mb-3">
      <TimeRangePills selected={range.selected} onChange={range.onChange} />
    </div>
  ) : null;
  if (loading) {
    if (!range) return <Skeleton className="h-56 w-full rounded-2xl" />;
    return (
      <div className="p-4 rounded-2xl bg-card card-shadow">
        <h3 className="mb-3 text-base font-bold text-foreground">
          Training load
        </h3>
        {rangeRow}
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const hasAnyLoad = points.some((p) => p.load > 0 || p.fitness > 0.5);
  if (!hasAnyLoad) {
    return (
      <div className="p-4 rounded-2xl bg-card card-shadow">
        {range && (
          <h3 className="mb-3 text-base font-bold text-foreground">
            Training load
          </h3>
        )}
        {rangeRow}
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
  const formFresh = last.form >= 0;
  // B1 guardrails — pure evaluation over the same points the chart draws.
  const guardrails = evaluateLoadGuardrails(points);

  // Sparse x labels: ~5 ticks across the window.
  const tickEvery = Math.max(1, Math.floor(points.length / 5));
  const data = points.map((p, i) => ({
    ...p,
    // `formatBinLabel`, which is what every other chart axis on this page
    // uses. Slicing the ISO key gives MM/DD — month-first, the one order
    // this app does not write — so a September 4th bar read "09/04"
    // beside a run chart reading "7/9" for September 7th. Same page, two
    // orders, and the one here is ambiguous rather than merely unusual:
    // "09/04" is a legible date under either reading.
    label: i % tickEvery === 0 ? formatBinLabel(p.dateKey, "daily") : "",
  }));
  const labelByDay = new Map(data.map((d) => [d.dateKey, d.label]));

  /* Two drawn scales for one unit. Everything here is effort-weighted
     minutes (`trainingLoad.ts`), over different windows: a bar is one
     day's minutes, while fitness and fatigue are 42- and 7-day averages
     of them. A training day is a multiple of the average: two or three
     times it for someone who trains most days, seven or more for someone
     who trains once a week, and more again in a new account's first
     weeks, before the 42-day average has filled. On a shared axis the
     curves would lie flat on the floor under the bars, and the header's
     numbers would have nothing to be read against.

     So the curves read against the left scale, which the grid follows,
     and the bars against the right one, the way TrainingPeaks' Performance
     Management Chart puts daily TSS on a second axis beside CTL and ATL.
     Both scales are drawn, both start at zero and neither allows
     fractions, so "Fitness 6" sits at a labelled height, and run and lift
     still stack on one scale of their own. */

  return (
    <div className="p-4 rounded-2xl bg-card card-shadow">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Activity
            className="size-4"
            style={{ color: THEME.brand }}
            aria-hidden="true"
          />
          <h3 className="text-base font-bold text-foreground">Training load</h3>
          {/* How to read the chart, on request. It was a permanent
              paragraph under the plot — help text, re-read on every
              visit, holding ~60px between two charts on a page that is
              already twelve screens. The Performance Index put the same
              kind of explanation behind this affordance; this is that
              pattern applied to its neighbours. */}
          <UITooltip content={TRAINING_LOAD_EXPLAINER}>
            <button
              type="button"
              aria-label="How to read training load"
              className="p-4 -m-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Info className="size-3" aria-hidden="true" />
            </button>
          </UITooltip>
        </div>
        {/* Form — the takeaway number: fresh (+) or carrying fatigue (−).
            Carrying fatigue is NOT the destructive register. Form is
            fitness − fatigue, so it sits negative through any ordinary
            build block — every week whose acute load runs above the
            4-week base, which is most of them. Red at −1 contradicts
            this card's own legend two paragraphs down ("deep negative =
            time to ease off") and is the readiness theater
            `trainingLoad.ts`'s header rules out. The escalation already
            exists and is computed from the rolling-mean ratio that
            module trusts: the amber advisory below. So the chip states
            the state and leaves the verdict there. */}
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded-full font-mono tabular-nums ${
            formFresh
              ? "bg-success/10 text-success-strong"
              : "bg-muted/60 text-muted-foreground"
          }`}
        >
          Form {formatSigned(last.form)}
        </span>
      </div>

      {/* The `-strong` steps, not the bare identities: an identity is a
          FILL value (the bars and the curve below keep it) and measures
          3.87:1 for purple / 3.58:1 for coral on the light card, under
          the 4.5:1 floor these 12px words need. Same hue, same reading,
          a legible lightness. Pinned by identityColour.test.ts. */}
      {rangeRow}
      <p className="text-xs text-muted-foreground mb-2 font-mono tabular-nums">
        <span className="text-lifting-strong">
          Fitness {numberFmt(last.fitness)}
        </span>
        {" · "}
        <span>Fatigue {numberFmt(last.fatigue)}</span>
      </p>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart
          data={data}
          aria-label="Training load: fitness and fatigue curves with daily run and lift bars, in effort-weighted minutes"
          /* No side margins: a scale stands at each edge, so the first and
             last date labels centre over the room the scales leave rather
             than over the card's edge. */
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="25%"
        >
          <ChartAreaGradient
            id="load-fitness"
            color={THEME.brand}
            topOpacity={0.3}
          />
          {/* On the curves' scale, the default axis, so each gridline
              lands on one of its labels. */}
          <CartesianGrid {...CHART_GRID_PROPS} />
          {/* Keyed by the day, which every point has its own of, and
              labelled through the thinned `label`. Keyed by the label, the
              blank days would be one category, and the hover would match
              each of them to the first blank day and read out its numbers. */}
          <XAxis
            dataKey="dateKey"
            tickFormatter={(day: string) => labelByDay.get(day) ?? ""}
            interval={0}
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          {/* The curves' scale, on the left. Visible, and wide enough for
              three digits. `allowDecimals` off on both scales because an
              auto domain over a near-empty window otherwise labels the
              gridlines 0.5 / 1 / 1.5, and half a minute of training is
              not a reading anyone needs. */}
          <YAxis
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={32}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          {/* The day's scale, on the right: effort-minutes run to three
              figures on a heavy day. */}
          <YAxis
            yAxisId={DAY_AXIS}
            orientation="right"
            tick={CHART_AXIS_TICK}
            axisLine={false}
            tickLine={false}
            width={32}
            domain={[0, "auto"]}
            allowDecimals={false}
          />
          {/* Daily training, sport-coded: coral run + purple lift. */}
          <Bar
            dataKey="runLoad"
            yAxisId={DAY_AXIS}
            stackId="day"
            fill={THEME.running}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          <Bar
            dataKey="liftLoad"
            yAxisId={DAY_AXIS}
            stackId="day"
            fill={THEME.brand}
            fillOpacity={0.55}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="fitness"
            stroke={THEME.brand}
            strokeWidth={2}
            fill="url(#load-fitness)"
            dot={false}
            isAnimationActive={false}
          />
          {/* Fatigue, drawn last. Form is fitness - fatigue, so the header's
              chip is the gap between this line and the curve: widening
              when you are fresh, closing and crossing when the acute load
              runs over the base.

              Muted and dashed rather than a third identity colour: a
              derived reference line is not a sport, and coral already
              means running on the bars beneath it. */}
          <Line
            type="monotone"
            dataKey="fatigue"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          {/* One hover answers the header's figures for a given day, plus
              what was done that day, in the "Name: value" form the app's
              other chart readouts use. */}
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            separator={CHART_TOOLTIP_SEPARATOR}
            cursor={{ stroke: "currentColor", strokeOpacity: 0.15 }}
            labelFormatter={(_label, payload) => {
              const key = payload?.[0]?.payload?.dateKey;
              return typeof key === "string"
                ? formatBinLabel(key, "daily")
                : "";
            }}
            formatter={(value, name) => {
              const labels: Record<string, string> = {
                fitness: "Fitness",
                fatigue: "Fatigue",
                runLoad: "Run",
                liftLoad: "Lift",
              };
              const n = typeof name === "string" ? name : String(name ?? "");
              const v = typeof value === "number" ? value : Number(value ?? 0);
              return [numberFmt(v), labels[n] ?? n] as [string, string];
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* B1 — the one advisory line, quiet unless a guardrail fires.
          Warning register (THEME.warning), never a red risk score. */}
      {guardrails.advisory && (
        <p
          className="text-xs mt-2 rounded-lg px-3 py-2 leading-relaxed"
          style={{
            /* Text on the -strong step (identity is ~3.1:1 at 12px on the
               light tint); the tint concat must stay on the hex — an
               alpha suffix on a var() string is invalid CSS (DS1b). */
            color: "hsl(var(--warning-strong))",
            background: `${THEME.warning}14`,
          }}
        >
          {guardrails.advisory.line}
        </p>
      )}
    </div>
  );
}
