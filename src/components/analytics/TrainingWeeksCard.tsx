import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import Card from "@/components/ui/Card";
import {
  summaryAxisLabel,
  summaryBinLabel,
  type SummaryBin,
  type SummaryGranularity,
} from "@/lib/periodSummary";
import type { BinReading, TrainingFigure } from "@/lib/trainingWeeks";
import { T5_BARS_MIN_COUNT } from "@/lib/dataConfidence";
import { haptic } from "@/lib/haptic";
import { cn } from "@/lib/utils";

/** Drawing units; the SVG scales to the card's width. */
const CHART_W = 300;
const CHART_H = 96;

/** How far a finger moves sideways before a press becomes a slide. A tap
 *  wobbles a few pixels, and under this it stays a tap on its bar. */
const SLIDE_START_PX = 6;
/** A click this soon after a slide ends belongs to the slide. */
const SLIDE_CLICK_MS = 400;

const SPORT_BAR = {
  lifting: "fill-lifting",
  running: "fill-running",
} as const;

/** A bin's name in a sentence: "This week so far", "Week of 14 Sept". */
function binPhrase(bin: SummaryBin, granularity: SummaryGranularity): string {
  const label = summaryBinLabel(bin, granularity);
  if (bin.current) return `${label} so far`;
  return granularity === "weekly" ? `Week of ${label}` : label;
}

/**
 * A sport's range, bar by bar (DS3): the Lifting page's kilograms and the
 * Running page's distance, a bar a week, with the range's weekly average
 * drawn across them.
 *
 * The page it replaced ran thirty daily bars under two stat tiles, so a
 * month read as push, pull and legs heights rather than as four weeks,
 * and the tiles' "↓2% vs last" was a machine's reading of noise. Weeks are
 * the unit people train in, and the average line answers the one question
 * a bar on its own cannot: was that a big week, for me?
 *
 * The average is the page's own (`usualBinAmount`): whole weeks only, so
 * this week's bar, half done, stands against it without dragging it down.
 * A range of days has no line, since an average day is not how anyone
 * trains.
 *
 * Tap a bar to read it, or press and slide along the chart. Three months
 * draw fourteen bars, which leaves each about 23 px to aim at, so the
 * whole chart takes the touch: the bar under the finger is read out
 * below the chart, where the finger does not cover it, with a light tick
 * as each one passes. An up or down swipe still scrolls the page
 * (`touch-pan-y`). The one being read is drawn full and the rest stepped
 * back, the emphasis Analytics' bar charts have always used, and it
 * starts on the bin you are in now. Each bar is a button, for screen
 * readers, and the bars are one Tab stop: the arrow keys move between
 * them.
 *
 * Colours come from classes, not `fill="hsl(var(…))"`, for the WKWebView
 * reason `PeriodSummaryCard` gives.
 */
