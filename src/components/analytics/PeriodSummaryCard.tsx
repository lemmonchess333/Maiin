import Card from "@/components/ui/Card";
import { parseLocalDate } from "@/lib/dateHelpers";
import { formatBinLabel } from "@/lib/chartGranularity";
import type {
  SummaryBin,
  SummaryChange,
  SummaryGranularity,
} from "@/lib/periodSummary";
import { formatDayMonth } from "@/utils/formatters";
import { cn } from "@/lib/utils";

export interface SummaryFigure {
  value: string;
  /** The words under the number: "sessions", "kg lifted", "km run". */
  unit: string;
  change: SummaryChange | null;
}

/** Drawing units; the SVG scales to the card's width. */
const CHART_W = 300;
const CHART_H = 88;
const GAP = 2;

function binLabel(bin: SummaryBin, granularity: SummaryGranularity): string {
  if (granularity === "daily") {
    return bin.current
      ? "Today"
      : parseLocalDate(bin.key).toLocaleDateString("en-GB", {
          weekday: "short",
        });
  }
  if (granularity === "weekly") {
    return bin.current ? "This week" : formatDayMonth(parseLocalDate(bin.key));
  }
  return bin.current ? "This month" : formatBinLabel(bin.key, "monthly");
}

function sessionsPhrase(lifts: number, runs: number): string {
  const parts = [
    `${lifts} ${lifts === 1 ? "lift" : "lifts"}`,
    `${runs} ${runs === 1 ? "run" : "runs"}`,
  ];
  return parts.join(" and ");
}

/**
 * The overview's period summary (DS3, "the month"): three headline
 * numbers with their change on the range before, then the sessions bar by
 * bar — lifting purple under running coral, and for the current week an
 * outline up to what the plan asks for.
 *
 * A drop reads in the muted text, not red: fewer sessions after a hard
 * block is a plan working, and green, amber and red are kept for status.
 */
export default function PeriodSummaryCard({
  title,
  comparedWith,
  figures,
  bins,
  granularity,
  plannedThisWeek,
}: {
  title: string;
  /** "the 30 days before" — what each change is measured against. */
  comparedWith: string;
  figures: readonly SummaryFigure[];
  bins: readonly SummaryBin[];
  granularity: SummaryGranularity;
  /**
   * Sessions the user's own plan asks for in a week. Outlined on the
   * current week's bar; 0 (no plan) draws no outline, rather than one the
   * app made up.
   */
  plannedThisWeek: number;
}) {
  const showPlan = granularity === "weekly" && plannedThisWeek > 0;
  const peak = Math.max(
    1,
    ...bins.map((b) =>
      Math.max(b.lifts + b.runs, b.current && showPlan ? plannedThisWeek : 0)
    )
  );
  const slot = CHART_W / Math.max(bins.length, 1);
  const barW = Math.min(24, slot * 0.6);
  const unit = (CHART_H - GAP) / peak;
  /* Label every bar while they fit; past seven, every few, counted back
     from the current bar so it is always named. */
  const every = bins.length <= 7 ? 1 : Math.ceil(bins.length / 4);
  const described = bins
    .map(
      (b) =>
        `${binLabel(b, granularity)}: ${sessionsPhrase(b.lifts, b.runs)}` +
        (b.current && showPlan ? `, ${plannedThisWeek} planned` : "")
    )
    .join("; ");

  return (
    <Card as="section" aria-label={title} className="space-y-4">
      <div>
        <h2 className="text-h3 font-bold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">
          Compared with {comparedWith}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {figures.map((f) => (
          <div key={f.unit} className="min-w-0">
            <p className="text-h2 font-extrabold font-mono tabular-nums leading-tight text-foreground">
              {f.value}
            </p>
            <p className="text-sm text-muted-foreground truncate">{f.unit}</p>
            {f.change && (
              <p
                className={cn(
                  "text-xs font-semibold",
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
                  {f.change.direction === "up" ? "Up" : "Down"} {f.change.text}{" "}
                  on {comparedWith}
                </span>
              </p>
            )}
          </div>
        ))}
      </div>

      {bins.length > 0 && (
        <div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            width="100%"
            role="img"
            aria-label={`Sessions: ${described}`}
          >
            {bins.map((b, i) => {
              const x = i * slot + (slot - barW) / 2;
              const liftH = b.lifts * unit;
              const runH = b.runs * unit;
              const done = b.lifts + b.runs;
              const planH =
                b.current && showPlan && plannedThisWeek > done
                  ? plannedThisWeek * unit
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
                      stroke="hsl(var(--muted-foreground))"
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
                      fill="hsl(var(--muted))"
                    />
                  )}
                  {liftH > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - liftH}
                      width={barW}
                      height={liftH}
                      rx={4}
                      fill="hsl(var(--lifting))"
                    />
                  )}
                  {runH > 0 && (
                    <rect
                      x={x}
                      y={CHART_H - liftH - runH}
                      width={barW}
                      height={Math.max(runH - (liftH > 0 ? GAP : 0), 1)}
                      rx={4}
                      fill="hsl(var(--running))"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div
            className="mt-1 grid text-xs text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${bins.length}, 1fr)` }}
            aria-hidden="true"
          >
            {bins.map((b, i) => {
              const fromEnd = bins.length - 1 - i;
              const shown = fromEnd % every === 0;
              return (
                <span
                  key={b.key}
                  className={cn(
                    "whitespace-nowrap text-center",
                    b.current && "font-semibold text-foreground",
                    // The last label may be wider than its bar's slot.
                    i === bins.length - 1 && every > 1 && "text-right"
                  )}
                >
                  {shown ? binLabel(b, granularity) : ""}
                </span>
              );
            })}
          </div>
          <div
            className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-lifting" />
              Lifts
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-running" />
              Runs
            </span>
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
