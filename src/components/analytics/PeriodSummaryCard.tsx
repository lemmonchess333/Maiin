import { useRef, useState, type KeyboardEvent } from "react";
import Card from "@/components/ui/Card";
import {
  distanceIn,
  distanceUnitLabel,
  type DistanceUnit,
} from "@/lib/distanceUnits";
import {
  summaryAxisLabel,
  summaryBinLabel,
  type SummaryBin,
  type SummaryChange,
  type SummaryGranularity,
} from "@/lib/periodSummary";
import { abbreviateK } from "@/utils/formatters";
import { cn } from "@/lib/utils";

/** What the bars can show: the three figures above them. */
export type SummaryMetric = "sessions" | "volume" | "distance";

export interface SummaryFigure {
  /** Which bars this figure puts on the chart. */
  metric: SummaryMetric;
  value: string;
  /** The words under the number: "sessions", "kg lifted", "km run". */
  unit: string;
  change: SummaryChange | null;
}

/** Drawing units; the SVG scales to the card's width. */
const CHART_W = 300;
const CHART_H = 88;
const GAP = 2;

function sessionsPhrase(lifts: number, runs: number): string {
  const parts = [
    `${lifts} ${lifts === 1 ? "lift" : "lifts"}`,
    `${runs} ${runs === 1 ? "run" : "runs"}`,
  ];
  return parts.join(" and ");
}

/** A bin's kilograms as the figure writes them: "12.3k kg", "850 kg". */
function kgPhrase(kg: number): string {
  return `${abbreviateK(kg)} kg`;
}

function distancePhrase(metres: number, unit: DistanceUnit): string {
  return `${distanceIn(metres, unit).toFixed(1)} ${distanceUnitLabel(unit)}`;
}

/**
 * The overview's period summary (DS3, "the month"): three headline
 * numbers with their change on the range before, then one of them bar by
 * bar. The numbers are the switch: sessions draw lifting purple under
 * running coral, with an outline on the current week up to what the plan
 * asks for; kilograms draw the lifting alone and distance the running
 * alone, so a climbing week or a quiet one shows in the measure the user
 * trains by, not only in how often they trained.
 *
 * A drop reads in the muted text, not red: fewer sessions after a hard
 * block is a plan working, and green, amber and red are kept for status.
 *
 * The bars take their colours from classes, not `fill="hsl(var(…))"`:
 * WKWebView does not reliably substitute var() in an SVG presentation
 * attribute (see WaterContainerIcon), and the chart would draw nothing on
 * the iPhone.
 */