export default function TrainingWeeksCard({
  title,
  subtitle,
  figures,
  bins,
  granularity,
  sport,
  reading,
  average,
  averageText,
  footer,
  onPick,
}: {
  title: string;
  subtitle: string;
  figures: readonly TrainingFigure[];
  bins: readonly SummaryBin[];
  granularity: SummaryGranularity;
  sport: keyof typeof SPORT_BAR;
  /** What a bar measures, and how a bar reads in words. */
  reading: BinReading;
  /** The weekly (or monthly) average, or null to draw no line. */
  average: number | null;
  /** The average in words, beside its key: "28.9k kg". */
  averageText: string;
  footer?: ReactNode;
  /** Told when a bar is picked, for the page's chart-tap event. */
  onPick?: (bin: SummaryBin) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const targetsRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  /** The press in progress: its pointer, where it started, the bar it is
   *  on, and whether it has become a slide. */
  const slideRef = useRef<{
    id: number;
    x: number;
    key: string;
    sliding: boolean;
  } | null>(null);
  const slideEndedAtRef = useRef(-Infinity);
  const { amount, describe, countText } = reading;
  const sessions = bins.reduce((n, b) => n + reading.count(b), 0);
  const hasChart = sessions >= T5_BARS_MIN_COUNT;
  const selected =
    bins.find((b) => b.key === picked) ?? bins[bins.length - 1] ?? null;

  const showAverage = granularity !== "daily" && average !== null;
  /* Headroom over the tallest bar, so a steady run of weeks does not sit
     flush with the top and swallow the average line along its tops. */
  const peak =
    Math.max(
      Number.EPSILON,
      ...bins.map(amount),
      showAverage ? (average ?? 0) : 0
    ) * 1.12;
  const slot = CHART_W / Math.max(bins.length, 1);
  const barW = Math.min(24, slot * 0.6);
  const scale = (CHART_H - 2) / peak;
  const every = bins.length <= 7 ? 1 : Math.ceil(bins.length / 4);
  const averageY = showAverage ? CHART_H - (average ?? 0) * scale : 0;
  const averageLabel =
    granularity === "monthly" ? "Monthly average" : "Weekly average";
  /* The first label under the chart; a month from another year names
     its year there. */
  const firstLabelled = (bins.length - 1) % every;

  const pick = (b: SummaryBin) => {
    setPicked(b.key);
    onPick?.(b);
  };

  /** The bar under a point on the chart, or null before layout. */
  const binAt = (clientX: number): SummaryBin | null => {
    const el = targetsRef.current;
    if (!el || bins.length === 0) return null;
    const { left, width } = el.getBoundingClientRect();
    if (width <= 0) return null;
    const i = Math.floor(((clientX - left) / width) * bins.length);
    return bins[Math.min(bins.length - 1, Math.max(0, i))];
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0 || !selected) return;
    slideRef.current = {
      id: e.pointerId,
      x: e.clientX,
      key: selected.key,
      sliding: false,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const slide = slideRef.current;
    if (!slide || slide.id !== e.pointerId) return;
    if (!slide.sliding) {
      if (Math.abs(e.clientX - slide.x) < SLIDE_START_PX) return;
      slide.sliding = true;
      // Keep reading the finger after it passes the chart's edge.
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const b = binAt(e.clientX);
    if (!b || b.key === slide.key) return;
    slide.key = b.key;
    setPicked(b.key);
    haptic("light");
  };

  /* A slide counts as one pick, told when it ends. A tap is left to the
     bar's own click, as before. */
  const endSlide = (e: PointerEvent<HTMLDivElement>) => {
    const slide = slideRef.current;
    if (!slide || slide.id !== e.pointerId) return;
    slideRef.current = null;
    if (!slide.sliding) return;
    slideEndedAtRef.current = performance.now();
    const b = bins.find((x) => x.key === slide.key);
    if (b) onPick?.(b);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = bins.length - 1;
    const target =
      e.key === "ArrowRight"
        ? Math.min(last, i + 1)
        : e.key === "ArrowLeft"
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    if (target === i) return;
    pick(bins[target]);
    buttonsRef.current[target]?.focus();
  };

  return (
    <Card as="section" aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-h3 font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <span className="block whitespace-nowrap text-h2 font-extrabold font-mono tabular-nums leading-tight text-foreground">
              {f.value}
            </span>
            <span className="block text-sm text-muted-foreground truncate">
              {f.label}
            </span>
          </div>
        ))}
      </div>

      {!hasChart && (
        <p className="text-sm text-muted-foreground">{reading.chartCaveat}</p>
      )}

      {hasChart && selected && (
        <div>
          <div className="relative">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              width="100%"
              aria-hidden="true"
              focusable="false"
              className="block"
            >
              {bins.map((b, i) => {
                const x = i * slot + (slot - barW) / 2;
                const h = amount(b) * scale;
                const dim = b.key !== selected.key;
                return h > 0 ? (
                  <rect
                    key={b.key}
                    data-bin={b.key}
                    x={x}
                    y={CHART_H - h}
                    width={barW}
                    height={Math.max(h, 1)}
                    rx={4}
                    className={SPORT_BAR[sport]}
                    fillOpacity={dim ? 0.45 : 1}
                  />
                ) : (
                  <rect
                    key={b.key}
                    data-bin={b.key}
                    x={x}
                    y={CHART_H - 3}
                    width={barW}
                    height={3}
                    rx={1.5}
                    className="fill-muted"
                  />
                );
              })}
              {showAverage && (
                <line
                  data-testid="weekly-average"
                  x1={0}
                  x2={CHART_W}
                  y1={averageY}
                  y2={averageY}
                  className="stroke-foreground"
                  strokeOpacity={0.55}
                  strokeWidth={1.25}
                  strokeDasharray="4 3"
                />
              )}
            </svg>
            {/* One button per bar, laid over it: the whole column is the
                target, not the sliver of a short week's bar. The layer
                under them follows a slide across the columns, so the
                swipe between tabs leaves it alone (`data-no-page-swipe`). */}
            <div
              ref={targetsRef}
              data-testid="bar-targets"
              data-no-page-swipe
              className="absolute inset-0 grid touch-pan-y select-none"
              style={{ gridTemplateColumns: `repeat(${bins.length}, 1fr)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endSlide}
              onPointerCancel={endSlide}
            >
              {bins.map((b, i) => (
                <button
                  key={b.key}
                  ref={(el) => {
                    buttonsRef.current[i] = el;
                  }}
                  type="button"
                  tabIndex={b.key === selected.key ? 0 : -1}
                  aria-pressed={b.key === selected.key}
                  aria-label={`${binPhrase(b, granularity)}: ${describe(amount(b))}, ${countText(b)}`}
                  onClick={() => {
                    if (
                      performance.now() - slideEndedAtRef.current <
                      SLIDE_CLICK_MS
                    )
                      return;
                    pick(b);
                  }}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              ))}
            </div>
          </div>
          <div
            className="mt-1 grid text-xs text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${bins.length}, 1fr)` }}
            aria-hidden="true"
          >
            {bins.map((b, i) => {
              const shown = (bins.length - 1 - i) % every === 0;
              return (
                <span
                  key={b.key}
                  className={cn(
                    "whitespace-nowrap text-center",
                    b.key === selected.key && "font-semibold text-foreground",
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

          <p
            className="mt-3 text-sm text-foreground"
            aria-live="polite"
            data-testid="bin-reading"
          >
            <span className="font-semibold">
              {binPhrase(selected, granularity)}
            </span>
            :{" "}
            <span className="font-mono tabular-nums font-semibold">
              {describe(amount(selected))}
            </span>{" "}
            <span className="text-muted-foreground">
              · {countText(selected)}
            </span>
          </p>
          {showAverage && (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className="w-4 border-t-[1.5px] border-dashed border-foreground/60"
                aria-hidden="true"
              />
              {averageLabel}{" "}
              <span className="font-mono tabular-nums font-semibold text-foreground">
                {averageText}
              </span>
            </p>
          )}
        </div>
      )}

      {footer}
    </Card>
  );
}
