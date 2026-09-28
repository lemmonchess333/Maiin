import Card from "@/components/ui/Card";
import SectionHeading from "@/components/ui/SectionHeading";
import type {
  WeekBreakdown,
  WeekMeasure,
} from "@/lib/performanceWeekBreakdown";
import { cn } from "@/lib/utils";
import { formatCalories } from "@/utils/formatNutrition";

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
      className="relative h-2 rounded-full bg-muted"
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
 * The Performance page's account of its score: what the seven days
 * actually held, against the user's usual week. It replaces the server's
 * insight bullets, which were templates chosen from these same figures
 * ("…great progression"), and one of which cited sleep the app never
 * records. The figures come from the score's own document, so the page
 * cannot describe a different week from the one it scored.
 */
export default function PerformanceWeekBreakdown({
  breakdown,
}: {
  breakdown: WeekBreakdown;
}) {
  const { measures, food } = breakdown;
  if (measures.length === 0 && !food) return null;

  return (
    <Card as="section" aria-label="The last 7 days" className="space-y-3">
      <SectionHeading size="compact" as="h3">
        The last 7 days
      </SectionHeading>
      <ul className="space-y-4">
        {measures.map((m) => (
          <li key={m.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
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
        {food && (
          <li className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-nutrition"
                />
                Food
              </span>
              <span className="text-base font-bold font-mono tabular-nums text-foreground">
                {food.daysLogged} of 7 days
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {formatCalories(food.caloriesPerDay)}
              </span>{" "}
              kcal and{" "}
              <span className="font-mono tabular-nums">
                {food.proteinPerDay}
              </span>{" "}
              g protein a day, on the days logged
            </p>
          </li>
        )}
      </ul>
    </Card>
  );
}
