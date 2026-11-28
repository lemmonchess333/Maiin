import type { WeekMeasure } from "@/lib/performanceWeekBreakdown";
import { cn } from "@/lib/utils";

/** Headroom past the larger of the two, so neither end sits on the edge. */
const SCALE_HEADROOM = 1.15;

const DOT: Record<WeekMeasure["key"], string> = {
  lifting: "bg-lifting",
  running: "bg-running",
};

/**
 * This window's figure as a bar, with a tick at the user's usual week:
 * above or below it reads at a glance, as Strava's weekly range does.
 * Decorative; the words beside it carry both numbers.
 */
function AgainstUsual({ measure }: { measure: WeekMeasure }) {
  if (measure.usual === null) return null;
  const scale = Math.max(measure.value, measure.usual) * SCALE_HEADROOM;
  if (scale <= 0) return null;
  const valuePct = (measure.value / scale) * 100;
  const usualPct = (measure.usual / scale) * 100;
  return (
    <div
      aria-hidden="true"
      data-testid={`against-usual-${measure.key}`}
      className="relative h-2 rounded-full track-cut"
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          DOT[measure.key]
        )}
        style={{ width: `${valuePct}%` }}
      />
      <div
        className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
        style={{ left: `${usualPct}%` }}
        data-usual-tick=""
      />
    </div>
  );
}

/**
 * The lead of Progress (App1 Q10): what the last seven days held, lifting
 * and running, against the user's usual week. The figures come from the
 * score's own document (`performanceWeekBreakdown`), so the page reads one
 * load model, the score's (Q16), and cannot describe a different week from
 * the one the verdict above it was made from.
 */
export default function LoadAgainstUsual({
  measures,
}: {
  measures: WeekMeasure[];
}) {
  if (measures.length === 0) return null;
  return (
    <ul className="space-y-4" aria-label="Against your usual week">
      {measures.map((m) => (
        <li key={m.key} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
              <span
                aria-hidden="true"
                className={cn("size-2 rounded-full", DOT[m.key])}
              />
              {m.label}
            </span>
            <span className="text-base font-bold font-mono tabular-nums text-foreground">
              {m.valueText}
            </span>
          </div>
          <AgainstUsual measure={m} />
          <p className="text-xs text-muted-foreground">
            {m.detail}
            {m.usualText && (
              <>
                {" · "}
                usual week{" "}
                <span className="font-mono tabular-nums">{m.usualText}</span>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