export default function PeriodSummaryCard({
  title,
  comparedWith,
  sinceLabel,
  figures,
  bins,
  granularity,
  plannedThisWeek,
  distanceUnit,
}: {
  title: string;
  /**
   * "the 30 days before": what each change is measured against. Null for
   * an account younger than the range, whose range before it has nothing
   * in it to compare with; the subtitle then says when it began.
   */
  comparedWith: string | null;
  /** "Since you joined on 2 October", for an account younger than the range. */
  sinceLabel?: string;
  figures: readonly SummaryFigure[];
  bins: readonly SummaryBin[];
  granularity: SummaryGranularity;
  /**
   * Sessions the user's own plan asks for in a week. Outlined on the
   * current week's bar; 0 (no plan) draws no outline, rather than one the
   * app made up.
   */
  plannedThisWeek: number;
  /** The reader's distance unit, for the distance bars' description. */
  distanceUnit: DistanceUnit;
}) {
  const [metric, setMetric] = useState<SummaryMetric>("sessions");
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const showPlan =
    metric === "sessions" && granularity === "weekly" && plannedThisWeek > 0;
  const amount = (b: SummaryBin) =>
    metric === "volume"
      ? b.volumeKg
      : metric === "distance"
        ? b.distanceM
        : b.lifts + b.runs;
  const peak = Math.max(
    Number.EPSILON,
    ...bins.map((b) =>
      Math.max(amount(b), b.current && showPlan ? plannedThisWeek : 0)
    )
  );
  const slot = CHART_W / Math.max(bins.length, 1);
  const barW = Math.min(24, slot * 0.6);
  const scale = (CHART_H - GAP) / peak;
  /* Label every bar while they fit; past seven, every few, counted back
     from the current bar so it is always named. */
  const every = bins.length <= 7 ? 1 : Math.ceil(bins.length / 4);
  /* The first label under the chart; a month from another year names
     its year there. */
  const firstLabelled = (bins.length - 1) % every;

  const describeBin = (b: SummaryBin) => {
    const label = summaryBinLabel(b, granularity);
    if (metric === "volume") return `${label}: ${kgPhrase(b.volumeKg)}`;
    if (metric === "distance")
      return `${label}: ${distancePhrase(b.distanceM, distanceUnit)}`;
    return (
      `${label}: ${sessionsPhrase(b.lifts, b.runs)}` +
      (b.current && showPlan ? `, ${plannedThisWeek} planned` : "")
    );
  };
  const chartName =
    metric === "volume"
      ? "Kilograms lifted"
      : metric === "distance"
        ? "Distance run"
        : "Sessions";
  const selectedIndex = Math.max(
    0,
    figures.findIndex((f) => f.metric === metric)
  );

  function choose(index: number) {
    const figure = figures[index];
    if (!figure) return;
    optionRefs.current[index]?.focus();
    setMetric(figure.metric);
  }

  /* The WAI-ARIA radio group, as SegmentedControl implements it: the
     arrows move the choice and the focus together, wrapping. */
  function onKeyDown(event: KeyboardEvent, index: number) {
    const last = figures.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    choose(target);
  }

  return (
    <Card as="section" aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-h3 font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {comparedWith ? `Compared with ${comparedWith}` : sinceLabel}
        </p>
      </div>

      {/* The figures are the chart's switch. Their backgrounds reach into
          the card's padding, so the numbers still start on the title's
          edge. */}
      {/* Three across while 17em of card allows (a 320px phone at the
          designed size), one per row below that: at larger text "52.8k"
          was wider than a third of the card. */}
      <div className="@container -mx-2">
        <div
          role="radiogroup"
          aria-label="Show on the chart"
          className="grid grid-cols-1 @min-[17em]:grid-cols-3 gap-1"
        >
          {figures.map((f, i) => {
            const selected = i === selectedIndex;
            return (
              <button
                key={f.metric}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => choose(i)}
                onKeyDown={(event) => onKeyDown(event, i)}
                className={cn(
                  "min-w-0 rounded-xl px-2 py-2 text-left",
                  "active:scale-[0.97] motion-safe:transition-[background-color,transform]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  selected && "bg-muted"
                )}
              >
                <span className="block text-h2 font-extrabold font-mono tabular-nums leading-tight text-foreground">
                  {f.value}
                </span>
                <span className="block text-sm text-muted-foreground truncate">
                  {f.unit}
                </span>
                {f.change && comparedWith && (
                  <span
                    className={cn(
                      "block text-xs font-semibold",
                      f.change.direction === "up"
                        ? "text-success-strong"
                        : "text-muted-foreground"
                    )}
                  >
                    <span aria-hidden="true">
                      {f.change.direction === "up" ? "↑" : "↓"}{" "}
                      <span className="font-mono tabular-nums">
                        {f.change.text}
                      </span>
                    </span>
                    <span className="sr-only">
                      {f.change.direction === "up" ? "Up" : "Down"}{" "}
                      {f.change.text} on {comparedWith}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {bins.length > 0 && (
        <div className="@container">
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            role="img"
            aria-label={`${chartName}: ${bins.map(describeBin).join("; ")}`}
            data-metric={metric}
          >
            {bins.map((b, i) => {
              const x = i * slot + (slot - barW) / 2;
              const done = amount(b);
              const planH =
                b.current && showPlan && plannedThisWeek > done
                  ? plannedThisWeek * scale
                  : 0;
              const liftH =
                metric === "volume"
                  ? b.volumeKg * scale
                  : metric === "sessions"
                    ? b.lifts * scale
                    : 0;
              const runH =
                metric === "distance"
                  ? b.distanceM * scale
                  : metric === "sessions"
                    ? b.runs * scale
                    : 0;
              return (
                <g key={b.key}>
                  {planH > 0 && (
                    <rect
                      x={x + 0.75}
                      y={CHART_H - planH + 0.75}
                      width={barW - 1.5}
                      height={planH - 1.5}
                      rx={4}
                      fill="none"
                      className="stroke-muted-foreground"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                  )}
                  {done === 0 && (
                    <rect
                      x={x}
                      y={CHART_H - 3}
                      width={barW}
                      height={3}
                      rx={1.5}
                      className="fill-muted"
                    />
                  )}
                  {liftH > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - liftH}
                      width={barW}
                      height={Math.max(liftH, 1)}
                      rx={4}
                      className="fill-lifting"
                    />
                  )}
                  {runH > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - liftH - runH}
                      width={barW}
                      height={Math.max(runH - (liftH > 0 ? GAP : 0), 1)}
                      rx={4}
                      className="fill-running"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div
            className="mt-1 grid text-xs text-muted-foreground"
            style={{
              gridTemplateColumns: `repeat(${bins.length}, minmax(0, 1fr))`,
            }}
            aria-hidden="true"
          >
            {bins.map((b, i) => {
              const fromEnd = bins.length - 1 - i;
              const shown = fromEnd % every === 0;
              const end = i === firstLabelled || fromEnd === 0;
              return (
                <span
                  key={b.key}
                  /* Wraps within its bar's slot ("14 / Sept") rather
                     than running into the next label, as the dates did
                     at larger text. Under 11em of card only the two
                     ends keep theirs: even wrapped, "Sept" was wider
                     than a bar's slot at double size. */
                  className={cn(
                    "min-w-0 text-center leading-tight",
                    !end && "invisible @min-[11em]:visible",
                    b.current && "font-semibold text-foreground",
                    // The last label may be wider than its bar's slot.
                    i === bins.length - 1 && every > 1 && "text-right"
                  )}
                >
                  {shown
                    ? summaryAxisLabel(b, granularity, i === firstLabelled)
                    : ""}
                </span>
              );
            })}
          </div>
          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {metric !== "distance" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-lifting" />
                {metric === "volume" ? "kg lifted" : "Lifts"}
              </span>
            )}
            {metric !== "volume" && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-running" />
                {metric === "distance"
                  ? `${distanceUnitLabel(distanceUnit)} run`
                  : "Runs"}
              </span>
            )}
            {showPlan && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full border border-dashed border-muted-foreground" />
                Planned
              </span>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
