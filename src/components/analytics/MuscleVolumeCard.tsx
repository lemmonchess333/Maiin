import Card from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  JUDGEMENT_MUSCLE_LABEL,
  type VolumeStatus,
} from "@/features/program/volumeModel";
import type { MuscleWeekVolume } from "@/lib/performedVolume";

/** One decimal only when there is one: "12", "7.5". */
const setsText = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);

/** Past this many, the summary counts them: a list of eight names in the
 *  warning colour reads as an alarm, and the rows below already say which. */
const NAMED_BELOW = 3;

const DOT: Record<VolumeStatus, string> = {
  low: "bg-warning",
  optimal: "bg-lifting",
  high: "bg-lifting",
};

/**
 * Sets per muscle on the Lifting page (DS3): the sets a lifter actually
 * did each week, per muscle, against the range their focus aims for.
 *
 * The heat map below it shows where the work went; it cannot say whether
 * it was enough. "Legs 64 sets" reads as plenty until it is split into
 * quads, hamstrings, glutes and calves, one of which may be getting none.
 * These are the same groups and ranges the lift plan is built to (the
 * volume model's own), so what this flags is what the plan would.
 *
 * Below the range is the finding and takes the warning colour; above it
 * is information, not alarm, as on the plan's own volume card, so it
 * keeps the lifting colour and says "Above".
 */
export default function MuscleVolumeCard({
  rows,
  weeks,
  focus,
}: {
  rows: readonly MuscleWeekVolume[];
  /** How many whole weeks the averages cover; 0 before the user's first
   *  whole week, when the card says so rather than averaging a part. */
  weeks: number;
  /** The user's lifting focus, as Settings names it: "Build muscle". */
  focus: string;
}) {
  if (weeks === 0) {
    return (
      <Card as="section" aria-label="Sets per muscle" className="space-y-1">
        <h2 className="text-h3 font-bold text-foreground">Sets per muscle</h2>
        <p className="text-sm text-muted-foreground">
          After your first full week
        </p>
      </Card>
    );
  }
  if (rows.length === 0) return null;
  const axisMax =
    Math.max(...rows.map((r) => Math.max(r.landmark.high, r.setsPerWeek))) *
    1.08;
  const pct = (n: number) => `${Math.min(100, (n / axisMax) * 100)}%`;
  const below = rows.filter((r) => r.status === "low");

  return (
    <Card as="section" aria-label="Sets per muscle" className="space-y-3">
      <div>
        <h2 className="text-h3 font-bold text-foreground">Sets per muscle</h2>
        <p className="text-sm text-muted-foreground">
          {weeks === 1
            ? "Your last full week"
            : `A week, averaged over ${weeks} full weeks`}
          . Your focus: {focus}.
        </p>
      </div>

      <p
        className={cn(
          "text-sm font-semibold",
          below.length > 0 ? "text-warning-strong" : "text-foreground"
        )}
      >
        {below.length === 0
          ? "Every muscle is in its range"
          : below.length > NAMED_BELOW
            ? `${below.length} muscles below their range`
            : `Below range: ${below
                .map((r) => JUDGEMENT_MUSCLE_LABEL[r.muscle].toLowerCase())
                .join(", ")}`}
      </p>

      {/* Under 15em of card (larger text) a row's fixed widths alone were
          wider than the card. The row becomes two lines: the name across
          the whole width (a column beside "Below" left "Hamstrings" too
          narrow), then the range bar, the count and the status word.
          Wide-first. */}
      <ul className="@container space-y-2">
        {rows.map((row) => {
          const label = JUDGEMENT_MUSCLE_LABEL[row.muscle];
          const verdict =
            row.status === "low"
              ? "below range"
              : row.status === "high"
                ? "above range"
                : "in range";
          return (
            <li
              key={row.muscle}
              className="flex items-center gap-3 @max-[15em]:grid @max-[15em]:grid-cols-[minmax(0,1fr)_auto_auto] @max-[15em]:gap-y-1"
            >
              <span className="sr-only">
                {`${label}: ${setsText(row.setsPerWeek)} sets a week, ${verdict} of ${row.landmark.low} to ${row.landmark.high}`}
              </span>
              <span
                className="w-24 shrink-0 truncate text-sm text-foreground @max-[15em]:col-span-3 @max-[15em]:row-start-1 @max-[15em]:w-auto @max-[15em]:whitespace-normal @max-[15em]:break-words @max-[15em]:hyphens-auto"
                aria-hidden="true"
              >
                {label}
              </span>
              <div
                className="relative h-2 flex-1 rounded-full bg-muted @max-[15em]:col-start-1 @max-[15em]:row-start-2"
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 rounded-full bg-lifting/30"
                  style={{
                    left: pct(row.landmark.low),
                    width: `calc(${pct(row.landmark.high)} - ${pct(row.landmark.low)})`,
                  }}
                />
                <div
                  className={cn(
                    "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card",
                    DOT[row.status]
                  )}
                  style={{ left: pct(row.setsPerWeek) }}
                  data-status={row.status}
                />
              </div>
              <span
                className="w-8 shrink-0 text-right text-sm font-semibold font-mono tabular-nums text-foreground @max-[15em]:col-start-2 @max-[15em]:row-start-2 @max-[15em]:w-auto"
                aria-hidden="true"
              >
                {setsText(row.setsPerWeek)}
              </span>
              <span
                className={cn(
                  "w-12 shrink-0 text-right text-xs font-semibold @max-[15em]:col-start-3 @max-[15em]:row-start-2 @max-[15em]:w-auto",
                  row.status === "low"
                    ? "text-warning-strong"
                    : "text-lifting-strong"
                )}
                aria-hidden="true"
              >
                {row.status === "low"
                  ? "Below"
                  : row.status === "high"
                    ? "Above"
                    : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <p
        className="flex items-center gap-2 text-xs text-muted-foreground"
        aria-hidden="true"
      >
        <span className="h-2 w-5 rounded-full bg-lifting/30" />
        Target range for your focus
      </p>
    </Card>
  );
}
